import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from database import BoardStore


def card_count(board: dict) -> int:
    return sum(len(column["cards"]) for column in board["columns"])


def card_positions_are_contiguous(board: dict) -> bool:
    return all(
        [card["position"] for card in column["cards"]]
        == list(range(len(column["cards"])))
        for column in board["columns"]
    )


def find_card(board: dict, title: str) -> tuple[dict, dict]:
    for column in board["columns"]:
        for card in column["cards"]:
            if card["title"] == title:
                return column, card
    raise AssertionError(f"Card not found: {title}")


def test_seeded_board_is_available_only_after_authentication(
    client: TestClient, authenticated_client: TestClient
):
    client.cookies.clear()
    assert client.get("/api/board").status_code == 401

    authenticated_client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    response = authenticated_client.get("/api/board")

    assert response.status_code == 200
    board = response.json()
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert [column["position"] for column in board["columns"]] == list(range(5))
    assert card_count(board) == 8
    assert card_positions_are_contiguous(board)


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("patch", "/api/board/columns/1", {"title": "Blocked"}),
        (
            "post",
            "/api/board/cards",
            {"column_id": 1, "title": "Blocked", "details": ""},
        ),
        ("patch", "/api/board/cards/1", {"title": "Blocked"}),
        ("delete", "/api/board/cards/1", None),
        (
            "post",
            "/api/board/cards/1/move",
            {"column_id": 2, "position": 0},
        ),
    ],
)
def test_every_board_mutation_requires_authentication(
    client: TestClient, method: str, path: str, payload: dict | None
):
    response = client.request(method, path, json=payload)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_rename_column_persists_after_app_restart(
    authenticated_client: TestClient, database_path: Path
):
    board = authenticated_client.get("/api/board").json()
    column_id = board["columns"][0]["id"]

    response = authenticated_client.patch(
        f"/api/board/columns/{column_id}", json={"title": "Ideas"}
    )
    assert response.status_code == 200
    assert response.json()["columns"][0]["title"] == "Ideas"

    with TestClient(
        main.create_app(
            session_secret="restarted-session-secret", database_path=database_path
        )
    ) as restarted_client:
        restarted_client.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        )
        reloaded = restarted_client.get("/api/board").json()

    assert reloaded["columns"][0]["title"] == "Ideas"
    assert card_count(reloaded) == 8


def test_create_edit_and_delete_card(authenticated_client: TestClient):
    board = authenticated_client.get("/api/board").json()
    column_id = board["columns"][0]["id"]

    created_response = authenticated_client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "  New card  ",
            "details": "Initial details",
        },
    )
    assert created_response.status_code == 201
    created_board = created_response.json()
    _, created = find_card(created_board, "New card")
    assert created["details"] == "Initial details"
    assert card_count(created_board) == 9

    details_response = authenticated_client.patch(
        f"/api/board/cards/{created['id']}", json={"details": "Updated details"}
    )
    assert details_response.status_code == 200
    _, updated_details = find_card(details_response.json(), "New card")
    assert updated_details["details"] == "Updated details"

    title_response = authenticated_client.patch(
        f"/api/board/cards/{created['id']}", json={"title": "Renamed card"}
    )
    assert title_response.status_code == 200
    _, updated_title = find_card(title_response.json(), "Renamed card")
    assert updated_title["details"] == "Updated details"

    deleted_response = authenticated_client.delete(f"/api/board/cards/{created['id']}")
    assert deleted_response.status_code == 200
    deleted_board = deleted_response.json()
    assert card_count(deleted_board) == 8
    assert card_positions_are_contiguous(deleted_board)
    with pytest.raises(AssertionError):
        find_card(deleted_board, "Renamed card")


