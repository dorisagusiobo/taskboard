# Project Management MVP

This project is a local-first project management app with a FastAPI backend, a static Next.js frontend, SQLite persistence, and a single Docker container for local runtime.

## Local run

From the project root, use the platform script for your OS:

- macOS: `./scripts/start-mac.sh`
- Linux: `./scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The app is served at http://localhost:8000.
The start script returns only after the container reports a healthy API, or prints the container logs and exits with an error.

A zero-config account (username `user`, password `password`) is created automatically the first time the app starts with an empty database, so you can sign in right away. Use "Need an account? Create one" on the sign-in screen to register additional accounts (username 3+ characters, password 8+ characters) — each account gets its own private boards. Use "Change password" next to "Sign out" to change your password once signed in. There is no password-reset flow, so keep your password somewhere safe. "Delete account" permanently deletes your account and every board you own after you re-enter your password to confirm — this cannot be undone.

Each account can hold any number of boards. Use the board switcher at the top of the page to create, rename, switch between, or delete boards (you always keep at least one). Every board has the same five fixed columns (Backlog, Discovery, In Progress, Review, Done); only the first board created for a new account starts with sample cards.

Cards can carry a due date (overdue ones get a red badge) and up to 5 short labels. Use the search box above a board to filter its cards by title, details, or label. Use **Export** next to the board switcher to download the current board as CSV or JSON.

Use **Ask AI** on the board to open the assistant. The assistant can answer questions and create, edit, or move cards on the board you currently have open. Conversation history stays only in browser memory and clears on reload or logout; validated board changes persist in SQLite.

Board data is stored in the Docker volume `project-management-mvp-data` and survives container rebuilds and restarts.

To stop the container:

- macOS/Linux: `./scripts/stop-mac.sh` or `./scripts/stop-linux.sh`
- Windows PowerShell: `./scripts/stop-windows.ps1`

## Environment

- The project-root `.env` file is used for runtime secrets.
- `OPENROUTER_API_KEY` is required for AI requests and remains server-side.
- `SESSION_SECRET` is optional for the local MVP. If omitted, the backend generates a new signing secret when it starts.
- `DATABASE_PATH` is optional and defaults to `/app/data/project-management.sqlite3` in Docker.
- Do not commit secrets or copy them into the Docker image.

## Tests

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy main.py database.py ai_service.py openrouter_client.py auth.py && uv run pytest -q
cd frontend && npm run lint && npm run test:unit && npm run build
./scripts/smoke-test-docker.sh
./scripts/test-e2e-docker.sh
```

Run the opt-in OpenRouter connectivity check with the project-root `.env` key:

```bash
cd backend
uv run --env-file ../.env python -m openrouter_client
RUN_OPENROUTER_LIVE=1 uv run --env-file ../.env pytest -q --no-cov -m live tests/test_openrouter_live.py
RUN_OPENROUTER_LIVE=1 uv run --env-file ../.env pytest -q --no-cov -m live tests/test_ai_live.py
```

`test-e2e-docker.sh` uses an isolated Docker volume and a deterministic local OpenRouter-compatible test server. It exercises authentication, manual and AI board mutations, error/retry behavior, keyboard and narrow-screen use, reload behavior, and container-restart persistence without spending API credits. It removes all test runtime resources on exit.

With the application already running, execute the browser suite directly against the FastAPI-served export:

```bash
cd frontend
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npm run test:e2e
```
