# AI board contract

The authenticated `POST /api/boards/{board_id}/ai/chat` endpoint accepts a current message and up to 20 prior `user` or `assistant` messages. History remains in browser memory and is never stored in SQLite.

The backend sends the canonical state of that one board (re-validated as owned by the authenticated user), history, and current message to OpenRouter using `openai/gpt-oss-120b`. It requests strict JSON Schema output and requires routing to a provider that supports the requested parameters. The AI can only see and mutate the board named in the URL, not any of the user's other boards.

## Structured response

Every model response contains:

```json
{
  "reply": "User-facing response",
  "operations": []
}
```

`operations` may contain at most 20 closed objects with one of these shapes:

```json
{
  "type": "create_card",
  "column_id": 1,
  "title": "Card title",
  "details": "Card details",
  "due_date": "2026-04-15",
  "labels": "bug,urgent"
}
```

```json
{
  "type": "edit_card",
  "card_id": 1,
  "title": null,
  "details": "New details",
  "due_date": null,
  "labels": null
}
```

```json
{
  "type": "move_card",
  "card_id": 1,
  "column_id": 2,
  "position": 0
}
```

`due_date` is either an empty string (no due date) or `YYYY-MM-DD`; the system prompt tells the model today's date so it can resolve relative requests ("tomorrow", "next Friday"). `labels` is a comma-separated string of at most 5 tags, 24 characters each, or an empty string for none. For `edit_card`, `due_date`/`labels: null` leaves that field unchanged, an empty string clears it, and at least one of `title`, `details`, `due_date`, or `labels` must be a real change (not all null). There is no way to add or remove a single label without restating the full list. No delete, column, user, or board operation is supported.

The backend validates the JSON again after receipt. When operations are present, it applies the complete list in one SQLite transaction using the same ownership, ordering, and validation rules as manual changes. Any invalid operation rolls back the full list. A successful mutation returns the assistant reply and canonical updated board; a read-only reply returns `board: null`.

## Browser behavior

The **Ask AI** drawer keeps the current draft and conversation in browser memory. It sends only the latest 20 prior messages, renders replies as plain text, and prevents overlapping board mutations. A successful mutation replaces the visible board with the canonical board returned by FastAPI. A failed request leaves the last confirmed board and message draft unchanged so the user can retry.