def test_reorders_and_moves_cards_transactionally(
    authenticated_client: TestClient, database_path: Path
):
    board = authenticated_client.get("/api/board").json()
    source = board["columns"][0]
    target = board["columns"][1]
    moved_card = source["cards"][0]
    original_target_ids = [card["id"] for card in target["cards"]]

    reordered_response = authenticated_client.post(
        f"/api/board/cards/{moved_card['id']}/move",
        json={"column_id": source["id"], "position": 1},
    )
    assert reordered_response.status_code == 200
    reordered_source = reordered_response.json()["columns"][0]
    assert [card["id"] for card in reordered_source["cards"]][1] == moved_card["id"]

    moved_response = authenticated_client.post(
        f"/api/board/cards/{moved_card['id']}/move",
        json={"column_id": target["id"], "position": 0},
    )
    assert moved_response.status_code == 200
    moved_board = moved_response.json()
    assert [card["id"] for card in moved_board["columns"][1]["cards"]] == [
        moved_card["id"],
        *original_target_ids,
    ]
    assert card_positions_are_contiguous(moved_board)

    reloaded = BoardStore(database_path).get_board("user")
    assert reloaded == moved_board


def test_validation_and_missing_resources_do_not_change_the_board(
    authenticated_client: TestClient,
):
    original = authenticated_client.get("/api/board").json()
    column_id = original["columns"][0]["id"]
    card_id = original["columns"][0]["cards"][0]["id"]

    failures = [
        authenticated_client.patch(
            "/api/board/columns/99999", json={"title": "Missing"}
        ),
        authenticated_client.patch(
            f"/api/board/columns/{column_id}", json={"title": "   "}
        ),
        authenticated_client.post(
            "/api/board/cards", json={"column_id": 99999, "title": "Missing"}
        ),
        authenticated_client.post(
            "/api/board/cards", json={"column_id": column_id, "title": ""}
        ),
        authenticated_client.patch("/api/board/cards/99999", json={"title": "X"}),
        authenticated_client.patch(f"/api/board/cards/{card_id}", json={}),
        authenticated_client.delete("/api/board/cards/99999"),
        authenticated_client.post(
            "/api/board/cards/99999/move",
            json={"column_id": column_id, "position": 0},
        ),
        authenticated_client.post(
            f"/api/board/cards/{card_id}/move",
            json={"column_id": 99999, "position": 0},
        ),
        authenticated_client.post(
            f"/api/board/cards/{card_id}/move",
            json={"column_id": column_id, "position": 999},
        ),
        authenticated_client.post(
            f"/api/board/cards/{card_id}/move",
            json={"column_id": original["columns"][1]["id"], "position": 999},
        ),
        authenticated_client.post(
            f"/api/board/cards/{card_id}/move",
            json={"column_id": column_id, "position": -1},
        ),
    ]

    assert [response.status_code for response in failures] == [
        404,
        422,
        404,
        422,
        404,
        422,
        404,
        404,
        404,
        422,
        422,
        422,
    ]
    assert authenticated_client.get("/api/board").json() == original


def test_missing_board_returns_a_controlled_404(
    authenticated_client: TestClient, database_path: Path
):
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        connection.execute(
            """
            DELETE FROM boards
            WHERE user_id = (SELECT id FROM users WHERE username = 'user')
            """
        )
        connection.commit()
    finally:
        connection.close()

    response = authenticated_client.get("/api/board")

    assert response.status_code == 404
    assert response.json() == {"detail": "Board not found"}


def test_other_users_resources_are_not_accessible(
    authenticated_client: TestClient, database_path: Path
):
    store = BoardStore(database_path)
    store.initialize("other")
    user_board = authenticated_client.get("/api/board").json()
    other_board = store.get_board("other")
    other_column = other_board["columns"][0]
    other_card = other_column["cards"][0]
    user_card = user_board["columns"][0]["cards"][0]

    responses = [
        authenticated_client.patch(
            f"/api/board/columns/{other_column['id']}", json={"title": "Stolen"}
        ),
        authenticated_client.post(
            "/api/board/cards",
            json={"column_id": other_column["id"], "title": "Stolen"},
        ),
        authenticated_client.patch(
            f"/api/board/cards/{other_card['id']}", json={"title": "Stolen"}
        ),
        authenticated_client.delete(f"/api/board/cards/{other_card['id']}"),
        authenticated_client.post(
            f"/api/board/cards/{user_card['id']}/move",
            json={"column_id": other_column["id"], "position": 0},
        ),
    ]

    assert all(response.status_code == 404 for response in responses)
    assert authenticated_client.get("/api/board").json() == user_board
    assert store.get_board("other") == other_board
