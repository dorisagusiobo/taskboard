# Project Management MVP Delivery Plan

## Delivery rules

- Complete the parts below in order.
- Stop after every part and obtain explicit user approval before beginning the next part.
- Keep checklist state accurate: check an item only after it has been completed and verified.
- Do not add features outside the MVP requirements.
- Confirm current stable dependency versions from primary sources when each dependency is introduced.
- Keep the application local-first and package the finished system in one Docker container.
- Never commit secrets. Read `OPENROUTER_API_KEY` from the project-root `.env` file at runtime.

## Test and quality standard

- Frontend unit tests use Vitest and Testing Library. Backend unit tests use pytest.
- Each frontend and backend unit-test suite must maintain at least 80% coverage. Configure the test tools to fail below 80% for statements/lines, branches, and functions where those metrics are supported.
- Add unit tests with every behavior change; do not defer coverage work to the end.
- Integration tests must exercise real boundaries relevant to the part under test rather than duplicating unit tests. This includes browser-to-API, API-to-SQLite, static-file serving, authentication, and Docker runtime behavior as those layers are added.
- Use isolated temporary databases in automated tests. Tests must never modify the developer's local application database.
- Keep the default automated suite deterministic. Mock only the external OpenRouter boundary for normal tests, and keep the real OpenRouter connectivity check as an explicit live smoke test that requires `OPENROUTER_API_KEY`.
- Before requesting approval for a part, run all tests relevant to that part and report the commands and results, including coverage.

## Part 1: Planning and frontend documentation

### Implementation checklist

- [x] Review the root `AGENTS.md` and the existing high-level plan.
- [x] Inspect the existing frontend structure, behavior, configuration, and tests.
- [x] Expand all delivery parts into implementation, testing, and success-criteria checklists.
- [x] Record the approval gate between every part.
- [x] Record the minimum 80% unit-test coverage requirement and integration-test expectations.
- [x] Create `frontend/AGENTS.md` describing the current frontend and its local development rules.

### Validation checklist

- [x] Confirm all business requirements and technical decisions in the root `AGENTS.md` are represented in this plan.
- [x] Confirm every implementation part has tests and objective success criteria.
- [x] Confirm `frontend/AGENTS.md` distinguishes current behavior from future work.

### Success criteria

- [x] The repository contains a detailed, executable plan for Parts 2 through 10.
- [x] The frontend has accurate local instructions for future agents.
- [x] Quality gates require at least 80% unit-test coverage and robust integration testing.
- [x] The user explicitly approves Part 1 and authorizes Part 2.

## Part 2: Docker, backend, and scripts scaffolding

### Implementation checklist

- [x] Confirm the proposed file layout and runtime commands before implementation.
- [x] Create a minimal FastAPI application in `backend/` with a clear application entry point.
- [x] Add `backend/pyproject.toml` and a `uv` lockfile with only the runtime and test dependencies needed for this part.
- [x] Add a health or example API endpoint that returns a small JSON response.
- [x] Serve a minimal example HTML page at `/` that calls the example API and displays its response.
- [x] Create a single production Dockerfile that installs Python dependencies with `uv` and runs FastAPI.
- [x] Add only the Docker configuration needed to build and run the local application.
- [x] Create start and stop scripts for macOS, Linux, and Windows in `scripts/`.
- [x] Ensure runtime data and `.env` secrets are not copied into the image or committed.
- [x] Add concise local run instructions to the root README.

### Test checklist

- [x] Add backend unit tests for the application and example API response.
- [x] Configure backend coverage enforcement at a minimum of 80%.
- [x] Add an integration smoke test that builds and starts the container, loads `/`, and verifies the page's API call succeeds.
- [x] Smoke-test the platform scripts where the current operating system permits, and validate the other scripts statically.
- [x] Run formatting/linting, backend unit tests with coverage, and the Docker smoke test.

### Success criteria

- [x] A new checkout can be started locally using the documented platform script.
- [x] The container serves example HTML at `/` and a working JSON API response.
- [x] The container stops cleanly using the matching stop script.
- [x] Backend unit-test coverage is at least 80%, and integration tests pass.
- [x] The user explicitly approves Part 2 and authorizes Part 3.

