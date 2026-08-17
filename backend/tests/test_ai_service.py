import json
from datetime import date

import pytest
from pydantic import ValidationError

from ai_service import (
    AI_RESPONSE_SCHEMA,
    AIChatRequest,
    AIResponseError,
    AIService,
    ConversationMessage,
    build_messages,
)


class FakeStructuredClient:
    def __init__(self, response: str):
        self.response = response
        self.messages: list[dict[str, str]] | None = None
        self.schema: dict | None = None

    def complete_structured(self, messages, schema):
        self.messages = messages
        self.schema = schema
        return self.response


def test_build_messages_includes_canonical_board_history_and_current_message():
    board = {"id": 7, "columns": [{"id": 9, "title": "Backlog", "cards": []}]}
    history = [
        ConversationMessage(role="user", content="Earlier question"),
        ConversationMessage(role="assistant", content="Earlier answer"),
    ]

    messages = build_messages(board, "Current question", history)

    assert [message["role"] for message in messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert (
        json.dumps(board, separators=(",", ":"), sort_keys=True)
        in messages[0]["content"]
    )
    assert messages[1:] == [
        {"role": "user", "content": "Earlier question"},
        {"role": "assistant", "content": "Earlier answer"},
        {"role": "user", "content": "Current question"},
    ]


def test_build_messages_tells_the_model_todays_date_for_relative_due_dates():
    messages = build_messages(
        {"id": 1, "columns": []}, "Due tomorrow", [], today=date(2026, 3, 10)
    )

    assert "Today's date is 2026-03-10" in messages[0]["content"]


def test_service_requests_schema_and_parses_all_supported_operations():
    raw_response = json.dumps(
        {
            "reply": "Updated the board.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": 1,
                    "title": "New card",
                    "details": "Details",
                    "due_date": "2026-05-01",
                    "labels": "bug,urgent",
                },
                {
                    "type": "edit_card",
                    "card_id": 2,
                    "title": None,
                    "details": "Changed",
                    "due_date": None,
                    "labels": None,
                },
                {
                    "type": "move_card",
                    "card_id": 3,
                    "column_id": 4,
                    "position": 0,
                },
            ],
        }
    )
    client = FakeStructuredClient(raw_response)

    response = AIService(client).respond({"id": 1, "columns": []}, "Update", [])

    assert response.reply == "Updated the board."
    assert [operation.type for operation in response.operations] == [
        "create_card",
        "edit_card",
        "move_card",
    ]
    assert client.schema is AI_RESPONSE_SCHEMA
    assert client.messages is not None
    assert client.messages[-1] == {"role": "user", "content": "Update"}


def test_service_parses_a_no_change_reply():
    client = FakeStructuredClient(
        json.dumps({"reply": "The board has five columns.", "operations": []})
    )

    response = AIService(client).respond({"id": 1, "columns": []}, "Summarize", [])

    assert response.operations == []


@pytest.mark.parametrize(
    "response",
    [
        "not json",
        json.dumps({"reply": "Missing operations"}),
        json.dumps(
            {
                "reply": "Unsupported",
                "operations": [{"type": "delete_card", "card_id": 1}],
            }
        ),
        json.dumps(
            {
                "reply": "Empty edit",
                "operations": [
                    {
                        "type": "edit_card",
                        "card_id": 1,
                        "title": None,
                        "details": None,
                        "due_date": None,
                        "labels": None,
                    }
                ],
            }
        ),
        json.dumps({"reply": "Extra", "operations": [], "extra": True}),
    ],
)
def test_service_rejects_malformed_or_unsupported_output(response: str):
    with pytest.raises(AIResponseError, match="AI returned an invalid response"):
        AIService(FakeStructuredClient(response)).respond(
            {"id": 1, "columns": []}, "Request", []
        )


def test_service_rejects_an_operation_with_an_invalid_due_date():
    raw_response = json.dumps(
        {
            "reply": "Bad date",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": 1,
                    "title": "New card",
                    "details": "",
                    "due_date": "not-a-date",
                    "labels": "",
                }
            ],
        }
    )

    with pytest.raises(AIResponseError):
        AIService(FakeStructuredClient(raw_response)).respond(
            {"id": 1, "columns": []}, "Create it", []
        )


def test_service_parses_an_empty_string_due_date_as_clearing_it():
    raw_response = json.dumps(
        {
            "reply": "Cleared the due date.",
            "operations": [
                {
                    "type": "edit_card",
                    "card_id": 1,
                    "title": None,
                    "details": None,
                    "due_date": "",
                    "labels": None,
                }
            ],
        }
    )

    response = AIService(FakeStructuredClient(raw_response)).respond(
        {"id": 1, "columns": []}, "Clear the due date", []
    )

    assert response.operations[0].due_date == ""


def test_service_dedupes_and_trims_labels_on_create():
    raw_response = json.dumps(
        {
            "reply": "Created it.",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": 1,
                    "title": "New card",
                    "details": "",
                    "due_date": "",
                    "labels": " bug, Bug ,urgent ",
                }
            ],
        }
    )

    response = AIService(FakeStructuredClient(raw_response)).respond(
        {"id": 1, "columns": []}, "Create it", []
    )

    assert response.operations[0].labels == "bug,urgent"


def test_service_rejects_a_label_that_is_too_long():
    raw_response = json.dumps(
        {
            "reply": "Long label",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": 1,
                    "title": "New card",
                    "details": "",
                    "due_date": "",
                    "labels": "x" * 25,
                }
            ],
        }
    )

    with pytest.raises(AIResponseError):
        AIService(FakeStructuredClient(raw_response)).respond(
            {"id": 1, "columns": []}, "Create it", []
        )


def test_service_rejects_too_many_labels():
    raw_response = json.dumps(
        {
            "reply": "Too many labels",
            "operations": [
                {
                    "type": "create_card",
                    "column_id": 1,
                    "title": "New card",
                    "details": "",
                    "due_date": "",
                    "labels": "a,b,c,d,e,f",
                }
            ],
        }
    )

    with pytest.raises(AIResponseError):
        AIService(FakeStructuredClient(raw_response)).respond(
            {"id": 1, "columns": []}, "Create it", []
        )


def test_chat_request_limits_history_to_twenty_messages():
    history = [{"role": "user", "content": f"Message {index}"} for index in range(21)]

    with pytest.raises(ValidationError):
        AIChatRequest(message="Question", history=history)


def test_response_schema_is_closed_and_requires_reply_and_operations():
    assert AI_RESPONSE_SCHEMA["additionalProperties"] is False
    assert AI_RESPONSE_SCHEMA["required"] == ["reply", "operations"]
    operation_schemas = AI_RESPONSE_SCHEMA["properties"]["operations"]["items"]["oneOf"]
    assert [schema["properties"]["type"]["const"] for schema in operation_schemas] == [
        "create_card",
        "edit_card",
        "move_card",
    ]
    assert all(schema["additionalProperties"] is False for schema in operation_schemas)
