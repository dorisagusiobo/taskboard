# Backend

The backend is a synchronous FastAPI application using Python's standard `sqlite3` module. `main.py` owns HTTP models, signed-session authentication, API routes, and static frontend serving. `database.py` owns schema initialization, seed data, ownership-scoped board queries, and transactional mutations. `ai_service.py` owns the structured AI contract and prompt assembly, `openrouter_client.py` owns the external provider boundary, and `auth.py` owns password hashing.

## Runtime rules

- Resolve the user only from the signed session. Board requests must never accept a client-selected user or board owner.
- Enable SQLite foreign keys on every connection.
- Keep the five seeded columns fixed. They may be renamed but not created, deleted, or reordered through the API.
- Return the canonical board after every successful board mutation.
- Keep multi-row card moves and position compaction transactional.
- Registration (`BoardStore.register_user`) is transactional and rejects an existing username (`UsernameTakenError`, mapped to HTTP 409) rather than silently reusing it. Never overwrite an existing user's password or board.
- Hash passwords with `auth.hash_password`/`auth.check_password` (PBKDF2-HMAC-SHA256, stdlib only). Never store or log a plaintext password, and never compare passwords with `==` — use `auth.check_password`, which is constant-time.
- `BoardStore.ensure_seed_account` only fires when the `users` table is completely empty (fresh install), so it never collides with, or masks, real registrations.
- Validate every structured AI response before applying its operations, and apply a response's full operation list in one database transaction.

## Tests

- Use a temporary SQLite database for every test; never open or modify the developer database.
- Exercise API behavior with FastAPI's test client and real SQLite connections.
- Maintain the configured 80% minimum branch, statement, and line coverage across `main.py` and `database.py`.
- Run `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy main.py database.py ai_service.py openrouter_client.py auth.py`, and `uv run pytest -q` from `backend/`.
- Keep the live OpenRouter test opt-in; the default suite must not require network access or credentials.
- Any new backend module must also be added to the `Dockerfile`'s explicit `COPY backend/*.py` list — `uv run pytest` runs directly against `backend/`, so a missing `COPY` line only surfaces in the Docker e2e suite, not the local suite. Run `./scripts/test-e2e-docker.sh` after adding a module.
