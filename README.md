# Project Management MVP

This project is a local-first project management app with a FastAPI backend, a static Next.js frontend, SQLite persistence, and a single Docker container for local runtime.

## Local run

From the project root, use the platform script for your OS:

- macOS: `./scripts/start-mac.sh`
- Linux: `./scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The app is served at http://localhost:8000.
The start script returns only after the container reports a healthy API, or prints the container logs and exits with an error.

Sign in with username `user` and password `password`.

Use **Ask AI** on the board to open the assistant. The assistant can answer questions and create, edit, or move cards. Conversation history stays only in browser memory and clears on reload or logout; validated board changes persist in SQLite.

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
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy main.py database.py ai_service.py openrouter_client.py && uv run pytest -q
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
