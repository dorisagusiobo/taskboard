# Code Review — Project Management MVP

Date: 2026-08-16 (remediated same day)
Scope: full repository at commit `282770f` ("Step 10 complete") — backend (`backend/`), frontend (`frontend/src/`), infra (`Dockerfile`, `scripts/`), and docs (`docs/`, `AGENTS.md` files). Reviewed by reading every source file directly (not diff-scoped); verified against a full local run of the test suite (backend pytest, frontend vitest/eslint/build, Docker smoke test, Docker Playwright e2e — all green, see `docs/PLAN.md` "Latest verified baseline" for the same numbers).

**Status: all findings addressed.** See "Remediation" at the end of each finding and the summary table below. Full suite re-run after fixes: backend 64 passed / 3 skipped at 98.02% coverage (up from 97.10%); frontend 35/35 tests, coverage unchanged and above the 80% gate, lint/build clean; Docker smoke test and the full 6-scenario Docker Playwright e2e suite (plus the restart-persistence recheck) both passed against the rebuilt image.

## Summary

The codebase is in good shape for an MVP: small, consistent modules, transactional SQLite mutations, server-authoritative board state, no ORM overhead, and high automated test coverage (backend 97%, frontend 92%+). No correctness bugs were found in the core board or AI-mutation logic — the position-shifting scheme in `database.py` for avoiding transient unique-constraint collisions is correct in every case traced through, and ownership is consistently derived from the session rather than client input.

The issues below are mostly small: one stray dependency, a few defensive branches that are untested, a couple of narrow race/robustness edges, and some now-stale wording in `frontend/AGENTS.md`. Nothing here blocks approving Part 10.

## Findings

### 1. Unused dev dependency `httpx2` — cleanup
**File:** `backend/pyproject.toml:16`, `backend/uv.lock`
`httpx2` is declared as a direct dev dependency (`httpx2>=2.10.0`) but is not imported anywhere in `backend/*.py` or `backend/tests/*.py` (verified by grep). The project already depends on `httpx` for the real HTTP boundary. This looks like a leftover from experimentation or a name confusion with `httpx`. It adds install time and an unreviewed package to the dev environment for no benefit.
**Action:** Remove `httpx2` from `[dependency-groups].dev` in `pyproject.toml` and run `uv lock` to update `uv.lock`, unless something genuinely depends on it that wasn't visible to a static grep.
**Remediation:** Removed from `pyproject.toml`; `uv lock` regenerated, also dropping the transitive `httpcore2`, `httpx2-jsfetch`, and `truststore` entries. Confirmed no code referenced it.

### 2. `_update_card` has no defense against an empty assignment list
**File:** `backend/database.py:392-415`
`BoardStore._update_card` builds `SET` assignments only for non-`None` `title`/`details` and executes the UPDATE unconditionally. If both are `None`, `assignments` is empty and the generated SQL becomes `UPDATE cards SET  WHERE id = ? AND board_id = ?` — a SQL syntax error. Today this can't happen because both call sites validate "at least one field" first: `UpdateCardRequest.require_a_change` in `main.py:91-95` (manual edits) and `EditCardOperation.model_post_init` in `ai_service.py:46-48` (AI edits). But `_update_card` is a `classmethod` on `BoardStore` reachable from any future caller, and nothing in `database.py` itself enforces the invariant — a future direct caller (e.g., a new bulk-import path, or a refactor that skips the Pydantic layer) would get a confusing `sqlite3.OperationalError` instead of a clear domain error.
**Action:** Add a guard at the top of `_update_card` (e.g., raise `ValueError` when `title is None and details is None`) so the invariant is enforced at the same layer that owns the mutation, not only by callers.
**Remediation:** Added the guard (`database.py`, top of `_update_card`), plus a new unit test (`test_update_card_requires_a_title_or_details_change` in `tests/test_database.py`) exercising `BoardStore.update_card` directly with both fields `None` and confirming the board is unchanged.