## Part 3: Build and serve the existing frontend

### Implementation checklist

- [x] Configure Next.js for a static production export compatible with FastAPI static serving.
- [x] Adjust frontend assets or runtime assumptions only where required for a reproducible container build.
- [x] Add the frontend build stage to the Dockerfile and copy the static export into the final image.
- [x] Replace the example HTML at `/` with the exported Kanban frontend while preserving `/api/*` routes.
- [x] Preserve the existing five-column board, column renaming, add/remove behavior, and drag-and-drop behavior.
- [x] Keep the final image and build configuration simple and free of development-only dependencies.

### Test checklist

- [x] Enforce at least 80% frontend unit-test coverage for statements/lines, branches, and functions.
- [x] Extend unit tests for all existing board operations and relevant empty/invalid cases.
- [x] Extend Playwright coverage for rendering, renaming columns, adding/removing cards, and moving/reordering cards.
- [x] Add an integration test against the FastAPI-served static export, not only the Next.js development server.
- [x] Build the production container and run frontend linting, unit tests with coverage, and integration tests.

### Success criteria

- [x] `/` serves the production-built Kanban demo from FastAPI in the container.
- [x] All existing demo behavior works without a Next.js runtime server.
- [x] Frontend unit-test coverage is at least 80%, and browser/static-serving integration tests pass.
- [x] The user explicitly approves Part 3 and authorizes Part 4.

## Part 4: Dummy user sign-in and sign-out

### Implementation checklist

- [x] Define and document the session lifetime and local-session configuration.
- [x] Add backend login, logout, and current-session endpoints using the fixed credentials `user` / `password`.
- [x] Use a minimal signed, HTTP-only cookie session suitable for the local MVP.
- [x] Add a frontend login view shown before the board is accessible.
- [x] Add logout behavior and restore the login view when the session ends.
- [x] Protect board-facing API routes from unauthenticated access as those routes are introduced.
- [x] Show concise, accessible feedback for invalid credentials and request failures.
- [x] Do not expose the password in client source, logs, URLs, or persisted browser storage.

### Test checklist

- [x] Add backend unit tests for successful login, failed login, session lookup, logout, and unauthorized access.
- [x] Add frontend unit tests for login form behavior, errors, authenticated rendering, and logout.
- [x] Add browser integration tests covering redirect/view state, invalid login, valid login, refresh while authenticated, and logout.
- [x] Verify cookie attributes and confirm unauthenticated API requests are rejected.
- [x] Run both unit suites with at least 80% coverage plus the full authentication integration suite.

### Success criteria

- [x] An unauthenticated visitor sees only the login experience.
- [x] `user` / `password` grants access to the board; incorrect credentials do not.
- [x] Logout removes access to the board and protected APIs.
- [x] Coverage thresholds and authentication integration tests pass.
- [ ] The user explicitly approves Part 4 and authorizes Part 5.

## Part 5: SQLite data-model proposal

### Implementation checklist

- [ ] Review current board data and the authentication/user ownership requirements.
- [ ] Resolve with the user any data-lifetime decisions needed by later AI conversation history.
- [ ] Design the smallest relational schema that supports multiple users, one board per user, fixed-but-renamable ordered columns, ordered cards, and editable card content.
- [ ] Define primary keys, foreign keys, uniqueness constraints, ordering fields, ownership boundaries, and delete behavior.
- [ ] Define initialization and seed-data behavior for the MVP user and first board.
- [ ] Save a machine-readable representation as `docs/database-schema.json`.
- [ ] Document the SQLite approach and schema rationale in `docs/DATABASE.md`.
- [ ] Do not implement the database or API in this part.

### Validation checklist

- [ ] Parse and validate `docs/database-schema.json` as JSON.
- [ ] Walk through create, edit, delete, rename, reorder, cross-column move, and per-user board lookup against the proposed schema.
- [ ] Confirm the schema can enforce one board per user and cannot mix cards/columns between users.
- [ ] Review the proposal for unnecessary tables or fields.

### Success criteria

- [ ] The JSON schema document and concise database rationale are complete and consistent.
- [ ] The proposal covers current board behavior and future multiple-user ownership without expanding the MVP UI.
- [ ] The user explicitly approves the schema and Part 5, authorizing Part 6.

