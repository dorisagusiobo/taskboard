# Frontend instructions

These instructions apply to work under `frontend/` and supplement the repository-root `AGENTS.md`. If they conflict, the root instructions take precedence.

## Current application

- The frontend is a Next.js 16 App Router application using React 19 and strict TypeScript.
- It renders a single client-side Kanban application at `/`; there are no other frontend routes. Board switching happens client-side within that one route, not via routing.
- Next.js produces a static export that FastAPI serves from the final Docker image. The production image does not run a Next.js server.
- `src/app/page.tsx` renders `AuthGate`, and `src/app/layout.tsx` supplies metadata and Google fonts.
- `AuthGate` checks `/api/auth/me` before showing either `LoginForm` or the board. `LoginForm` toggles between sign-in and self-service registration (`POST /api/auth/register`); both flows use signed, HTTP-only backend sessions. Once authenticated, `ChangePasswordForm` in the header lets a user change their own password (`POST /api/auth/password`) without signing out; a 400 response means the current password was wrong (401 is reserved for "session expired," which the app's error handling treats as an automatic sign-out, so don't reuse it for this).
- After authentication, `KanbanBoard` loads the user's list of boards (`GET /api/boards`) and the active board's canonical state from FastAPI, and replaces local state only with API responses — no optimistic local-only state once a mutation is confirmed.
- Users can have any number of boards. `BoardSwitcher` lists them and handles create/rename/switch/delete; delete is hidden client-side when it's the user's only board (the backend also rejects it, so this is a UX nicety, not the source of truth).
- Every board has five fixed columns: Backlog, Discovery, In Progress, Review, and Done. Columns can be renamed but not added, removed, or reordered.
- Users can create, edit, remove, reorder, or move cards. A card also carries an optional due date (`YYYY-MM-DD` or empty) and up to 5 labels (short tags). All changes persist in SQLite through the same API endpoints manual edits and the AI assistant both use.
- A board-level search box (`KanbanBoard`) filters cards by title/details/label substring match (`cardMatchesQuery` in `src/lib/kanban.ts`, case-insensitive). Non-matching cards are hidden via CSS (a `hidden` class), not removed from the DOM or from `@dnd-kit`'s `SortableContext` — this keeps drag-and-drop indexing correct while filtered. A card currently being edited is never hidden, even if it stops matching the query, so its form stays reachable.
- Drag and drop uses pointer and keyboard sensors from `@dnd-kit/core` and `@dnd-kit/sortable`; `moveCard` in `src/lib/kanban.ts` calculates the intended destination without updating the UI optimistically.
- `KanbanBoard` renders the **Ask AI** control, which opens `AIChatSidebar`. The sidebar keeps its draft and conversation history in component state only (cleared on reload/logout), submits to the structured `/api/boards/{board_id}/ai/chat` endpoint (scoped to whichever board is currently active) through `KanbanBoard`, renders replies as plain text, and blocks a second submission while one is pending. A successful mutation replaces the board with the canonical response from FastAPI; a failed request keeps the last confirmed board and message draft for retry.
- Icons are small inline SVG components in `src/components/icons.tsx` (no icon library dependency) — reuse an existing one before adding a new one, and keep new icons the same stroke-based style (`baseProps` in that file).

## Structure

- `src/app/`: App Router entry points and global styling.
- `src/components/KanbanBoard.tsx`: owns the active board id, loads the board list and canonical active board, coordinates all mutations (including board management and search state), errors.
- `src/components/BoardSwitcher.tsx`: lists the user's boards as pills; create/rename/switch/delete.
- `src/components/KanbanColumn.tsx`: droppable column, rename input, card list (with search-filtered visibility and match-count header), and add-card form.
- `src/components/KanbanCard.tsx`: sortable card — displays due-date badge (overdue in red, via `isOverdue`) and label chips (colored via `labelAccent`), and edit/remove actions; hides itself via CSS when it doesn't match the active search query and isn't being edited.
- `src/components/KanbanCardPreview.tsx`: drag-overlay presentation (title/details only, no badges/chips — kept intentionally minimal).
- `src/components/NewCardForm.tsx`: local add-card form state (title, details, due date, labels) and validation.
- `src/components/AIChatSidebar.tsx`: Ask AI drawer — draft/history state, submission handling, focus trap and keyboard access, pending/error display.
- `src/components/LoginForm.tsx`: sign-in/create-account toggle form.
- `src/components/ChangePasswordForm.tsx`: collapsed-by-default inline form (current password, new password) shown in the authenticated header.
- `src/components/AuthGate.tsx`: session check, login/register/logout/change-password handlers, gates `LoginForm` vs. `KanbanBoard`.
- `src/components/icons.tsx`: shared inline-SVG icon components.
- `src/lib/api.ts`: typed API client (auth, board management, board content, AI chat) plus response normalization (snake_case wire format \<-\> camelCase/array frontend types, e.g. `due_date`/`dueDate`, `labels` string \<-\> `string[]`).
- `src/lib/kanban.ts`: board types and pure logic — move/reorder planning (`moveCard`), due-date overdue check (`isOverdue`), label parsing/formatting/coloring (`parseLabels`/`formatLabels`/`labelAccent`), and search matching (`cardMatchesQuery`). No side effects; this is where all UI-independent board math lives, and the first place to add a unit test for new pure behavior.
- `src/test/fixtures.ts`: shared `ApiBoard` test fixture (`cloneBoard`) used across Vitest suites — keep it in sync with `ApiBoard`'s shape when adding a field.
- `src/**/*.test.ts(x)`: Vitest unit/component tests.
- `tests/`: Playwright browser tests (run against the real FastAPI backend via `scripts/test-e2e-docker.sh`, not mocked).

