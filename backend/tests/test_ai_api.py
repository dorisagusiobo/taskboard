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


def test_ai_chat_requires_authentication_before_calling_provider(
    ai_client: TestClient, fake_openrouter_client: FakeOpenRouterClient
):
    response = ai_client.post("/api/ai/chat", json={"message": "Hello"})

    assert response.status_code == 401
    assert fake_openrouter_client.calls == []


def test_ai_chat_sends_board_history_and_returns_no_change_reply(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
):
    board = authenticated_ai_client.get("/api/board").json()

    response = authenticated_ai_client.post(
        "/api/ai/chat",
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
):
    board = authenticated_ai_client.get("/api/board").json()
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
                },
                {
                    "type": "edit_card",
                    "card_id": edited_card["id"],
                    "title": "AI edit",
                    "details": None,
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
        "/api/ai/chat", json={"message": "Update the board"}
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
    assert authenticated_ai_client.get("/api/board").json() == response_board


def test_ai_chat_rolls_back_all_operations_for_a_stale_id(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
):
    original = authenticated_ai_client.get("/api/board").json()
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
        "/api/ai/chat", json={"message": "Update cards"}
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "AI response could not be applied"}
    assert authenticated_ai_client.get("/api/board").json() == original


def test_ai_chat_cannot_mutate_another_users_board(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
    database_path: Path,
):
    store = BoardStore(database_path)
    store.initialize("other")
    user_board = authenticated_ai_client.get("/api/board").json()
    other_board = store.get_board("other")
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
                }
            ],
        }
    )

    response = authenticated_ai_client.post(
        "/api/ai/chat", json={"message": f"Edit card {other_card['id']}"}
    )

    assert response.status_code == 422
    assert store.get_board("user") == user_board
    assert store.get_board("other") == other_board


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
    provider_response: str | None,
    provider_error: Exception | None,
    detail: str,
):
    original = authenticated_ai_client.get("/api/board").json()
    if provider_response is not None:
        fake_openrouter_client.response = provider_response
    fake_openrouter_client.error = provider_error

    response = authenticated_ai_client.post(
        "/api/ai/chat", json={"message": "Update the board"}
    )

    assert response.status_code == 502
    assert response.json() == {"detail": detail}
    assert "secret" not in response.text
    assert authenticated_ai_client.get("/api/board").json() == original


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
        response = client.post("/api/ai/chat", json={"message": "Hello"})

    assert response.status_code == 503
    assert response.json() == {"detail": "AI service is not configured"}


def test_ai_chat_rejects_more_than_twenty_history_messages_without_calling_provider(
    authenticated_ai_client: TestClient,
    fake_openrouter_client: FakeOpenRouterClient,
):
    response = authenticated_ai_client.post(
        "/api/ai/chat",
        json={
            "message": "Question",
            "history": [
                {"role": "user", "content": f"Message {index}"} for index in range(21)
            ],
        },
    )

    assert response.status_code == 422
    assert fake_openrouter_client.calls == []
