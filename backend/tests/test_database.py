import sqlite3
from pathlib import Path

import pytest

from database import BoardNotFoundError, BoardStore


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
