# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A local-first Kanban project management app: FastAPI backend (Python, sync `sqlite3`), a statically-exported Next.js frontend served by FastAPI, SQLite persistence, and an AI chat sidebar (OpenRouter) that can create/edit/move cards. Ships as a single Docker container for local use. See root `AGENTS.md` for product/business requirements and coding-standards ground rules (simplicity over engineering, no emojis, root-cause debugging), and `docs/PLAN.md` for the part-by-part build history (all 10 parts implemented).

**Post-MVP architecture pivot:** the original MVP shipped a single hardcoded user and exactly one board. It is now a real multi-user, multi-board product: real per-user accounts (hashed passwords, self-service registration, password change, account deletion), multi-board-per-user, card due dates and labels (both manual and AI-assisted), client-side card search, and CSV/JSON board export have all landed. The per-board shape is still fixed at exactly five columns (Backlog/Discovery/In Progress/Review/Done) — that constraint was deliberately kept, not dropped. Further product features remain open follow-ups; see git history for what's landed so far.

There are three `AGENTS.md` files with directory-scoped rules: root, `backend/AGENTS.md`, `frontend/AGENTS.md` (the latter two supplement, and are subordinate to, the root file). Read the relevant one before editing in that directory.

## Commands

Run from `backend/` (uses `uv`):
```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy main.py database.py ai_service.py openrouter_client.py auth.py
uv run pytest -q                          # full suite, 80% coverage gate (main/database/ai_service/openrouter_client)
uv run pytest -q tests/test_board_api.py  # single file
uv run pytest -q tests/test_board_api.py::test_name  # single test
```

Run from `frontend/`:
```bash
npm run dev
npm run build        # static export consumed by Docker/FastAPI
npm run lint
npm run test:unit    # vitest, 80% coverage gate
npm run test:e2e     # playwright, needs the app already running
npm run test:all
```

Opt-in live OpenRouter checks (need `OPENROUTER_API_KEY` in project-root `.env`; excluded from default suite):
```bash
cd backend
uv run --env-file ../.env python -m openrouter_client
RUN_OPENROUTER_LIVE=1 uv run --env-file ../.env pytest -q --no-cov -m live tests/test_openrouter_live.py
RUN_OPENROUTER_LIVE=1 uv run --env-file ../.env pytest -q --no-cov -m live tests/test_ai_live.py
```

Whole-app / Docker (from repo root):
```bash
./scripts/start-mac.sh   # or start-linux.sh / start-windows.ps1; blocks until healthy, serves at :8000
./scripts/stop-mac.sh    # or stop-linux.sh / stop-windows.ps1
./scripts/smoke-test-docker.sh
./scripts/test-e2e-docker.sh   # isolated volume + deterministic fake OpenRouter server, no API spend
```

On first run, a zero-config seed account (`user` / `password`) is auto-registered so the app works immediately (`BoardStore.ensure_seed_account`, only fires when the `users` table is empty). Real accounts now go through `POST /api/auth/register` (username 3-50 chars `[A-Za-z0-9_-]`, password 8+ chars) with PBKDF2-hashed passwords (`backend/auth.py`, stdlib-only, no new dependency); the frontend login screen has a "Create one" toggle for this. `POST /api/auth/login` verifies against the stored hash. Once signed in, `POST /api/auth/password` (`ChangePasswordForm` in the header) lets a user change their own password given the current one; there is no password-reset flow. `POST /api/auth/delete-account` (`DeleteAccountForm`, red-styled, requires re-entering the password) permanently deletes the account and, via `ON DELETE CASCADE`, every board it owned — irreversible, no soft-delete or undo.

## Architecture

**Single-origin deployment**: Next.js builds a static export (`frontend/out`) that FastAPI mounts at `/` via `StaticFiles`; the production image runs no Node server. Frontend API calls must stay on relative `/api/*` paths so dev and Docker share one origin.

