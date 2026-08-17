#!/usr/bin/env python3
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

MODEL = "openai/gpt-oss-120b"
BOARD_MARKER = "Canonical board JSON:\n"
fail_once_requests: set[str] = set()


def board_from_messages(messages: list[dict[str, Any]]) -> dict[str, Any]:
    system_content = str(messages[0]["content"])
    return json.loads(system_content.split(BOARD_MARKER, 1)[1])


def structured_response(payload: dict[str, Any]) -> str:
    messages = payload["messages"]
    message = str(messages[-1]["content"])
    normalized = message.lower()
    board = board_from_messages(messages)
    columns = board["columns"]

    if "malformed response" in normalized:
        return "not valid json"
    if "single ai change" in normalized:
        result = {
            "reply": "I created one AI card.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": columns[0]["id"],
                    "title": "AI single card",
                    "details": "Created through the assistant",
                    "due_date": "",
                    "labels": "",
                }
            ],
        }
    elif "multiple ai changes" in normalized:
        cards = [card for column in columns for card in column["cards"]]
        if not cards:
            raise ValueError("Multiple-operation scenario requires a seeded card")
        target = columns[-1]
        result = {
            "reply": "I created, edited, and moved cards.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": target["id"],
                    "title": "AI batch card",
                    "details": "Created in a multi-change request",
                    "due_date": "2026-12-31",
                    "labels": "ai,batch",
                },
                {
                    "type": "edit_card",
                    "card_id": cards[0]["id"],
                    "title": "AI edited card",
                    "details": None,
                    "due_date": None,
                    "labels": None,
                },
                {
                    "type": "move_card",
                    "card_id": cards[0]["id"],
                    "column_id": target["id"],
                    "position": 0,
                },
            ],
        }
    else:
        result = {
            "reply": "I reviewed the current board and made no changes.",
            "operations": [],
        }
    return json.dumps(result, separators=(",", ":"))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            return
        self.send_error(404)

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(content_length))
        message = str(payload["messages"][-1]["content"])
        normalized = message.lower()

        if "provider error" in normalized:
            self.send_json(503, {"error": {"message": "Deterministic provider error"}})
            return
        if "fail once" in normalized and message not in fail_once_requests:
            fail_once_requests.add(message)
            self.send_json(503, {"error": {"message": "Deterministic first failure"}})
            return

        content = structured_response(payload)
        self.send_json(
            200,
            {
                "id": "fake-completion",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": MODEL,
                "system_fingerprint": None,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: Any) -> None:
        return


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18002
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
