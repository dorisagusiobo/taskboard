# AI board contract

The authenticated `POST /api/ai/chat` endpoint accepts a current message and up to 20 prior `user` or `assistant` messages. History remains in browser memory and is never stored in SQLite.

The backend sends the canonical authenticated user's board, history, and current message to OpenRouter using `openai/gpt-oss-120b`. It requests strict JSON Schema output and requires routing to a provider that supports the requested parameters.

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
  "details": "Card details"
}
```

```json
{
  "type": "edit_card",
  "card_id": 1,
  "title": null,
  "details": "New details"
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

For `edit_card`, at least one of `title` or `details` must be non-null. No delete, column, user, or board operation is supported.

The backend validates the JSON again after receipt. When operations are present, it applies the complete list in one SQLite transaction using the same ownership, ordering, and validation rules as manual changes. Any invalid operation rolls back the full list. A successful mutation returns the assistant reply and canonical updated board; a read-only reply returns `board: null`.

## Browser behavior

The **Ask AI** drawer keeps the current draft and conversation in browser memory. It sends only the latest 20 prior messages, renders replies as plain text, and prevents overlapping board mutations. A successful mutation replaces the visible board with the canonical board returned by FastAPI. A failed request leaves the last confirmed board and message draft unchanged so the user can retry.