## Part 6: Persistent backend board API

### Implementation checklist

- [ ] Implement the approved SQLite schema and enable foreign-key enforcement.
- [ ] Create and initialize the database automatically when it does not exist.
- [ ] Seed the MVP user and initial board idempotently without overwriting existing data.
- [ ] Resolve the current user from the authenticated session; do not accept arbitrary user ownership from the client.
- [ ] Add API operations to read the board, rename columns, create/edit/delete cards, and move/reorder cards.
- [ ] Keep the fixed column set: columns can be renamed but not created or deleted.
- [ ] Validate request and response bodies with typed models.
- [ ] Make move/reorder mutations transactional and return a canonical board representation.
- [ ] Return simple, consistent errors for invalid input, missing resources, and ownership violations.

### Test checklist

- [ ] Add unit tests for validation, board serialization, initialization, and mutation logic.
- [ ] Add API integration tests using a real temporary SQLite database for every success and failure path.
- [ ] Verify initialization is idempotent and an existing database is preserved.
- [ ] Verify ordering, cross-column moves, edits, deletes, and column renames persist after reconnecting to the database.
- [ ] Verify unauthenticated and cross-user access is rejected.
- [ ] Run backend linting/type checks, unit tests with at least 80% coverage, and API/SQLite integration tests.

### Success criteria

- [ ] The authenticated user's board can be fully read and mutated through the API.
- [ ] Data survives application restarts, and missing databases initialize automatically.
- [ ] Invalid or unauthorized mutations cannot corrupt board state.
- [ ] Backend coverage and API/SQLite integration tests pass.
- [ ] The user explicitly approves Part 6 and authorizes Part 7.

## Part 7: Connect the frontend to the persistent backend

### Implementation checklist

- [ ] Replace bundled demo state as the source of truth with the authenticated board API.
- [ ] Add a small typed API client for authentication and board operations.
- [ ] Load the board after authentication and show minimal accessible loading/error states.
- [ ] Persist column renames, card creation/editing/deletion, and drag-and-drop moves through the API.
- [ ] Add the missing card-edit UI required by the business requirements.
- [ ] Reconcile the UI with the canonical board returned by the backend after mutations.
- [ ] Prevent duplicate submissions while a mutation is in flight, without adding speculative complexity.

### Test checklist

- [ ] Add frontend unit tests for API-backed loading, mutations, card editing, and error behavior where they materially protect correctness.
- [ ] Add integration tests covering browser-to-FastAPI-to-SQLite flows for every board mutation.
- [ ] Verify persistence by changing the board, reloading the page, and restarting the container.
- [ ] Verify one authenticated user's board data cannot appear in another user's API context.
- [ ] Run frontend and backend unit suites at at least 80% coverage, plus full browser/API/database integration tests.

### Success criteria

- [ ] The browser displays only persisted API data rather than hardcoded runtime state.
- [ ] Every required manual board operation persists across reloads and container restarts.
- [ ] Loading and failure states are understandable and do not silently lose changes.
- [ ] Coverage thresholds and end-to-end persistence tests pass.
- [ ] The user explicitly approves Part 7 and authorizes Part 8.

## Part 8: OpenRouter connectivity

### Implementation checklist

- [ ] Confirm the current OpenRouter API contract and supported client-library versions from primary documentation at implementation time.
- [ ] Read `OPENROUTER_API_KEY` from environment configuration without exposing it to the frontend.
- [ ] Add a minimal backend OpenRouter client using the `openai/gpt-oss-120b` model.
- [ ] Add the smallest authenticated backend endpoint or diagnostic command needed to exercise the connection.
- [ ] Add clear handling for missing credentials, provider errors, and timeouts without logging secrets.
- [ ] Keep all OpenRouter traffic server-side.

### Test checklist

- [ ] Add deterministic unit tests with the external HTTP boundary mocked.
- [ ] Add backend integration tests for successful provider parsing and provider error mapping using a local fake response.
- [ ] Add an explicit live smoke test that asks `2+2`, uses the project `.env` key, and verifies the answer is 4.
- [ ] Exclude the credential-dependent live smoke test from the default offline suite and document how to run it.
- [ ] Run backend tests with at least 80% coverage and report the live connectivity result separately.

