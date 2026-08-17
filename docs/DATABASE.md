# SQLite data model

Part 5 defined this database contract, and Part 6 implements it in `backend/database.py` and the authenticated `/api/board` routes.

## Scope and lifetime

The database persists users and Kanban boards. Authentication supports real, independently-registered accounts (see "Accounts and passwords" below) — the fixed `user` / `password` credential is only a zero-config seed account created on first run, not a hardcoded check. Each user owns exactly one board with five fixed, ordered columns. Column titles and card content are editable; columns cannot be added, removed, or reordered. (Multi-board-per-user is a planned follow-up, not yet implemented — see `CLAUDE.md`.)

The default file is `data/project-management.sqlite3`. Docker mounts the local named volume `project-management-mvp-data` at `/app/data`, so rebuilding the container does not erase it. `DATABASE_PATH` can override the file location for automated tests and local configuration.

AI conversation history is intentionally not stored in SQLite for the MVP. The frontend will keep the current conversation in memory and send at most the latest 20 messages to the AI endpoint. History clears on reload, logout, or tab close. Persisted chat can be added later if it becomes a product requirement, but it does not justify more tables now.

## Schema

The machine-readable source is [database-schema.json](database-schema.json).

| Table | Purpose | Ownership and ordering |
| --- | --- | --- |
| `users` | Stable identity for current and future users | Case-insensitive unique `username` |
| `boards` | One Kanban board per user | Unique `user_id` enforces one board per user |
| `board_columns` | Five fixed columns with editable titles | Unique `(board_id, position)` |
| `cards` | Editable card title/details and location | Composite foreign key to `(column_id, board_id)` and unique `(column_id, position)` |

Proposed SQLite DDL:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    CHECK (length(trim(username)) > 0)
);

CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE board_columns (
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

CREATE TABLE cards (
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

CREATE INDEX idx_cards_board_id ON cards(board_id);
```

## Accounts and passwords

`users.password_hash` stores a PBKDF2-HMAC-SHA256 hash (`backend/auth.py`, stdlib `hashlib`/`secrets`, 260,000 iterations, random per-password salt) — never a plaintext password. `POST /api/auth/register` creates a new account (rejecting an already-taken username) and seeds its board in the same transaction; `POST /api/auth/login` verifies the submitted password against the stored hash with a constant-time comparison. `BoardStore.ensure_seed_account` auto-registers the `user` / `password` account only when the `users` table is completely empty, so a fresh install remains zero-config without interfering with real registrations.

Timestamps, board names, roles, soft deletes, and chat tables are omitted because no current behavior needs them.

## Ownership guarantees

API access starts with the username stored in the signed session, then resolves `users.id` and its single `boards.id`. The client never selects a `user_id` or `board_id`.

`boards.user_id` is unique, so a user cannot own two boards. A card stores both `column_id` and `board_id`; its composite foreign key must match one row in `board_columns`. SQLite therefore rejects attaching a card to a column belonging to another board. `PRAGMA foreign_keys = ON` must be enabled on every connection.

Deleting a user cascades through their board, columns, and cards. The MVP API will not expose user, board, or column deletion; cascades exist for consistent ownership cleanup and tests.

## Initialization

On startup, `BoardStore.init_schema()` creates the schema when missing (including an `ALTER TABLE` fallback that adds `password_hash` to a pre-existing `users` table, so upgrading in place doesn't crash), then `BoardStore.ensure_seed_account("user", "password")` registers the zero-config seed account only if the `users` table is completely empty.

Beyond startup, `BoardStore.register_user(username, password)` is the only way a board gets created: it hashes the password, inserts the user row, and seeds the board, five columns, and the eight demo cards from `database-schema.json`, all in one transaction. It raises `UsernameTakenError` for an existing username rather than silently reusing it — registration is not idempotent by design, unlike the old startup-only seeding. Tests use a temporary `DATABASE_PATH`, never the developer database.

## Mutation walkthrough

- Create: validate the authenticated board and target column, then append at `max(position) + 1`.
- Edit: update title/details only when the card belongs to the authenticated board.
- Delete: delete the owned card and compact positions in its column in one transaction.
- Rename: update a non-empty title on one of the authenticated board's existing columns.
- Reorder: compute the canonical card order, temporarily shift affected positions above their current maximum, then write contiguous positions from zero in one transaction. This avoids transient unique-position collisions.
- Cross-column move: validate both columns against the authenticated board, shift positions in both columns, update the card's `column_id` and `board_id` together, and write both canonical orders in one transaction.
- Lookup: join `users` to its unique board, then return columns ordered by `position` and cards ordered by `position` with `id` as a deterministic tie-breaker.

All mutation failures roll back. API validation will enforce the fixed five-column set because an ordinary relational constraint cannot express “exactly five child rows” without unnecessary triggers.

## Board API

All board routes require the signed session and derive ownership from its username. Successful mutations return the complete canonical board.

| Method and path | Purpose |
| --- | --- |
| `GET /api/board` | Read the authenticated user's board |
| `PATCH /api/board/columns/{column_id}` | Rename an owned column |
| `POST /api/board/cards` | Append a card to an owned column |
| `PATCH /api/board/cards/{card_id}` | Edit an owned card's title or details |
| `DELETE /api/board/cards/{card_id}` | Delete an owned card and compact its column |
| `POST /api/board/cards/{card_id}/move` | Move or reorder an owned card by target column and zero-based position |
