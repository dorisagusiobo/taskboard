# Backend

The backend is a synchronous FastAPI application using Python's standard `sqlite3` module. `main.py` owns HTTP models, signed-session authentication, API routes, and static frontend serving. `database.py` owns schema initialization, seed data, ownership-scoped board queries, and transactional mutations. `ai_service.py` owns the structured AI contract and prompt assembly, `openrouter_client.py` owns the external provider boundary, and `auth.py` owns password hashing.

## Runtime rules

- Resolve the user only from the signed session. Board requests must never accept a client-selected user or board owner; the `{board_id}` path param is always re-checked against that session's boards (`BoardStore._owned_board_id`), never trusted on its own.
- Enable SQLite foreign keys on every connection.
- Keep the five seeded columns fixed per board. They may be renamed but not created, deleted, or reordered through the API. This applies to every board a user creates, not just their first one.
- A user can own any number of boards (`boards.user_id` is not unique), but never zero: `BoardStore.delete_board` raises `LastBoardError` (mapped to HTTP 409) when asked to delete a user's only remaining board.
- A newly created board (`POST /api/boards`) seeds the fixed five columns but no demo cards — the demo cards are onboarding content for the first board only, created inside `register_user`.
- Return the canonical board after every successful board-content mutation.
- Keep multi-row card moves and position compaction transactional.
- Registration (`BoardStore.register_user`) is transactional and rejects an existing username (`UsernameTakenError`, mapped to HTTP 409) rather than silently reusing it. Never overwrite an existing user's password or board.
- Hash passwords with `auth.hash_password`/`auth.check_password` (PBKDF2-HMAC-SHA256, stdlib only). Never store or log a plaintext password, and never compare passwords with `==` — use `auth.check_password`, which is constant-time.
- `BoardStore.ensure_seed_account` only fires when the `users` table is completely empty (fresh install), so it never collides with, or masks, real registrations.
- `_ensure_schema` only carries live migrations for additive columns (`ALTER TABLE ... ADD COLUMN`): `users.password_hash`, `cards.due_date`, and `cards.labels`. The `boards` table's `UNIQUE (user_id)` constraint from before multi-board support has no equivalent live migration (SQLite can't drop a constraint without a full table rebuild) — a local database created before multi-board support landed keeps single-board behavior for its existing user until that database file is deleted and reseeded. This is a deliberate simplicity-over-engineering call for a local-first personal tool, not an oversight.
- `cards.due_date` and `cards.labels` are both `''` for "unset," never `NULL` — same convention as `details`. On update, `None`/absent means "leave it unchanged" and `""` means "clear it" for each of them independently; that's why `UpdateCardRequest.require_a_change` and `BoardStore._update_card` treat title/details/due_date/labels as four independently-optional fields rather than collapsing them together.
- Card due-date format (`''` or `YYYY-MM-DD`, real calendar dates via `date.fromisoformat`) and label format (`''` or comma-separated, at most 5 labels of 24 characters each, deduplicated case-insensitively) are each validated independently in `main.py` (`CardDueDate`/`CardLabels`, manual API) and `ai_service.py` (same names, AI operations) — the same duplication pattern already used for `CardTitle`/`CardDetails` between those two modules. Keep all four in sync when changing a format.
- Validate every structured AI response before applying its operations, and apply a response's full operation list in one database transaction.

## Tests

- Use a temporary SQLite database for every test; never open or modify the developer database.
- Exercise API behavior with FastAPI's test client and real SQLite connections.
- Maintain the configured 80% minimum branch, statement, and line coverage across `main.py` and `database.py`.
- Run `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy main.py database.py ai_service.py openrouter_client.py auth.py`, and `uv run pytest -q` from `backend/`.
- Keep the live OpenRouter test opt-in; the default suite must not require network access or credentials.
- Any new backend module must also be added to the `Dockerfile`'s explicit `COPY backend/*.py` list — `uv run pytest` runs directly against `backend/`, so a missing `COPY` line only surfaces in the Docker e2e suite, not the local suite. Run `./scripts/test-e2e-docker.sh` after adding a module.
