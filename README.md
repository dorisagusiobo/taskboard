# Project Management MVP

This project is a local-first project management app with a FastAPI backend, a static frontend shell, and a single Docker container for local runtime.

## Local run

From the project root, use the platform script for your OS:

- macOS: `./scripts/start-mac.sh`
- Linux: `./scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The app is served at http://localhost:8000.
The start script returns only after the container reports a healthy API, or prints the container logs and exits with an error.

Sign in with username `user` and password `password`.

Board data is stored in the Docker volume `project-management-mvp-data` and survives container rebuilds and restarts.

To stop the container:

- macOS/Linux: `./scripts/stop-mac.sh` or `./scripts/stop-linux.sh`
- Windows PowerShell: `./scripts/stop-windows.ps1`

## Environment

- The project-root `.env` file is used for runtime secrets.
- `SESSION_SECRET` is optional for the local MVP. If omitted, the backend generates a new signing secret when it starts.
- `DATABASE_PATH` is optional and defaults to `/app/data/project-management.sqlite3` in Docker.
- Do not commit secrets or copy them into the Docker image.

## Tests

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy main.py database.py && uv run pytest -q
cd frontend && npm run lint && npm run test:unit && npm run build
./scripts/smoke-test-docker.sh
```

With the application running, execute the browser integration suite against the FastAPI-served export:

```bash
cd frontend
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npm run test:e2e
```
