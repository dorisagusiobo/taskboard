# Frontend instructions

These instructions apply to work under `frontend/` and supplement the repository-root `AGENTS.md`. If they conflict, the root instructions take precedence.

## Current application

- The frontend is a Next.js 16 App Router application using React 19 and strict TypeScript.
- It renders a single client-side Kanban demo at `/`; there are no other frontend routes.
- Next.js produces a static export that FastAPI serves from the final Docker image. The production image does not run a Next.js server.
- `src/app/page.tsx` renders `AuthGate`, and `src/app/layout.tsx` supplies metadata and Google fonts.
- After authentication, `KanbanBoard` loads the user's canonical board from FastAPI and replaces local state only with API responses.
- The board has five fixed columns: Backlog, Discovery, In Progress, Review, and Done.
- Users can rename columns and create, edit, remove, reorder, or move cards. All changes persist in SQLite.
- Drag and drop uses pointer and keyboard sensors from `@dnd-kit/core` and `@dnd-kit/sortable`; `moveCard` in `src/lib/kanban.ts` calculates the intended destination without updating the UI optimistically.
- `AuthGate` checks `/api/auth/me` before showing either the login form or board. Login and logout use signed, HTTP-only backend sessions.
- The structured AI backend endpoint exists, but the AI chat sidebar is deferred to Part 10 and is not implemented in the frontend yet.

## Structure

- `src/app/`: App Router entry points and global styling.
- `src/components/KanbanBoard.tsx`: API-backed board loading, canonical state, errors, and mutation coordination.
- `src/components/KanbanColumn.tsx`: droppable column, rename input, card list, and add-card form.
- `src/components/KanbanCard.tsx`: sortable card and edit/remove actions.
- `src/components/KanbanCardPreview.tsx`: drag-overlay presentation.
- `src/components/NewCardForm.tsx`: local add-card form state and validation.
- `src/lib/api.ts`: typed authentication and board API client plus response normalization.
- `src/lib/kanban.ts`: board types and pure move/reorder planning logic.
- `src/**/*.test.ts(x)`: Vitest unit/component tests.
- `tests/`: Playwright browser tests.

## Styling

- Tailwind CSS 4 is loaded from `src/app/globals.css`.
- Preserve the root project color scheme through the existing CSS variables: `--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, and `--gray-text`.
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
- Add or update tests in the same part as every behavior change.
- Prefer role, label, and visible-text queries. Use test IDs only when interaction mechanics such as drag-and-drop make semantic queries impractical.
- Integration tests must cover critical workflows through the real FastAPI API and a temporary SQLite database once those layers exist. Mock only the external OpenRouter boundary in the default suite.

## Implementation constraints

- Follow `docs/PLAN.md` in order and stop for user approval after each part.
- Keep the frontend compatible with a static Next.js export served by FastAPI; do not introduce a dependency on a Next.js runtime server.
- Keep backend requests under relative `/api/*` URLs so the static frontend and API share one origin.
- Once persistence is added, treat the backend's response as canonical board state and avoid duplicating mutation rules in UI components.
- Keep the five-column set fixed. Column names may change, but the UI must not add or delete columns.
- Keep components and state flow simple. Extract abstractions only when they remove real duplication or isolate a testable boundary.
- Do not expose `OPENROUTER_API_KEY` or any other server secret to browser code, public environment variables, generated assets, or logs.
