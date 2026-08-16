# Backend

The backend is a synchronous FastAPI application using Python's standard `sqlite3` module. `main.py` owns HTTP models, signed-session authentication, API routes, and static frontend serving. `database.py` owns schema initialization, seed data, ownership-scoped board queries, and transactional mutations.

## Runtime rules

- Resolve the user only from the signed session. Board requests must never accept a client-selected user or board owner.
- Enable SQLite foreign keys on every connection.
- Keep the five seeded columns fixed. They may be renamed but not created, deleted, or reordered through the API.
- Return the canonical board after every successful board mutation.
- Keep multi-row card moves and position compaction transactional.
- Initialize missing data idempotently and never overwrite an existing board.
- Keep the OpenRouter key and the fixed MVP password on the backend.

## Tests

- Use a temporary SQLite database for every test; never open or modify the developer database.
- Exercise API behavior with FastAPI's test client and real SQLite connections.
- Maintain the configured 80% minimum branch, statement, and line coverage across `main.py` and `database.py`.
- Run `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy main.py database.py`, and `uv run pytest -q` from `backend/`.
