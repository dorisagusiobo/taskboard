import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from database import BoardStore
from openrouter_client import (
    OpenRouterConfigurationError,
    OpenRouterRequestError,
)


class FakeOpenRouterClient:
    def __init__(self):
        self.response = json.dumps({"reply": "No changes.", "operations": []})
        self.error: Exception | None = None
        self.calls: list[tuple[list[dict[str, str]], dict]] = []

    def complete_structured(self, messages, schema):
        self.calls.append((messages, schema))
        if self.error:
            raise self.error
        return self.response


@pytest.fixture
def fake_openrouter_client() -> FakeOpenRouterClient:
    return FakeOpenRouterClient()


@pytest.fixture
def ai_client(database_path: Path, fake_openrouter_client: FakeOpenRouterClient):
    with TestClient(
        main.create_app(
            session_secret="test-session-secret",
            database_path=database_path,
            openrouter_client_factory=lambda: fake_openrouter_client,
        )
    ) as client:
        yield client


@pytest.fixture
def authenticated_ai_client(ai_client: TestClient) -> TestClient:
    response = ai_client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return ai_client


@pytest.fixture
def board_id(authenticated_ai_client: TestClient) -> int:
    boards = authenticated_ai_client.get("/api/boards").json()
    return boards[0]["id"]


def test_ai_chat_requires_authentication_before_calling_provider(
    ai_client: TestClient, fake_openrouter_client: FakeOpenRouterClient
):
    response = ai_client.post("/api/boards/1/ai/chat", json={"message": "Hello"})

    assert response.status_code == 401
    assert fake_openrouter_client.calls == []


def test_ai_chat_sends_board_history_and_returns_no_change_reply(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    board_id: int,
):
    board = authenticated_ai_client.get(f"/api/boards/{board_id}").json()

    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={
            "message": "What is on the board?",
            "history": [
                {"role": "user", "content": "Earlier question"},
                {"role": "assistant", "content": "Earlier answer"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "No changes.", "board": None}
    messages, schema = fake_openrouter_client.calls[0]
    assert (
        json.dumps(board, separators=(",", ":"), sort_keys=True)
        in messages[0]["content"]
    )
    assert messages[-3:] == [
        {"role": "user", "content": "Earlier question"},
        {"role": "assistant", "content": "Earlier answer"},
        {"role": "user", "content": "What is on the board?"},
    ]
    assert schema["required"] == ["reply", "operations"]


def test_ai_chat_applies_multiple_operations_and_returns_canonical_board(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    board_id: int,
):
    board = authenticated_ai_client.get(f"/api/boards/{board_id}").json()
    source = board["columns"][0]
    target = board["columns"][1]
    edited_card = source["cards"][0]
    moved_card = source["cards"][1]
    fake_openrouter_client.response = json.dumps(
        {
            "reply": "Created, edited, and moved cards.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": target["id"],
                    "title": "AI card",
                    "details": "AI details",
                    "due_date": "",
                    "labels": "",
                },
                {
                    "type": "edit_card",
                    "card_id": edited_card["id"],
                    "title": "AI edit",
                    "details": None,
                    "due_date": None,
                    "labels": None,
                },
                {
                    "type": "move_card",
                    "card_id": moved_card["id"],
                    "column_id": target["id"],
                    "position": 0,
                },
            ],
        }
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat", json={"message": "Update the board"}
    )

    assert response.status_code == 200
    response_board = response.json()["board"]
    assert response.json()["reply"] == "Created, edited, and moved cards."
    assert any(
        card["title"] == "AI edit" for card in response_board["columns"][0]["cards"]
    )
    assert response_board["columns"][1]["cards"][0]["id"] == moved_card["id"]
    assert any(
        card["title"] == "AI card" for card in response_board["columns"][1]["cards"]
    )
    assert (
        authenticated_ai_client.get(f"/api/boards/{board_id}").json() == response_board
    )