### 3. Two 404 exception-handler bodies are unexercised by tests
**File:** `backend/main.py:137-139` (and to a lesser extent `database.py:187-189`)
Coverage shows `main.py:139` — the body of `handle_board_not_found` — is never executed by the test suite, even though `ColumnNotFoundError`/`CardNotFoundError`/`InvalidPositionError` handlers are. There's currently no test path that produces a `BoardNotFoundError` through the API (the MVP always seeds the one user's board at startup), so this 404 response shape is unverified. Similarly, `database.py:187-189` — the `except Exception: connection.rollback(); raise` in `BoardStore.initialize` — has no test that forces `initialize` itself to fail mid-transaction.
**Action:** Low priority given the MVP's single always-seeded user, but worth a small targeted test (e.g., call `get_board`/`rename_column` against a `BoardStore` pointed at a fresh database before `initialize()` has run, or with a username that was never seeded) so the 404 contract is actually verified, not just assumed correct by inspection.
**Remediation:** Added `test_missing_board_returns_a_controlled_404` in `tests/test_board_api.py` — authenticates normally, then deletes the seeded board row directly via a raw `sqlite3` connection (simulating the board disappearing underneath an active session) and asserts `GET /api/board` returns `404 {"detail": "Board not found"}`. `main.py:139` now shows fully covered. The `database.py:187-189` `initialize()` rollback path remains untested — left as-is; forcing that path requires faking a mid-transaction SQLite failure, which is lower value than the other gaps and wasn't in the original action list.

### 4. Cross-column `InvalidPositionError` branch is untested
**File:** `backend/database.py:440-442`
`_move_card`'s same-column out-of-range check is presumably covered, but the analogous check for the cross-column branch (`target_position > len(target_ids)` at line 441-442) shows as uncovered in the coverage report. Behaviorally this looks correct by inspection (mirrors the same-column check), but it's the one board-mutation error path in `database.py` with zero test evidence.
**Action:** Add a test that attempts `move_card` into a different column at a position beyond that column's card count and asserts `InvalidPositionError`/422.
**Remediation:** Added a case to `test_validation_and_missing_resources_do_not_change_the_board` in `tests/test_board_api.py` — moves a card into a *different* column at position 999 and asserts 422. `database.py:442` is now fully covered.

### 5. `OpenRouterClient` error-mapping branches are untested (excluding the intentionally-live-only ones)
**File:** `backend/openrouter_client.py:83-84`
The `if not response.choices: raise OpenRouterRequestError(...)` branch (line 84) has no unit test forcing a response with an empty `choices` list from the mocked/fake boundary. Lines 121 and 134 are fine to leave uncovered (they're the live-only wrong-answer path and the `if __name__ == "__main__"` guard, respectively). Only line 84 represents a real gap — it's the same class of "provider returned something we can't use" defect that the neighboring `content` check (line 87-88) *is* tested for.
**Action:** Add one deterministic test that mocks the OpenRouter SDK response with `choices=[]` and asserts `OpenRouterRequestError`.
**Remediation:** Extended the `fake_sdk` test helper in `tests/test_openrouter_client.py` with an optional `choices` override, and added `test_complete_rejects_an_empty_choices_list` asserting `OpenRouterRequestError("OpenRouter returned an invalid response")`. Line 84 is now covered; only the live-only wrong-answer path (121) and the `__main__` guard (134) remain uncovered by design.

### 6. SQLite write concurrency has a narrow, undocumented failure mode
**File:** `backend/database.py:127-131` (`_connect`), all mutation methods
Every mutation opens a fresh connection and starts `BEGIN IMMEDIATE`, which is the right approach for serializing writers safely. However, `sqlite3.connect()` is called with the driver's default `timeout=5.0` and no retry logic. If two write requests from the browser genuinely overlap for more than 5 seconds (unlikely for this app's traffic, but possible if the AI endpoint's mutation and a manual drag-and-drop race, since AI turnaround can be multiple seconds), the second writer would raise an unhandled `sqlite3.OperationalError: database is locked`, surfacing as a raw 500 rather than the app's controlled error responses.
**Action:** Given this is an explicitly local, single-user MVP, this is low severity and likely not worth new machinery. If it's ever seen in practice, the fix is either a slightly longer `timeout=` on `sqlite3.connect`, or catching `sqlite3.OperationalError` in the route layer and mapping it to a 503/"try again" response instead of a raw 500.
**Remediation:** No change made, per the report's own recommendation — left as documented, accepted risk for this local single-user MVP.

### 7. `frontend/AGENTS.md` retains two stale forward-looking phrases
**File:** `frontend/AGENTS.md:61`, `frontend/AGENTS.md:68`
The main "AI chat sidebar not implemented yet" line was already corrected earlier in this session. Two smaller phrasings are still written as if earlier parts hadn't landed yet: line 61 says integration tests must cover the real API/DB "once those layers exist" (they've existed since Part 6/7), and line 68 says "Once persistence is added, treat the backend's response as canonical..." (persistence has been the model since Part 7). Neither is incorrect, just stale conditional phrasing that could read as forward-looking guidance to a future agent.
**Action:** Optional wording cleanup — drop the "once X exists"/"once X is added" framing now that all ten parts are built.
**Remediation:** Applied, with explicit go-ahead from the user in this follow-up pass. Both lines in `frontend/AGENTS.md` now state the requirement directly instead of conditionally.

