import sqlite3
from pathlib import Path

import pytest

from database import BoardNotFoundError, BoardStore, CardNotFoundError


def test_initialization_seeds_once_and_preserves_existing_data(database_path: Path):
    store = BoardStore(database_path)
    store.initialize("user")

    board = store.get_board("user")
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert sum(len(column["cards"]) for column in board["columns"]) == 8

    first_column_id = board["columns"][0]["id"]
    store.rename_column("user", first_column_id, "Preserved")
    store.initialize("user")

    reloaded = store.get_board("user")
    assert reloaded["columns"][0]["title"] == "Preserved"
    assert sum(len(column["cards"]) for column in reloaded["columns"]) == 8


def test_schema_enforces_ownership_uniqueness_and_cascades(database_path: Path):
    store = BoardStore(database_path)
    store.initialize("user")
    store.initialize("other")

    user_board = store.get_board("user")
    other_board = store.get_board("other")
    assert user_board["id"] != other_board["id"]

    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        user_id = connection.execute(
            "SELECT id FROM users WHERE username = 'user'"
        ).fetchone()[0]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO boards (user_id) VALUES (?)", (user_id,))

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO cards (board_id, column_id, title, position)
                VALUES (?, ?, 'Cross-board card', 50)
                """,
                (user_board["id"], other_board["columns"][0]["id"]),
            )

        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()
        assert (
            connection.execute(
                "SELECT count(*) FROM boards WHERE id = ?", (user_board["id"],)
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM board_columns WHERE board_id = ?",
                (user_board["id"],),
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM cards WHERE board_id = ?", (user_board["id"],)
            ).fetchone()[0]
            == 0
        )
    finally:
        connection.close()


def test_unknown_user_has_no_board(database_path: Path):
    store = BoardStore(database_path)
    store.initialize("user")

    with pytest.raises(BoardNotFoundError):
        store.get_board("missing")


def test_update_card_requires_a_title_or_details_change(database_path: Path):
    store = BoardStore(database_path)
    store.initialize("user")
    board = store.get_board("user")
    card_id = board["columns"][0]["cards"][0]["id"]

    with pytest.raises(ValueError, match="title or details"):
        store.update_card("user", card_id, title=None, details=None)

    assert store.get_board("user") == board


def test_board_operations_apply_create_edit_and_move_atomically(database_path: Path):
    store = BoardStore(database_path)
    store.initialize("user")
    board = store.get_board("user")
    first_column = board["columns"][0]
    target_column = board["columns"][1]
    edited_card = first_column["cards"][0]
    moved_card = first_column["cards"][1]

    updated = store.apply_board_operations(
        "user",
        [
            {
                "type": "create_card",
                "column_id": first_column["id"],
                "title": "Created by AI",
                "details": "Created details",
            },
            {
                "type": "edit_card",
                "card_id": edited_card["id"],
                "title": "Edited by AI",
                "details": None,
            },
            {
                "type": "move_card",
                "card_id": moved_card["id"],
                "column_id": target_column["id"],
                "position": 0,
            },
        ],
    )

    assert any(
        card["title"] == "Created by AI" for card in updated["columns"][0]["cards"]
    )
    assert any(
        card["title"] == "Edited by AI" for card in updated["columns"][0]["cards"]
    )
    assert updated["columns"][1]["cards"][0]["id"] == moved_card["id"]
    assert store.get_board("user") == updated


def test_board_operations_roll_back_every_change_when_one_is_invalid(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.initialize("user")
    original = store.get_board("user")
    card = original["columns"][0]["cards"][0]

    with pytest.raises(CardNotFoundError):
        store.apply_board_operations(
            "user",
            [
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
        )

    assert store.get_board("user") == original


def test_board_operations_reject_unsupported_changes_and_other_users_ids(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.initialize("user")
    store.initialize("other")
    user_board = store.get_board("user")
    other_board = store.get_board("other")

    with pytest.raises(ValueError, match="Unsupported board operation"):
        store.apply_board_operations("user", [{"type": "delete_card"}])

    with pytest.raises(CardNotFoundError):
        store.apply_board_operations(
            "user",
            [
                {
                    "type": "edit_card",
                    "card_id": other_board["columns"][0]["cards"][0]["id"],
                    "title": "Stolen",
                    "details": None,
                }
            ],
        )

    assert store.get_board("user") == user_board
    assert store.get_board("other") == other_board