## Styling

- Tailwind CSS 4 is loaded from `src/app/globals.css`.
- Preserve the root project color scheme through the existing CSS variables: `--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, and `--gray-text`. Don't introduce new arbitrary colors for things like label chips or status badges — derive variants from these five (e.g. `bg-[var(--primary-blue)]/15` tinted backgrounds, as `KanbanCard`'s label chips and due-date badge already do).
- The display font is Space Grotesk and the body font is Manrope.
- Keep new UI consistent with the existing rounded surfaces, restrained shadows, spacing, and accessible semantic controls.
- Preserve usable keyboard focus, labels, and responsive behavior when changing interactions.

## Commands

Run commands from `frontend/`:

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
npm run test:all
```

## Testing requirements

- Use Vitest and Testing Library for pure logic and component behavior.
- Use Playwright for user-visible workflows and cross-layer integration behavior.
- Maintain at least 80% unit-test coverage. Enforce a failing threshold for statements/lines, branches, and functions in Vitest configuration.
- Vitest reports coverage and fails below 80% for statements, branches, functions, or lines.
- Add or update tests for every behavior change, in the same commit.
- Prefer role, label, and visible-text queries. Use test IDs only when interaction mechanics such as drag-and-drop make semantic queries impractical.
- Integration tests must cover critical workflows through the real FastAPI API and a temporary SQLite database. Mock only the external OpenRouter boundary in the default suite (`scripts/fake-openrouter-server.py` in the Docker e2e suite; a `FakeOpenRouterClient` in backend unit tests).
- jsdom (used by Vitest/Testing Library) does not apply real CSS, so a Tailwind `hidden` class has no effect on `toBeVisible()` there — assert on `className` containing `"hidden"` instead. Playwright's e2e suite runs a real browser, where `toBeVisible()`/`toBeHidden()` do work correctly against CSS-driven visibility.
- Playwright specs share one seeded account and Docker volume across the whole suite run within a file, executed in file order — a test must not assume the original demo card titles still exist by the time it runs (earlier tests rename columns and delete/add cards). Create cards with a distinctive title within the test itself rather than depending on seed content surviving.
- When a card gains a stateful UI (e.g. entering edit mode), don't scope a Playwright locator with `.filter({ hasText: ... })` against text that lives inside an `<input>`'s `value` — `value` isn't part of `textContent`, so the locator stops matching once editing starts. Capture the card's `data-testid` while in display mode instead and reuse `page.getByTestId(id)`, which stays stable across state changes (see `kanban.spec.ts`'s due-date and labels tests for the pattern).
- `getByLabel`/`getByText` do substring matching by default in Playwright (and jsdom Testing Library). A short field label that's also a substring of a nearby button's `aria-label` — e.g. an input labeled "New password" next to a button labeled "Save new password" — is ambiguous and throws a strict-mode violation. Pass `{ exact: true }` on the shorter one rather than renaming the button. Similarly, Next.js always renders a hidden `role="alert"` route-announcer element in the DOM, so a bare `page.getByRole("alert")` can match two elements once any other alert is on screen — scope it (e.g. `page.locator("form").getByRole("alert")`) or assert on the visible text directly instead.

## Implementation constraints

- Keep the frontend compatible with a static Next.js export served by FastAPI; do not introduce a dependency on a Next.js runtime server.
- Keep backend requests under relative `/api/*` URLs so the static frontend and API share one origin.
- Treat the backend's response as canonical board/board-list state and avoid duplicating mutation rules in UI components.
- Keep the five-column set fixed per board. Column names may change, but the UI must not add, delete, or reorder columns — this applies to every board, not just a user's first one.
- A user must always end up with at least one board in the UI; `BoardSwitcher` hides the delete affordance on a lone board to match the backend's `LastBoardError` guard, but don't rely on the UI hide alone — handle the 409 the backend can still return.
- Keep components and state flow simple. Extract abstractions only when they remove real duplication or isolate a testable boundary.
- Do not expose `OPENROUTER_API_KEY` or any other server secret to browser code, public environment variables, generated assets, or logs.