### 8. `KanbanCard`/`KanbanColumn` remount on every edit via compound React keys
**File:** `frontend/src/components/KanbanColumn.tsx:99`, `frontend/src/components/KanbanCard.tsx` (used via `KanbanColumn.tsx:99`, key `${card.id}:${card.title}:${card.details}`), `frontend/src/components/KanbanBoard.tsx:263` (key `${column.id}:${column.title}`)
Including `title`/`details` in the React `key` is a deliberate way to reset each card's local edit-form state whenever the canonical board changes that card (e.g., after your own edit commits, or after an AI mutation touches it) without writing a `useEffect` to resync props into state. It works, but it means React fully unmounts and remounts the DOM node on every successful edit or AI-driven change to that card/column, which drops focus and any in-progress (uncommitted) edits on *other* fields of that same card if a concurrent AI operation touches it. Given the app already serializes mutations one at a time (`mutationInFlight`), this mostly matters for the AI-mutation-updates-a-card-while-user-is-mid-edit-elsewhere case, which is a narrow but real interaction.
**Action:** No change required for the MVP; flagging as a known trade-off rather than a defect. If chat-driven concurrent edits become more prominent, consider syncing `title`/`state` via `useEffect` on `card.id` change instead of remount-via-key, so local edit state isn't silently discarded.
**Remediation:** No change made, per the report's own recommendation — left as a documented, intentional trade-off.

