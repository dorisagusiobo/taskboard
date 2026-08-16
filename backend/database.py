import sqlite3
from pathlib import Path
from typing import Any

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    CHECK (length(trim(username)) > 0)
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
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


class BoardNotFoundError(Exception):
    pass


class ColumnNotFoundError(Exception):
    pass


class CardNotFoundError(Exception):
    pass


class InvalidPositionError(Exception):
    pass


class BoardStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self, username: str) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = self._connect()
        try:
            connection.executescript(SCHEMA_SQL)
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO users (username) VALUES (?) ON CONFLICT DO NOTHING",
                (username,),
            )
            user = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            board = connection.execute(
                "SELECT id FROM boards WHERE user_id = ?", (user["id"],)
            ).fetchone()

            if board is None:
                cursor = connection.execute(
                    "INSERT INTO boards (user_id) VALUES (?)", (user["id"],)
                )
                board_id = cursor.lastrowid
                if board_id is None:
                    raise RuntimeError("Board insert did not return an id")
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
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_board(self, username: str) -> dict[str, Any]:
        connection = self._connect()
        try:
            return self._load_board(connection, username)
        finally:
            connection.close()

    def rename_column(
        self, username: str, column_id: int, title: str
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            result = connection.execute(
                """
                UPDATE board_columns
                SET title = ?
                WHERE id = ? AND board_id = ?
                """,
                (title, column_id, board_id),
            )
            if result.rowcount == 0:
                raise ColumnNotFoundError
            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def create_card(
        self,
        username: str,
        column_id: int,
        title: str,
        details: str,
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            self._create_card(connection, board_id, column_id, title, details)
            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def update_card(
        self,
        username: str,
        card_id: int,
        *,
        title: str | None,
        details: str | None,
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            self._update_card(
                connection,
                board_id,
                card_id,
                title=title,
                details=details,
            )
            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_card(self, username: str, card_id: int) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            card = self._require_card(connection, board_id, card_id)
            column_id = card["column_id"]
            connection.execute(
                "DELETE FROM cards WHERE id = ? AND board_id = ?",
                (card_id, board_id),
            )
            ordered_ids = self._ordered_card_ids(connection, column_id)
            self._shift_column_positions(connection, column_id)
            self._assign_positions(connection, column_id, ordered_ids)
            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def move_card(
        self,
        username: str,
        card_id: int,
        target_column_id: int,
        target_position: int,
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            self._move_card(
                connection,
                board_id,
                card_id,
                target_column_id,
                target_position,
            )

            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def apply_board_operations(
        self,
        username: str,
        operations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            board_id = self._owned_board_id(connection, username)
            for operation in operations:
                match operation["type"]:
                    case "create_card":
                        self._create_card(
                            connection,
                            board_id,
                            operation["column_id"],
                            operation["title"],
                            operation["details"],
                        )
                    case "edit_card":
                        self._update_card(
                            connection,
                            board_id,
                            operation["card_id"],
                            title=operation["title"],
                            details=operation["details"],
                        )
                    case "move_card":
                        self._move_card(
                            connection,
                            board_id,
                            operation["card_id"],
                            operation["column_id"],
                            operation["position"],
                        )
                    case _:
                        raise ValueError("Unsupported board operation")
            connection.commit()
            return self._load_board(connection, username)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @classmethod
    def _create_card(
        cls,
        connection: sqlite3.Connection,
        board_id: int,
        column_id: int,
        title: str,
        details: str,
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
            INSERT INTO cards (board_id, column_id, title, details, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            (board_id, column_id, title, details, position),
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
    ) -> None:
        cls._require_card(connection, board_id, card_id)
        assignments: list[str] = []
        values: list[str | int] = []
        if title is not None:
            assignments.append("title = ?")
            values.append(title)
        if details is not None:
            assignments.append("details = ?")
            values.append(details)
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
    def _owned_board_id(connection: sqlite3.Connection, username: str) -> int:
        board = connection.execute(
            """
            SELECT boards.id
            FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = ?
            """,
            (username,),
        ).fetchone()
        if board is None:
            raise BoardNotFoundError
        return board["id"]

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
        cls, connection: sqlite3.Connection, username: str
    ) -> dict[str, Any]:
        board_id = cls._owned_board_id(connection, username)
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
                (board_id,),
            )
        ]
        columns_by_id = {column["id"]: column for column in columns}
        for row in connection.execute(
            """
            SELECT id, column_id, title, details, position
            FROM cards
            WHERE board_id = ?
            ORDER BY column_id, position, id
            """,
            (board_id,),
        ):
            columns_by_id[row["column_id"]]["cards"].append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "details": row["details"],
                    "position": row["position"],
                }
            )
        return {"id": board_id, "columns": columns}