**Backend module boundaries** (`backend/`, all synchronous):
- `main.py` — FastAPI app factory (`create_app`), Pydantic request/response models, signed-cookie session auth (`itsdangerous`/`SessionMiddleware`), all HTTP routes, and static file mounting.
- `database.py` — `BoardStore`: schema init/seeding, ownership-scoped queries, and all board/card/column mutations. Every mutation is transactional; multi-row moves shift positions above current max before writing contiguous positions to avoid unique-constraint collisions mid-transaction.
- `ai_service.py` — builds the OpenRouter structured-output request (board + history + message), and validates/parses the model's structured JSON response into typed operations.
- `openrouter_client.py` — the only module that talks to OpenRouter; owns API key handling and provider error mapping.
- `auth.py` — PBKDF2-HMAC-SHA256 password hashing (`hash_password`/`check_password`), stdlib `hashlib`/`secrets` only.

Auth is always resolved server-side from the signed session (`request.session["username"]`); routes never trust a client-supplied user or board ID — every board/column/card route re-derives ownership by joining on the session username *and* the `{board_id}` path param (`BoardStore._owned_board_id`), so a valid board ID that belongs to someone else 404s exactly like a nonexistent one. Accounts are real (hashed passwords in `users.password_hash`, self-service `POST /api/auth/register`), not a single hardcoded credential.

**Multi-board per user**: `boards.user_id` is a plain (non-unique) foreign key with a `UNIQUE (user_id, position)` pair — a user can own any number of boards. `POST /api/boards` creates a new board (fixed five empty columns, no demo cards — those only seed the first board created at registration); `GET /api/boards` lists a user's boards (id/name/position); `PATCH /api/boards/{id}` renames one; `DELETE /api/boards/{id}` deletes one but is rejected with 409 (`LastBoardError`) if it's the user's only remaining board — the product never lets a user end up with zero boards. All existing board-content routes moved under the board: `/api/boards/{board_id}/columns/{column_id}`, `/api/boards/{board_id}/cards[/...]`, `/api/boards/{board_id}/ai/chat`.

