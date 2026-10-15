# Taskboard

**A kanban board with an AI assistant that organizes the work with you.**

**Live demo:** _coming soon_ (sign in with the one-click demo account)

Taskboard is a local-first project management app for small teams. You keep a clear five-column board, and when you'd rather describe the work than click through it, you ask the AI assistant to create, edit or move cards for you.

## Features

- **AI assistant.** Ask in plain language ("add a card for the launch email, due Friday, labelled marketing") and it creates, edits or moves cards on the board you have open. Every change it makes is validated before it's saved.
- **Real accounts.** Self-service sign-up, hashed passwords, password change, and account deletion with a confirmation step.
- **Many boards per person.** Create, rename, switch between and delete boards. Each one has the same five columns: Backlog, Discovery, In Progress, Review, Done.
- **Due dates and labels.** Overdue cards get a red badge. Up to five labels per card, set by hand or by the assistant.
- **Search.** Filter cards by title, details or label. Press `/` to jump to search and `Escape` to clear it.
- **Export.** Download any board as CSV or JSON.
- **What's at risk.** One click checks the board for overdue cards, cards due in the next three days, and work in progress or review with no due date. The AI turns those findings into a short plain-language summary with up to three next steps.

## Design decisions

- **Fixed columns.** Five well-known stages keep every board readable at a glance. Teams spend their time on the work, not on configuring the board.
- **No setup before value.** A ready-made account and sample cards on first launch let someone try it in seconds.
- **Destructive actions need confirmation.** Deleting an account asks for the password again, because it can't be undone.
- **The AI proposes, the app validates.** Assistant changes go through the same validation as manual edits, so a bad model response can't corrupt a board.
- **The app finds the facts, the AI explains them.** The risk check is plain code, so it's predictable and tested. The AI only sees those findings, so its summary can't invent cards or dates, and the findings still show if the AI is unavailable.

## How it works

```
Browser (Next.js static export)
   │  board edits, auth, AI chat
   ▼
FastAPI backend ──► OpenRouter (gpt-oss-120b), structured board operations
   │
   ▼
SQLite (users, boards, cards)        Single Docker container
```

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLite |
| AI | OpenRouter (`openai/gpt-oss-120b`) |
| Testing | pytest (125 tests, 98% coverage), Vitest (86 tests), Playwright end-to-end, Docker smoke tests |
| Delivery | Docker, start/stop scripts for macOS, Linux and Windows |

## Credits

Taskboard started from the kanban project template in [Ed Donner](https://github.com/ed-donner)'s AI engineering course ([ed-donner/pm](https://github.com/ed-donner/pm)). The template provided a front-end-only kanban demo and the build plan. I built everything else: the FastAPI backend and database, authentication and account management, the AI assistant, the What's at risk report, multiple boards, due dates and labels, search, export, Docker packaging and the test suites.

Built by **Doris Agusiobo Echianu**, AI engineer and designer. [Portfolio](https://doris-agusiobo-echianu.vercel.app) · [LinkedIn](https://www.linkedin.com/in/doris-agusiobo-echianu-83571764)

## Local run

From the project root, use the platform script for your OS:

- macOS: `./scripts/start-mac.sh`
- Linux: `./scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The app is served at http://localhost:8000.
The start script returns only after the container reports a healthy API, or prints the container logs and exits with an error.

A zero-config account (username `user`, password `password`) is created automatically the first time the app starts with an empty database, so you can sign in right away. Use "Need an account? Create one" on the sign-in screen to register additional accounts (username 3+ characters, password 8+ characters) — each account gets its own private boards. Use "Change password" next to "Sign out" to change your password once signed in. There is no password-reset flow, so keep your password somewhere safe. "Delete account" permanently deletes your account and every board you own after you re-enter your password to confirm — this cannot be undone.

Each account can hold any number of boards. Use the board switcher at the top of the page to create, rename, switch between, or delete boards (you always keep at least one). Every board has the same five fixed columns (Backlog, Discovery, In Progress, Review, Done); only the first board created for a new account starts with sample cards.

Cards can carry a due date (overdue ones get a red badge) and up to 5 short labels. Use the search box above a board to filter its cards by title, details, or label — press `/` anywhere on the page to jump into it, and `Escape` while it's focused to clear it. Use **Export** next to the board switcher to download the current board as CSV or JSON.

Use **Ask AI** on the board to open the assistant. The assistant can answer questions and create, edit, or move cards on the board you currently have open. Conversation history stays only in browser memory and clears on reload or logout; validated board changes persist in SQLite.

Board data is stored in the Docker volume `project-management-mvp-data` and survives container rebuilds and restarts.

To stop the container:

- macOS/Linux: `./scripts/stop-mac.sh` or `./scripts/stop-linux.sh`
- Windows PowerShell: `./scripts/stop-windows.ps1`

## Environment

- The project-root `.env` file is used for runtime secrets.
- `OPENROUTER_API_KEY` is required for AI requests and remains server-side.
- `SESSION_SECRET` is optional for the local MVP. If omitted, the backend generates a new signing secret when it starts.
- `DEMO_MODE=true` (public demo only) shows the seed account on the sign-in screen and blocks changing its password or deleting it, so it keeps working for every visitor. Defaults to off.
- `COOKIE_SECURE=true` marks the session cookie HTTPS-only. Use it when served over HTTPS.
- `DATABASE_PATH` is optional and defaults to `/app/data/project-management.sqlite3` in Docker.
- Do not commit secrets or copy them into the Docker image.

## Deploy

The repo includes a [Render](https://render.com) Blueprint (`render.yaml`). In Render, choose **New > Blueprint**, connect this repository and paste your `OPENROUTER_API_KEY`. It runs on the free plan with demo mode and secure cookies on and a generated session secret. Free instances sleep when idle and the SQLite database resets on restart, so the demo board comes back fresh. Give the OpenRouter key a credit limit, since anyone can sign up and use the AI.

## Tests

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy main.py database.py ai_service.py openrouter_client.py auth.py risk.py && uv run pytest -q
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