def test_ai_chat_rolls_back_all_operations_for_a_stale_id(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    board_id: int,
):
    original = authenticated_ai_client.get(f"/api/boards/{board_id}").json()
    card = original["columns"][0]["cards"][0]
    fake_openrouter_client.response = json.dumps(
        {
            "reply": "Attempted update.",
            "operations": [
                {
                    "type": "edit_card",
                    "card_id": card["id"],
                    "title": "Must roll back",
                    "details": None,
                    "due_date": None,
                    "labels": None,
                },
                {
                    "type": "move_card",
                    "card_id": 99999,
                    "column_id": original["columns"][1]["id"],
                    "position": 0,
                },
            ],
        }
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat", json={"message": "Update cards"}
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "AI response could not be applied"}
    assert authenticated_ai_client.get(f"/api/boards/{board_id}").json() == original


def test_ai_chat_cannot_mutate_another_users_board(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    database_path: Path,
    board_id: int,
):
    store = BoardStore(database_path)
    store.register_user("other", "password")
    user_board = authenticated_ai_client.get(f"/api/boards/{board_id}").json()
    other_board_id = store.list_boards("other")[0]["id"]
    other_board = store.get_board("other", other_board_id)
    other_card = other_board["columns"][0]["cards"][0]
    fake_openrouter_client.response = json.dumps(
        {
            "reply": "Attempted cross-user update.",
            "operations": [
                {
                    "type": "edit_card",
                    "card_id": other_card["id"],
                    "title": "Stolen",
                    "details": None,
                    "due_date": None,
                    "labels": None,
                }
            ],
        }
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": f"Edit card {other_card['id']}"},
    )

    assert response.status_code == 422
    assert store.get_board("user", board_id) == user_board
    assert store.get_board("other", other_board_id) == other_board


def test_ai_chat_cannot_target_another_users_board_id(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    database_path: Path,
):
    store = BoardStore(database_path)
    store.register_user("other", "password")
    other_board_id = store.list_boards("other")[0]["id"]

    response = authenticated_ai_client.post(
        f"/api/boards/{other_board_id}/ai/chat", json={"message": "Hello"}
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("provider_response", "provider_error", "detail"),
    [
        (
            "not json",
            None,
            "AI service returned an invalid response",
        ),
        (
            None,
            OpenRouterRequestError("secret upstream detail"),
            "AI service is unavailable",
        ),
    ],
)
def test_ai_chat_maps_provider_and_response_failures_without_changing_board(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    board_id: int,
    provider_response: str | None,
    provider_error: Exception | None,
    detail: str,
):
    original = authenticated_ai_client.get(f"/api/boards/{board_id}").json()
    if provider_response is not None:
        fake_openrouter_client.response = provider_response
    fake_openrouter_client.error = provider_error

    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat", json={"message": "Update the board"}
    )

    assert response.status_code == 502
    assert response.json() == {"detail": detail}
    assert "secret" not in response.text
    assert authenticated_ai_client.get(f"/api/boards/{board_id}").json() == original


def test_ai_chat_maps_missing_configuration(database_path: Path):
    def missing_client():
        raise OpenRouterConfigurationError("OPENROUTER_API_KEY is not configured")

    with TestClient(
        main.create_app(
            session_secret="test-session-secret",
            database_path=database_path,
            openrouter_client_factory=missing_client,
        )
    ) as client:
        client.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        )
        board_id = client.get("/api/boards").json()[0]["id"]
        response = client.post(
            f"/api/boards/{board_id}/ai/chat", json={"message": "Hello"}
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "AI service is not configured"}


def test_ai_chat_rejects_more_than_twenty_history_messages_without_calling_provider(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    board_id: int,
):
    response = authenticated_ai_client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={
            "message": "Question",
            "history": [
                {"role": "user", "content": f"Message {index}"} for index in range(21)
            ],
        },
    )

    assert response.status_code == 422
    assert fake_openrouter_client.calls == []


