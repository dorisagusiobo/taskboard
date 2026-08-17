import sqlite3
from pathlib import Path

import pytest

from database import (
    BoardNotFoundError,
    BoardStore,
    CardNotFoundError,
    LastBoardError,
    UsernameTakenError,
)


def first_board_id(store: BoardStore, username: str) -> int:
    return store.list_boards(username)[0]["id"]


def test_registration_seeds_a_board_and_hashes_the_password(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")

    board_id = first_board_id(store, "user")
    board = store.get_board("user", board_id)
    assert board["name"] == "Board"
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert sum(len(column["cards"]) for column in board["columns"]) == 8
    assert store.verify_password("user", "password") is True
    assert store.verify_password("user", "wrong") is False
    assert store.verify_password("missing", "password") is False

    connection = sqlite3.connect(database_path)
    try:
        stored_hash = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'user'"
        ).fetchone()[0]
        assert stored_hash != "password"
    finally:
        connection.close()


def test_registering_an_existing_username_is_rejected_and_preserves_data(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    board_id = first_board_id(store, "user")
    board = store.get_board("user", board_id)
    first_column_id = board["columns"][0]["id"]
    store.rename_column("user", board_id, first_column_id, "Preserved")

    with pytest.raises(UsernameTakenError):
        store.register_user("user", "different-password")

    reloaded = store.get_board("user", board_id)
    assert reloaded["columns"][0]["title"] == "Preserved"
    assert sum(len(column["cards"]) for column in reloaded["columns"]) == 8
    assert store.verify_password("user", "password") is True


def test_ensure_seed_account_only_seeds_an_empty_database(database_path: Path):
    store = BoardStore(database_path)
    store.ensure_seed_account("user", "password")
    store.ensure_seed_account("user", "password")

    assert store.verify_password("user", "password") is True

    store.register_user("someone-else", "password")
    store.ensure_seed_account("another-seed", "password")

    assert store.list_boards("another-seed") == []


def test_schema_enforces_ownership_and_cascades(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    store.register_user("other", "password")

    user_board_id = first_board_id(store, "user")
    other_board_id = first_board_id(store, "other")
    other_board = store.get_board("other", other_board_id)
    assert user_board_id != other_board_id

    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        user_id = connection.execute(
            "SELECT id FROM users WHERE username = 'user'"
        ).fetchone()[0]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO cards (board_id, column_id, title, position)
                VALUES (?, ?, 'Cross-board card', 50)
                """,
                (user_board_id, other_board["columns"][0]["id"]),
            )

        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()
        assert (
            connection.execute(
                "SELECT count(*) FROM boards WHERE id = ?", (user_board_id,)
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM board_columns WHERE board_id = ?",
                (user_board_id,),
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM cards WHERE board_id = ?", (user_board_id,)
            ).fetchone()[0]
            == 0
        )
    finally:
        connection.close()


def test_password_hash_column_is_added_to_a_pre_existing_users_table(
    database_path: Path,
):
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE
            )
            """
        )
        connection.execute("INSERT INTO users (username) VALUES ('legacy')")
        connection.commit()
    finally:
        connection.close()

    store = BoardStore(database_path)
    store.init_schema()

    connection = sqlite3.connect(database_path)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    finally:
        connection.close()
    assert "password_hash" in columns
    assert store.verify_password("legacy", "anything") is False

    store.register_user("new-account", "password")
    assert store.verify_password("new-account", "password") is True


def test_unknown_user_has_no_boards(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")

    assert store.list_boards("missing") == []
    with pytest.raises(BoardNotFoundError):
        store.get_board("missing", first_board_id(store, "user"))


def test_create_board_seeds_fixed_columns_without_demo_cards(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")

    created = store.create_board("user", "Personal projects")
    assert created["name"] == "Personal projects"
    assert [column["title"] for column in created["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert sum(len(column["cards"]) for column in created["columns"]) == 0

    boards = store.list_boards("user")
    assert [board["name"] for board in boards] == ["Board", "Personal projects"]
    assert [board["position"] for board in boards] == [0, 1]


def test_rename_and_delete_board(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    first_id = first_board_id(store, "user")
    second = store.create_board("user", "Second board")

    renamed = store.rename_board("user", second["id"], "Renamed board")
    assert renamed["name"] == "Renamed board"
    assert [board["name"] for board in store.list_boards("user")] == [
        "Board",
        "Renamed board",
    ]

    remaining = store.delete_board("user", second["id"])
    assert [board["id"] for board in remaining] == [first_id]
    with pytest.raises(BoardNotFoundError):
        store.get_board("user", second["id"])


def test_cannot_delete_the_last_remaining_board(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    board_id = first_board_id(store, "user")

    with pytest.raises(LastBoardError):
        store.delete_board("user", board_id)

    assert store.get_board("user", board_id) is not None


def test_boards_are_isolated_per_user(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    store.register_user("other", "password")
    user_board_id = first_board_id(store, "user")
    other_board_id = first_board_id(store, "other")

    with pytest.raises(BoardNotFoundError):
        store.get_board("user", other_board_id)
    with pytest.raises(BoardNotFoundError):
        store.rename_board("user", other_board_id, "Stolen")
    with pytest.raises(BoardNotFoundError):
        store.delete_board("user", other_board_id)
    assert store.get_board("user", user_board_id)["name"] == "Board"


def test_update_card_requires_a_title_details_due_date_or_labels_change(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    board_id = first_board_id(store, "user")
    board = store.get_board("user", board_id)
    card_id = board["columns"][0]["cards"][0]["id"]

    with pytest.raises(ValueError, match="title, details, due date, or labels"):
        store.update_card(
            "user",
            board_id,
            card_id,
            title=None,
            details=None,
            due_date=None,
            labels=None,
        )

    assert store.get_board("user", board_id) == board

    updated = store.update_card(
        "user", board_id, card_id, title=None, details=None, due_date="2026-01-01"
    )
    _, card = next(
        (column, card)
        for column in updated["columns"]
        for card in column["cards"]
        if card["id"] == card_id
    )
    assert card["due_date"] == "2026-01-01"


def test_board_operations_apply_create_edit_and_move_atomically(database_path: Path):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    board_id = first_board_id(store, "user")
    board = store.get_board("user", board_id)
    first_column = board["columns"][0]
    target_column = board["columns"][1]
    edited_card = first_column["cards"][0]
    moved_card = first_column["cards"][1]

    updated = store.apply_board_operations(
        "user",
        board_id,
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
    assert store.get_board("user", board_id) == updated


def test_board_operations_roll_back_every_change_when_one_is_invalid(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    board_id = first_board_id(store, "user")
    original = store.get_board("user", board_id)
    card = original["columns"][0]["cards"][0]

    with pytest.raises(CardNotFoundError):
        store.apply_board_operations(
            "user",
            board_id,
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

    assert store.get_board("user", board_id) == original


def test_board_operations_reject_unsupported_changes_and_other_users_ids(
    database_path: Path,
):
    store = BoardStore(database_path)
    store.register_user("user", "password")
    store.register_user("other", "password")
    user_board_id = first_board_id(store, "user")
    other_board_id = first_board_id(store, "other")
    user_board = store.get_board("user", user_board_id)
    other_board = store.get_board("other", other_board_id)

    with pytest.raises(ValueError, match="Unsupported board operation"):
        store.apply_board_operations("user", user_board_id, [{"type": "delete_card"}])

    with pytest.raises(CardNotFoundError):
        store.apply_board_operations(
            "user",
            user_board_id,
            [
                {
                    "type": "edit_card",
                    "card_id": other_board["columns"][0]["cards"][0]["id"],
                    "title": "Stolen",
                    "details": None,
                }
            ],
        )

    assert store.get_board("user", user_board_id) == user_board
    assert store.get_board("other", other_board_id) == other_board
