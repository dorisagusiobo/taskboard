# SQLite data model

Part 5 defined the original single-board version of this contract; Part 6 implemented it. It has since been extended (see `CLAUDE.md`'s "Post-MVP architecture pivot") to real accounts and multi-board-per-user, implemented in `backend/database.py` and the authenticated `/api/boards[...]` routes.

## Scope and lifetime

The database persists users and Kanban boards. Authentication supports real, independently-registered accounts (see "Accounts and passwords" below) — the fixed `user` / `password` credential is only a zero-config seed account created on first run, not a hardcoded check. A user can own any number of boards, but never zero (deleting the last one is rejected). Every board has five fixed, ordered columns. Column titles and card content are editable; columns cannot be added, removed, or reordered.

The default file is `data/project-management.sqlite3`. Docker mounts the local named volume `project-management-mvp-data` at `/app/data`, so rebuilding the container does not erase it. `DATABASE_PATH` can override the file location for automated tests and local configuration.

AI conversation history is intentionally not stored in SQLite for the MVP. The frontend will keep the current conversation in memory and send at most the latest 20 messages to the AI endpoint. History clears on reload, logout, or tab close. Persisted chat can be added later if it becomes a product requirement, but it does not justify more tables now.

## Schema

The machine-readable source is [database-schema.json](database-schema.json).

| Table | Purpose | Ownership and ordering |
| --- | --- | --- |
| `users` | Stable identity for current and future users | Case-insensitive unique `username` |
| `boards` | Any number of Kanban boards per user | `user_id` foreign key (not unique); `UNIQUE (user_id, position)` orders a user's boards |
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
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Board',
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, position),
    CHECK (length(trim(name)) > 0),
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

API access starts with the username stored in the signed session. Every board-scoped route also takes a `{board_id}` path parameter, which `BoardStore._owned_board_id` re-validates against that session's boards on every call — a board ID that exists but belongs to someone else 404s exactly like one that doesn't exist at all. The client never selects a `user_id`, and a `board_id` it supplies is only ever used to look up a row it's proven to own.

A card stores both `column_id` and `board_id`; its composite foreign key must match one row in `board_columns`. SQLite therefore rejects attaching a card to a column belonging to another board. `PRAGMA foreign_keys = ON` must be enabled on every connection.

Deleting a user cascades through all of their boards, columns, and cards. Deleting a board (`DELETE /api/boards/{board_id}`) is exposed, but rejected with `LastBoardError` (HTTP 409) when it's a user's only remaining board, so cascades never leave a user with zero boards through normal use. The API does not expose user or column deletion.

## Initialization

On startup, `BoardStore.init_schema()` creates the schema when missing (including an `ALTER TABLE` fallback that adds `password_hash` to a pre-existing `users` table, so upgrading in place doesn't crash), then `BoardStore.ensure_seed_account("user", "password")` registers the zero-config seed account only if the `users` table is completely empty.

Beyond startup, `BoardStore.register_user(username, password)` is the only way a *user* gets created: it hashes the password, inserts the user row, and seeds their first board — five columns plus the eight demo cards from `database-schema.json` — all in one transaction. It raises `UsernameTakenError` for an existing username rather than silently reusing it. `BoardStore.create_board(username, name)` creates any subsequent board for an existing user: five fixed columns, no demo cards (those are onboarding content for the very first board only). Tests use a temporary `DATABASE_PATH`, never the developer database.

Note: the `boards.user_id UNIQUE` constraint from before multi-board support has no live migration path (SQLite can't drop a table constraint without a full rebuild). A database file created before this change keeps enforcing one-board-per-user for its existing account until that file is deleted and reseeded — see `backend/AGENTS.md`.

## Mutation walkthrough

- Create board: compute `max(position) + 1` among the user's boards, insert, then seed the fixed five columns (no demo cards).
- Rename/delete board: re-validate ownership via `{board_id}`, then update `name` or `DELETE`; delete is rejected (`LastBoardError`) if it's the user's only board.
- Create card: validate the owned board and target column, then append at `max(position) + 1`.
- Edit card: update title/details only when the card belongs to the owned board.
- Delete card: delete the owned card and compact positions in its column in one transaction.
- Rename column: update a non-empty title on one of the owned board's existing columns.
- Reorder: compute the canonical card order, temporarily shift affected positions above their current maximum, then write contiguous positions from zero in one transaction. This avoids transient unique-position collisions.
- Cross-column move: validate both columns against the owned board, shift positions in both columns, update the card's `column_id` and `board_id` together, and write both canonical orders in one transaction.
- Lookup: re-validate the `{board_id}` belongs to the session's user, then return columns ordered by `position` and cards ordered by `position` with `id` as a deterministic tie-breaker.

All mutation failures roll back. API validation will enforce the fixed five-column set on every board because an ordinary relational constraint cannot express “exactly five child rows” without unnecessary triggers.

## Board API

All routes require the signed session and derive ownership from its username plus the `{board_id}` path param where present. Successful board-content mutations return the complete canonical board.

| Method and path | Purpose |
| --- | --- |
| `GET /api/boards` | List the authenticated user's boards (id, name, position) |
| `POST /api/boards` | Create a new board (fixed five empty columns) |
| `GET /api/boards/{board_id}` | Read one owned board |
| `PATCH /api/boards/{board_id}` | Rename an owned board |
| `DELETE /api/boards/{board_id}` | Delete an owned board; 409 if it's the user's last one |
| `PATCH /api/boards/{board_id}/columns/{column_id}` | Rename an owned column |
| `POST /api/boards/{board_id}/cards` | Append a card to an owned column |
| `PATCH /api/boards/{board_id}/cards/{card_id}` | Edit an owned card's title or details |
| `DELETE /api/boards/{board_id}/cards/{card_id}` | Delete an owned card and compact its column |
| `POST /api/boards/{board_id}/cards/{card_id}/move` | Move or reorder an owned card by target column and zero-based position |