@pytest.fixture
def risk_board_id(authenticated_ai_client: TestClient) -> int:
    board = authenticated_ai_client.post("/api/boards", json={"name": "Risky"}).json()
    columns = board["columns"]
    for column_index, title, due_date in [
        (2, "Late launch email", "2026-10-10"),
        (3, "Review contract", ""),
        (4, "Finished late", "2026-01-01"),
    ]:
        response = authenticated_ai_client.post(
            f"/api/boards/{board['id']}/cards",
            json={
                "column_id": columns[column_index]["id"],
                "title": title,
                "due_date": due_date,
            },
        )
        assert response.status_code == 201
    return board["id"]


def test_risk_report_requires_authentication(
    ai_client: TestClient, fake_openrouter_client: FakeOpenRouterClient
):
    response = ai_client.post("/api/boards/1/risk-report", json={"today": "2026-10-15"})

    assert response.status_code == 401
    assert fake_openrouter_client.calls == []


def test_risk_report_returns_findings_and_grounded_ai_summary(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    risk_board_id: int,
):
    fake_openrouter_client.response = json.dumps(
        {
            "summary": "Late launch email is 5 days overdue.",
            "next_steps": ["Finish the launch email today."],
        }
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{risk_board_id}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 200
    body = response.json()
    assert [(f["kind"], f["title"], f["days"]) for f in body["findings"]] == [
        ("overdue", "Late launch email", 5),
        ("no_due_date", "Review contract", 0),
    ]
    assert body["summary"] == "Late launch email is 5 days overdue."
    assert body["next_steps"] == ["Finish the launch email today."]

    messages, schema = fake_openrouter_client.calls[0]
    assert schema["required"] == ["summary", "next_steps"]
    assert "Late launch email" in messages[0]["content"]
    assert "Finished late" not in messages[0]["content"]


def test_risk_report_skips_the_ai_when_nothing_is_at_risk(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
):
    board = authenticated_ai_client.post("/api/boards", json={"name": "Calm"}).json()

    response = authenticated_ai_client.post(
        f"/api/boards/{board['id']}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 200
    assert response.json() == {"findings": [], "summary": None, "next_steps": []}
    assert fake_openrouter_client.calls == []


@pytest.mark.parametrize(
    "error",
    [
        OpenRouterConfigurationError("missing key"),
        OpenRouterRequestError("down"),
    ],
)
def test_risk_report_still_returns_findings_when_the_ai_fails(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    risk_board_id: int,
    error: Exception,
):
    fake_openrouter_client.error = error

    response = authenticated_ai_client.post(
        f"/api/boards/{risk_board_id}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["findings"]) == 2
    assert body["summary"] is None
    assert body["next_steps"] == []


def test_risk_report_drops_an_invalid_ai_summary(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    risk_board_id: int,
):
    fake_openrouter_client.response = json.dumps(
        {"summary": "Too many steps.", "next_steps": ["a", "b", "c", "d"]}
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{risk_board_id}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 200
    assert response.json()["summary"] is None


def test_risk_report_is_scoped_to_the_signed_in_users_board(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
):
    authenticated_ai_client.post("/api/auth/logout")
    authenticated_ai_client.post(
        "/api/auth/register", json={"username": "other", "password": "password123"}
    )
    other_board_id = authenticated_ai_client.get("/api/boards").json()[0]["id"]
    authenticated_ai_client.post("/api/auth/logout")
    authenticated_ai_client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{other_board_id}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 404
    assert fake_openrouter_client.calls == []


def test_risk_report_retries_once_after_a_cut_off_ai_response(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    risk_board_id: int,
):
    responses = iter(
        [
            '{"summary": "Late launch email is',
            json.dumps({"summary": "Late launch email is overdue.", "next_steps": []}),
        ]
    )
    fake_openrouter_client.complete_structured = (  # type: ignore[method-assign]
        lambda messages, schema: next(responses)
    )

    response = authenticated_ai_client.post(
        f"/api/boards/{risk_board_id}/risk-report", json={"today": "2026-10-15"}
    )

    assert response.status_code == 200
    assert response.json()["summary"] == "Late launch email is overdue."