### 9. `KanbanBoard.handleAIMessage`'s in-flight guard is effectively dead code
**File:** `frontend/src/components/KanbanBoard.tsx:101-103`, `frontend/src/components/AIChatSidebar.tsx:73-77`
`handleAIMessage` throws a plain `Error("A board change is already in progress")` when `mutationInFlight.current` is true, but `AIChatSidebar.submitMessage` already checks `isBoardBusy` (passed down from the same `isMutating` state) before calling `onSubmit`, and the Send button is `disabled` whenever `isBoardBusy` is true. The only way to hit the `KanbanBoard`-level throw is a same-tick race between the guard check and the state update, which React's synchronous event handling makes very unlikely here. If it is hit, the resulting message shown to the user ("Unable to reach the AI assistant. Your board is unchanged.") is misleading — it reads as a network failure, not a "you're too fast" condition.
**Action:** Cosmetic; either remove the now-redundant guard (rely solely on the sidebar's `isBoardBusy` check) or give it a distinct, accurate error message if kept as defense-in-depth.
**Remediation:** Kept the guard (it's still real defense-in-depth against a narrow same-tick race between `mutationInFlight.current` and the `isBoardBusy` prop's render-lag) and fixed the message instead. `AIChatSidebar`'s catch block now shows `${error.message}. Your board is unchanged.` for any `Error` (previously only for `ApiError`), so the guard's own message surfaces accurately; the `ApiError` import in `AIChatSidebar.tsx` was removed as it's no longer needed. Verified against the existing `ApiError`-rejection test, which still passes unchanged.

### 10. Non-constant-time password comparison
**File:** `backend/main.py:168`
`credentials.password != MVP_PASSWORD` is a straightforward string comparison, which is technically timing-attack-observable. Not a real-world risk here: `MVP_PASSWORD = "password"` is a publicly documented, intentionally fixed MVP credential (per `README.md` and `AGENTS.md`) with nothing secret to extract via timing. No action needed unless this hardcoded-credential model changes to real per-user secrets, at which point `hmac.compare_digest` (or hashed credential storage) would matter.

## What's solid (no action needed, noted for completeness)

- **Transactional mutation design** (`database.py`): every mutating method opens one connection, `BEGIN IMMEDIATE`s, and commits/rolls back as a unit; the shift-then-reassign position scheme correctly avoids the `UNIQUE(column_id, position)` collision window for both same-column reorders and cross-column moves — traced through by hand and matches the documented walkthrough in `docs/DATABASE.md`.
- **Ownership enforcement**: every mutation resolves `board_id` from the signed session's username via `_owned_board_id` before touching any row; no endpoint accepts a client-supplied user or board ID. Cards reference `(column_id, board_id)` as a composite FK, so SQLite itself rejects attaching a card to another board's column even if application logic had a bug.
- **AI operation validation is defense-in-depth, not trust**: `ai_service.py` validates the model's structured JSON with Pydantic (closed operation types, bounded lengths, discriminated union), and `main.py`/`database.py` then apply those operations through the *exact same* mutation methods (`_create_card`/`_update_card`/`_move_card`) manual edits use — there's no separate, less-validated code path for AI-driven changes, and a bad operation rolls back the whole batch.
- **Secrets handling**: `.env` is git-ignored and docker-ignored; `OPENROUTER_API_KEY` is read only in `openrouter_client.py` server-side and never referenced from `frontend/`; static export contains no server secrets by construction (there's no build-time env injection of secret values into `next.config.ts` or component code).
- **Static export / single-origin design**: `next.config.ts` sets `output: "export"`, and `main.py` mounts that export at `/` while owning all `/api/*` routes — matches the documented no-Node-server-in-prod architecture, and all frontend API calls in `lib/api.ts` use relative `/api/*` paths.
- **Platform script parity**: `start-mac.sh` and `start-linux.sh` are byte-identical; `start-windows.ps1` implements the same health-check-polling contract. No divergence bugs across the three.
- **Schema/doc consistency**: `docs/database-schema.json`, `docs/DATABASE.md`'s proposed DDL, and the actual `SCHEMA_SQL` in `database.py` agree exactly on tables, constraints, and seed data.
- **No unsafe rendering**: AI replies and all user-entered card/column text are rendered as React text content (no `dangerouslySetInnerHTML`), so there's no XSS surface from AI output or board content.

## Remediation summary

| # | Finding | Outcome |
|---|---|---|
| 1 | Unused `httpx2` dev dependency | Fixed — removed from `pyproject.toml`, `uv.lock` regenerated |
| 2 | `_update_card` no guard against empty update | Fixed — guard added + unit test |
| 3 | `BoardNotFoundError` 404 path untested | Fixed — new API-level test added |
| 4 | Cross-column `InvalidPositionError` untested | Fixed — new case added to existing test |
| 5 | OpenRouter empty-`choices` path untested | Fixed — new unit test added |
| 6 | SQLite write-lock timeout has no retry/graceful error | Left as-is (accepted risk, per report) |
| 7 | Stale "once X exists" phrasing in `frontend/AGENTS.md` | Fixed — wording tidied |
| 8 | Remount-via-key on card/column edit | Left as-is (intentional trade-off, per report) |
| 9 | Misleading fallback message on the AI busy-guard | Fixed — accurate message now shown, guard kept |
| 10 | Non-constant-time password comparison | Left as-is (no real risk, per report) |

Items 6, 8, and 10 were explicitly marked "no action needed" in the original report and were intentionally left unchanged; everything else is fixed.

## Post-remediation verification

Full suite re-run after all fixes, in order:

```
cd backend && uv run ruff check . && uv run ruff format --check . \
  && uv run mypy main.py database.py ai_service.py openrouter_client.py && uv run pytest -q
cd frontend && npm run lint && npm run test:unit && npm run build
./scripts/smoke-test-docker.sh
./scripts/test-e2e-docker.sh
```

- Backend: ruff/format/mypy clean; **64 passed, 3 skipped** (opt-in live tests), **98.02% coverage** (up from 97.10%).
- Frontend: ESLint clean; **35/35 tests passed**; coverage unchanged, above the 80% gate on every metric; production build succeeded.
- Docker smoke test: passed against the rebuilt image (health, static frontend, auth, board CRUD, restart-persistence).
- Docker end-to-end suite: all **6 Playwright scenarios** passed, plus the restart-persistence recheck; test containers/volumes cleaned up automatically.

No changes were required before approving Part 10 — all findings were cleanup-grade or narrow edge cases, not correctness or security defects in the shipped behavior — and everything actionable is now resolved and re-verified.
