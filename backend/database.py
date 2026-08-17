import sqlite3
from pathlib import Path
from typing import Any

from auth import check_password, hash_password

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    CHECK (length(trim(username)) > 0)
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Board',
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, position),
    CHECK (length(trim(name)) > 0),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (id, board_id),
    UNIQUE (board_id, position),
    CHECK (length(trim(title)) > 0),
    CHECK (position >= 0),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    column_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    labels TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    UNIQUE (column_id, position),
    CHECK (length(trim(title)) > 0),
    CHECK (position >= 0),
    FOREIGN KEY (column_id, board_id)
        REFERENCES board_columns(id, board_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);
"""

SEED_COLUMNS = (
    ("Backlog", 0),
    ("Discovery", 1),
    ("In Progress", 2),
    ("Review", 3),
    ("Done", 4),
)

SEED_CARDS = (
    (
        0,
        0,
        "Align roadmap themes",
        "Draft quarterly themes with impact statements and metrics.",
    ),
    (
        0,
        1,
        "Gather customer signals",
        "Review support tags, sales notes, and churn feedback.",
    ),
    (
        1,
        0,
        "Prototype analytics view",
        "Sketch initial dashboard layout and key drill-downs.",
    ),
    (
        2,
        0,
        "Refine status language",
        "Standardize column labels and tone across the board.",
    ),
    (
        2,
        1,
        "Design card layout",
        "Add hierarchy and spacing for scanning dense lists.",
    ),
    (
        3,
        0,
        "QA micro-interactions",
        "Verify hover, focus, and loading states.",
    ),
    (
        4,
        0,
        "Ship marketing page",
        "Final copy approved and asset pack delivered.",
    ),
    (
        4,
        1,
        "Close onboarding sprint",
        "Document release notes and share internally.",
    ),
)

DEFAULT_BOARD_NAME = "Board"


class BoardNotFoundError(Exception):
    pass


class ColumnNotFoundError(Exception):
    pass


class CardNotFoundError(Exception):
    pass


class InvalidPositionError(Exception):
    pass


class UsernameTakenError(Exception):
    pass


class LastBoardError(Exception):
    pass


class IncorrectPasswordError(Exception):
    pass


class BoardStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _ensure_schema(self, connection: sqlite3.Connection) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection.executescript(SCHEMA_SQL)
        user_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)")
        }
        if "password_hash" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"
            )
        card_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(cards)")
        }
        if "due_date" not in card_columns:
            connection.execute(
                "ALTER TABLE cards ADD COLUMN due_date TEXT NOT NULL DEFAULT ''"
            )
        if "labels" not in card_columns:
            connection.execute(
                "ALTER TABLE cards ADD COLUMN labels TEXT NOT NULL DEFAULT ''"
            )

    def init_schema(self) -> None:
        connection = self._connect()
        try:
            self._ensure_schema(connection)
            connection.commit()
        finally:
            connection.close()

    def register_user(self, username: str, password: str) -> None:
        connection = self._connect()
        try:
            self._ensure_schema(connection)
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            if existing is not None:
                raise UsernameTakenError

            cursor = connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(password)),
            )
            user_id = cursor.lastrowid
            if user_id is None:
                raise RuntimeError("User insert did not return an id")

            board_id = self._create_board_row(connection, user_id, DEFAULT_BOARD_NAME)
            column_ids = self._seed_columns(connection, board_id)
            self._seed_demo_cards(connection, board_id, column_ids)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def ensure_seed_account(self, username: str, password: str) -> None:
        connection = self._connect()
        try:
            self._ensure_schema(connection)
            any_user = connection.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        finally:
            connection.close()
        if any_user is None:
            self.register_user(username, password)

    def verify_password(self, username: str, password: str) -> bool:
        connection = self._connect()
        try:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
        finally:
            connection.close()
        if row is None or not row["password_hash"]:
            return False
        return check_password(password, row["password_hash"])

    def change_password(
        self, username: str, current_password: str, new_password: str
    ) -> None:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
            if (
                row is None
                or not row["password_hash"]
                or not check_password(current_password, row["password_hash"])
            ):
                raise IncorrectPasswordError
            connection.execute(
                "UPDATE users SET password_hash = ? WHERE username = ?",
                (hash_password(new_password), username),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_account(self, username: str, password: str) -> None:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
            if (
                row is None
                or not row["password_hash"]
                or not check_password(password, row["password_hash"])
            ):
                raise IncorrectPasswordError
            connection.execute("DELETE FROM users WHERE username = ?", (username,))
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def list_boards(self, username: str) -> list[dict[str, Any]]:
        connection = self._connect()
        try:
            return self._list_boards(connection, username)
        finally:
            connection.close()

    def create_board(self, username: str, name: str) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            user_id = self._require_user_id(connection, username)
            board_id = self._create_board_row(connection, user_id, name)
            self._seed_columns(connection, board_id)
            connection.commit()
            return self._load_board(connection, username, board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def rename_board(self, username: str, board_id: int, name: str) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            connection.execute(
                "UPDATE boards SET name = ? WHERE id = ?", (name, owned_board_id)
            )
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_board(self, username: str, board_id: int) -> list[dict[str, Any]]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            remaining = connection.execute(
                """
                SELECT count(*)
                FROM boards
                JOIN users ON users.id = boards.user_id
                WHERE users.username = ?
                """,
                (username,),
            ).fetchone()[0]
            if remaining <= 1:
                raise LastBoardError
            connection.execute("DELETE FROM boards WHERE id = ?", (owned_board_id,))
            connection.commit()
            return self._list_boards(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_board(self, username: str, board_id: int) -> dict[str, Any]:
        connection = self._connect()
        try:
            return self._load_board(connection, username, board_id)
        finally:
            connection.close()

    def rename_column(
        self, username: str, board_id: int, column_id: int, title: str
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            result = connection.execute(
                """
                UPDATE board_columns
                SET title = ?
                WHERE id = ? AND board_id = ?
                """,
                (title, column_id, owned_board_id),
            )
            if result.rowcount == 0:
                raise ColumnNotFoundError
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def create_card(
        self,
        username: str,
        board_id: int,
        column_id: int,
        title: str,
        details: str,
        due_date: str = "",
        labels: str = "",
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            self._create_card(
                connection,
                owned_board_id,
                column_id,
                title,
                details,
                due_date,
                labels,
            )
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def update_card(
        self,
        username: str,
        board_id: int,
        card_id: int,
        *,
        title: str | None,
        details: str | None,
        due_date: str | None = None,
        labels: str | None = None,
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            self._update_card(
                connection,
                owned_board_id,
                card_id,
                title=title,
                details=details,
                due_date=due_date,
                labels=labels,
            )
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_card(self, username: str, board_id: int, card_id: int) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            card = self._require_card(connection, owned_board_id, card_id)
            column_id = card["column_id"]
            connection.execute(
                "DELETE FROM cards WHERE id = ? AND board_id = ?",
                (card_id, owned_board_id),
            )
            ordered_ids = self._ordered_card_ids(connection, column_id)
            self._shift_column_positions(connection, column_id)
            self._assign_positions(connection, column_id, ordered_ids)
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def move_card(
        self,
        username: str,
        board_id: int,
        card_id: int,
        target_column_id: int,
        target_position: int,
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            self._move_card(
                connection,
                owned_board_id,
                card_id,
                target_column_id,
                target_position,
            )

            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def apply_board_operations(
        self,
        username: str,
        board_id: int,
        operations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            owned_board_id = self._owned_board_id(connection, username, board_id)
            for operation in operations:
                match operation["type"]:
                    case "create_card":
                        self._create_card(
                            connection,
                            owned_board_id,
                            operation["column_id"],
                            operation["title"],
                            operation["details"],
                            operation.get("due_date", ""),
                            operation.get("labels", ""),
                        )
                    case "edit_card":
                        self._update_card(
                            connection,
                            owned_board_id,
                            operation["card_id"],
                            title=operation["title"],
                            details=operation["details"],
                            due_date=operation.get("due_date"),
                            labels=operation.get("labels"),
                        )
                    case "move_card":
                        self._move_card(
                            connection,
                            owned_board_id,
                            operation["card_id"],
                            operation["column_id"],
                            operation["position"],
                        )
                    case _:
                        raise ValueError("Unsupported board operation")
            connection.commit()
            return self._load_board(connection, username, owned_board_id)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _create_board_row(
        connection: sqlite3.Connection, user_id: int, name: str
    ) -> int:
        next_position = connection.execute(
            "SELECT coalesce(max(position), -1) + 1 FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()[0]
        cursor = connection.execute(
            "INSERT INTO boards (user_id, name, position) VALUES (?, ?, ?)",
            (user_id, name, next_position),
        )
        board_id = cursor.lastrowid
        if board_id is None:
            raise RuntimeError("Board insert did not return an id")
        return board_id

    @staticmethod
    def _seed_columns(connection: sqlite3.Connection, board_id: int) -> dict[int, int]:
        column_ids: dict[int, int] = {}
        for title, position in SEED_COLUMNS:
            cursor = connection.execute(
                """
                INSERT INTO board_columns (board_id, title, position)
                VALUES (?, ?, ?)
                """,
                (board_id, title, position),
            )
            column_id = cursor.lastrowid
            if column_id is None:
                raise RuntimeError("Column insert did not return an id")
            column_ids[position] = column_id
        return column_ids

    @staticmethod
    def _seed_demo_cards(
        connection: sqlite3.Connection, board_id: int, column_ids: dict[int, int]
    ) -> None:
        for column_position, position, title, details in SEED_CARDS:
            connection.execute(
                """
                INSERT INTO cards (
                    board_id, column_id, title, details, position
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    board_id,
                    column_ids[column_position],
                    title,
                    details,
                    position,
                ),
            )

    @classmethod
    def _create_card(
        cls,
        connection: sqlite3.Connection,
        board_id: int,
        column_id: int,
        title: str,
        details: str,
        due_date: str = "",
        labels: str = "",
    ) -> None:
        cls._require_column(connection, board_id, column_id)
        position = connection.execute(
            """
            SELECT coalesce(max(position), -1) + 1
            FROM cards
            WHERE column_id = ? AND board_id = ?
            """,
            (column_id, board_id),
        ).fetchone()[0]
        connection.execute(
            """
            INSERT INTO cards (
                board_id, column_id, title, details, due_date, labels, position
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (board_id, column_id, title, details, due_date, labels, position),
        )

    @classmethod
    def _update_card(
        cls,
        connection: sqlite3.Connection,
        board_id: int,
        card_id: int,
        *,
        title: str | None,
        details: str | None,
        due_date: str | None = None,
        labels: str | None = None,
    ) -> None:
        if title is None and details is None and due_date is None and labels is None:
            raise ValueError(
                "An update must change the title, details, due date, or labels"
            )
        cls._require_card(connection, board_id, card_id)
        assignments: list[str] = []
        values: list[str | int] = []
        if title is not None:
            assignments.append("title = ?")
            values.append(title)
        if details is not None:
            assignments.append("details = ?")
            values.append(details)
        if due_date is not None:
            assignments.append("due_date = ?")
            values.append(due_date)
        if labels is not None:
            assignments.append("labels = ?")
            values.append(labels)
        values.extend((card_id, board_id))
        connection.execute(
            f"UPDATE cards SET {', '.join(assignments)} WHERE id = ? AND board_id = ?",
            values,
        )

    @classmethod
    def _move_card(
        cls,
        connection: sqlite3.Connection,
        board_id: int,
        card_id: int,
        target_column_id: int,
        target_position: int,
    ) -> None:
        card = cls._require_card(connection, board_id, card_id)
        cls._require_column(connection, board_id, target_column_id)
        source_column_id = card["column_id"]
        source_ids = cls._ordered_card_ids(connection, source_column_id)
        source_ids.remove(card_id)

        if source_column_id == target_column_id:
            if target_position > len(source_ids):
                raise InvalidPositionError
            source_ids.insert(target_position, card_id)
            cls._shift_column_positions(connection, source_column_id)
            cls._assign_positions(connection, source_column_id, source_ids)
            return

        target_ids = cls._ordered_card_ids(connection, target_column_id)
        if target_position > len(target_ids):
            raise InvalidPositionError
        target_ids.insert(target_position, card_id)

        cls._shift_column_positions(connection, source_column_id)
        temporary_position = cls._shift_column_positions(connection, target_column_id)
        connection.execute(
            """
            UPDATE cards
            SET board_id = ?, column_id = ?, position = ?
            WHERE id = ? AND board_id = ?
            """,
            (
                board_id,
                target_column_id,
                temporary_position,
                card_id,
                board_id,
            ),
        )
        cls._assign_positions(connection, source_column_id, source_ids)
        cls._assign_positions(connection, target_column_id, target_ids)

    @staticmethod
    def _require_user_id(connection: sqlite3.Connection, username: str) -> int:
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            raise BoardNotFoundError
        return user["id"]

    @staticmethod
    def _owned_board_id(
        connection: sqlite3.Connection, username: str, board_id: int
    ) -> int:
        board = connection.execute(
            """
            SELECT boards.id
            FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = ? AND boards.id = ?
            """,
            (username, board_id),
        ).fetchone()
        if board is None:
            raise BoardNotFoundError
        return board["id"]

    @staticmethod
    def _list_boards(
        connection: sqlite3.Connection, username: str
    ) -> list[dict[str, Any]]:
        return [
            {"id": row["id"], "name": row["name"], "position": row["position"]}
            for row in connection.execute(
                """
                SELECT boards.id, boards.name, boards.position
                FROM boards
                JOIN users ON users.id = boards.user_id
                WHERE users.username = ?
                ORDER BY boards.position, boards.id
                """,
                (username,),
            )
        ]

    @staticmethod
    def _require_column(
        connection: sqlite3.Connection, board_id: int, column_id: int
    ) -> sqlite3.Row:
        column = connection.execute(
            "SELECT id FROM board_columns WHERE id = ? AND board_id = ?",
            (column_id, board_id),
        ).fetchone()
        if column is None:
            raise ColumnNotFoundError
        return column

    @staticmethod
    def _require_card(
        connection: sqlite3.Connection, board_id: int, card_id: int
    ) -> sqlite3.Row:
        card = connection.execute(
            """
            SELECT id, column_id, position
            FROM cards
            WHERE id = ? AND board_id = ?
            """,
            (card_id, board_id),
        ).fetchone()
        if card is None:
            raise CardNotFoundError
        return card

    @staticmethod
    def _ordered_card_ids(connection: sqlite3.Connection, column_id: int) -> list[int]:
        return [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM cards WHERE column_id = ? ORDER BY position, id",
                (column_id,),
            )
        ]

    @staticmethod
    def _shift_column_positions(connection: sqlite3.Connection, column_id: int) -> int:
        maximum, count = connection.execute(
            """
            SELECT coalesce(max(position), 0), count(*)
            FROM cards
            WHERE column_id = ?
            """,
            (column_id,),
        ).fetchone()
        offset = maximum + count + 1
        connection.execute(
            "UPDATE cards SET position = position + ? WHERE column_id = ?",
            (offset, column_id),
        )
        return maximum + offset + 1

    @staticmethod
    def _assign_positions(
        connection: sqlite3.Connection, column_id: int, card_ids: list[int]
    ) -> None:
        for position, card_id in enumerate(card_ids):
            connection.execute(
                """
                UPDATE cards
                SET position = ?
                WHERE id = ? AND column_id = ?
                """,
                (position, card_id, column_id),
            )

    @classmethod
    def _load_board(
        cls, connection: sqlite3.Connection, username: str, board_id: int
    ) -> dict[str, Any]:
        owned_board_id = cls._owned_board_id(connection, username, board_id)
        board_row = connection.execute(
            "SELECT id, name FROM boards WHERE id = ?", (owned_board_id,)
        ).fetchone()
        columns = [
            {
                "id": row["id"],
                "title": row["title"],
                "position": row["position"],
                "cards": [],
            }
            for row in connection.execute(
                """
                SELECT id, title, position
                FROM board_columns
                WHERE board_id = ?
                ORDER BY position, id
                """,
                (owned_board_id,),
            )
        ]
        columns_by_id = {column["id"]: column for column in columns}
        for row in connection.execute(
            """
            SELECT id, column_id, title, details, due_date, labels, position
            FROM cards
            WHERE board_id = ?
            ORDER BY column_id, position, id
            """,
            (owned_board_id,),
        ):
            columns_by_id[row["column_id"]]["cards"].append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "details": row["details"],
                    "due_date": row["due_date"],
                    "labels": row["labels"],
                    "position": row["position"],
                }
            )
        return {"id": owned_board_id, "name": board_row["name"], "columns": columns}