### Success criteria

- [ ] The backend successfully receives a correct response to the live `2+2` prompt through OpenRouter using the required model.
- [ ] Missing keys and upstream failures produce controlled backend errors.
- [ ] The API key never reaches browser code or logs, and the test suite stays focused on real behavior.
- [ ] The user explicitly approves Part 8 and authorizes Part 9.

## Part 9: Structured AI board responses and mutations

### Implementation checklist

- [ ] Define and document a minimal structured-output JSON schema containing a user-facing reply and optional validated board operations.
- [ ] Define the conversation-history source and limits based on the decision approved in Part 5.
- [ ] Send the authenticated user's canonical board JSON, current question, and relevant conversation history to OpenRouter.
- [ ] Request Structured Outputs from `openai/gpt-oss-120b` using the documented JSON schema.
- [ ] Validate the model response before using it.
- [ ] Allow only the required AI operations: create, edit, and move one or more cards.
- [ ] Apply valid AI-requested board operations transactionally through the same domain rules used by manual API changes.
- [ ] Reject invalid IDs, ownership violations, malformed output, and unsupported changes without partially updating the board.
- [ ] Return the assistant message and canonical updated board when a mutation occurs.

### Test checklist

- [ ] Add unit tests for prompt assembly, history inclusion, structured-output parsing, operation validation, and transactional application.
- [ ] Cover no-change replies, each supported operation, multiple operations, invalid output, stale IDs, and rollback on failure.
- [ ] Add API/SQLite integration tests with a deterministic fake OpenRouter service and a real temporary database.
- [ ] Verify the model cannot access or mutate another user's board through supplied IDs or prompt content.
- [ ] Add a small opt-in live smoke test for one read-only prompt and one harmless board mutation against a temporary test database.
- [ ] Run both unit suites at at least 80% coverage and all structured-response integration tests.

### Success criteria

- [ ] Every AI request includes the current board, the user's question, and the intended conversation history.
- [ ] Valid structured operations update the correct board atomically; invalid output makes no changes.
- [ ] Responses consistently match the documented schema.
- [ ] Coverage thresholds and deterministic AI/API/database integration tests pass.
- [ ] The user explicitly approves Part 9 and authorizes Part 10.

## Part 10: AI chat sidebar and automatic board refresh

### Implementation checklist

- [ ] Add a polished, responsive AI chat sidebar using the approved color scheme and existing visual language.
- [ ] Support opening/closing the sidebar, submitting messages, displaying conversation history, and showing pending/error states.
- [ ] Connect the sidebar to the authenticated structured AI endpoint.
- [ ] Render assistant text safely as text unless a separately tested renderer is intentionally approved.
- [ ] When the response contains a board update, replace or refetch board state automatically from the canonical backend response.
- [ ] Keep chat and board interactions keyboard-accessible and usable on narrow screens.
- [ ] Prevent duplicate message submission and preserve the last confirmed board if a request fails.
- [ ] Update concise run/test documentation for the completed MVP.

### Test checklist

- [ ] Add frontend unit tests for sidebar state, message submission, history rendering, loading/errors, and automatic board refresh.
- [ ] Add browser integration tests through FastAPI and SQLite with a deterministic fake OpenRouter boundary.
- [ ] Cover chat replies without changes, single and multiple board changes, malformed/provider errors, retry behavior, and page reload behavior.
- [ ] Run a complete Docker end-to-end flow: start, sign in, manually edit the board, ask AI to mutate it, observe automatic refresh, reload, and verify persistence.
- [ ] Run accessibility checks for the login, board, dialogs/forms, and chat controls.
- [ ] Run all lint/type checks, frontend and backend unit suites at at least 80% coverage, integration suites, production build, and Docker smoke tests.

### Success criteria

- [ ] A signed-in user can converse with the AI in the sidebar.
- [ ] The AI can create, edit, and move one or more cards through validated structured output.
- [ ] AI mutations appear automatically in the board and persist after reload/restart.
- [ ] The complete application runs locally in one Docker container using the platform scripts.
- [ ] All coverage, integration, accessibility, build, and runtime checks pass.
- [ ] The user explicitly approves Part 10 and the completed MVP.