**Fixed board shape**: every board (regardless of how many a user has) has exactly five columns (Backlog, Discovery, In Progress, Review, Done). Columns can be renamed but never created/deleted/reordered via the API — this is enforced in application code, not a DB constraint (SQLite can't express "exactly five child rows" declaratively). See `docs/DATABASE.md` for the full schema, ownership-guarantee reasoning, and mutation walkthroughs (create/edit/delete/rename/reorder/cross-column move).

**AI mutation path**: `POST /api/boards/{board_id}/ai/chat` sends that board's canonical state + up to 20 prior messages (kept client-side only, never persisted) to OpenRouter (`openai/gpt-oss-120b`) requesting strict JSON Schema output. The response is re-validated server-side, and any `operations` (create_card/edit_card/move_card, max 20) are applied through the *same* `BoardStore` mutation methods manual edits use, in one transaction, scoped to that board — invalid output rolls back entirely and never partially updates the board. The system prompt includes today's date so the model can resolve relative due dates ("tomorrow"). Full contract in `docs/AI.md`.

**Card due dates and labels**: `cards.due_date` is `''` (no due date) or `YYYY-MM-DD`; `cards.labels` is `''` (none) or a comma-separated list (at most 5, 24 chars each). Both are validated identically but independently (see `backend/AGENTS.md`) in `main.py` and `ai_service.py`, and both follow the same PATCH convention: field absent/null leaves it unchanged, `""` clears it. `frontend/src/lib/kanban.ts`'s `isOverdue` is the single source of truth for overdue styling (`due_date < today`, string comparison); there's no separate "done" flag, so a card can be overdue regardless of which column it's in. `parseLabels`/`formatLabels` convert the wire string to/from a `string[]` for display, and `labelAccent` deterministically hashes a label to one of 3 fixed palette colors — purely a display concern, nothing color-related is stored server-side.

**Card search**: purely client-side, no backend involvement. `KanbanBoard` holds a `searchQuery` string; `lib/kanban.ts`'s `cardMatchesQuery` does a case-insensitive substring match against title, details, and labels. Non-matching cards get a `hidden` CSS class rather than being removed from the DOM or from `@dnd-kit`'s per-column `SortableContext` — removing them would break drag-index math — and a card being edited is never hidden even if the query no longer matches it.

**Board export**: also purely client-side — the board is already loaded in full, so CSV/JSON generation and the file download both happen in the browser with no new API endpoint. `lib/kanban.ts`'s `boardToExportRows`/`rowsToCsv` are pure and unit-tested; `ExportBoardMenu` does the actual `Blob` + `URL.createObjectURL` + synthetic `<a download>` click, which is DOM-dependent and only lightly tested (mocked `URL.createObjectURL`/`revokeObjectURL` and a spy on `HTMLAnchorElement.prototype.click`) — the Playwright e2e test is what actually verifies a real download and its content via `page.waitForEvent("download")`.

**Frontend structure** (`frontend/src/`):
- `components/KanbanBoard.tsx` — owns the active board id and search query, loads the board list and the canonical active board from the API, and coordinates all mutations; treats API responses as the source of truth (no optimistic local-only state once persistence exists).
- `components/BoardSwitcher.tsx` — lists the user's boards as pills, and handles select/create/rename/delete (delete is hidden when it's the only board, mirroring the backend's `LastBoardError` guard).
- `components/ExportBoardMenu.tsx` — downloads the active board as CSV or JSON; no backend involvement.
- `components/KanbanColumn.tsx`, `KanbanCard.tsx`, `KanbanCardPreview.tsx`, `NewCardForm.tsx` — column/card presentation, drag-and-drop targets, card add/edit forms, and search-driven visibility.
- `components/AuthGate.tsx` / `LoginForm.tsx` — checks `/api/auth/me` to gate the login/register form vs. board; `LoginForm` toggles between sign-in and self-service registration (`POST /api/auth/register`).
- `components/ChangePasswordForm.tsx` — collapsed-by-default inline form in the authenticated header (`POST /api/auth/password`).
- `components/DeleteAccountForm.tsx` — collapsed-by-default, red-styled inline form in the authenticated header (`POST /api/auth/delete-account`); irreversible.
- `components/AIChatSidebar.tsx` — the Ask AI drawer; calls `/api/boards/{board_id}/ai/chat` and replaces board state with the canonical response on a successful mutation.
- `components/icons.tsx` — shared inline-SVG icons (no icon library dependency).
- `lib/kanban.ts` — pure board types, move/reorder planning logic, due-date/label/search/export helpers (no side effects; this is where all UI-independent board math lives).
- `lib/api.ts` — typed fetch client for auth/board-management/board-content/AI endpoints plus response normalization (snake_case wire format to camelCase/array frontend types).

Drag-and-drop uses `@dnd-kit` pointer/keyboard sensors; destination calculation happens in `lib/kanban.ts` before any state update (not optimistically inline in the component).

Styling: Tailwind CSS 4, CSS variables for the fixed palette (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`), Space Grotesk (display) / Manrope (body) fonts — see `AGENTS.md` for the hex values and root cause of the scheme.

## Testing conventions

- Both backend and frontend enforce an 80% coverage gate (branches/statements/lines on backend; statements/branches/functions/lines on frontend) — failing coverage fails the suite, don't lower the threshold to make a change pass.
- Backend tests always use a temporary SQLite DB via `DATABASE_PATH`/fixtures — never the developer DB.
- Live OpenRouter tests are marked `live` and excluded by default; they require `RUN_OPENROUTER_LIVE=1` and a real key.
- `scripts/test-e2e-docker.sh` runs against `scripts/fake-openrouter-server.py`, a deterministic local stand-in for OpenRouter, so end-to-end tests never spend API credits.
