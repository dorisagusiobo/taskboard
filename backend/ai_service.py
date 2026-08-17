import json
from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal, Protocol

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
)

MessageText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
]
CardTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
CardDetails = Annotated[str, StringConstraints(max_length=4000)]


def _validate_due_date(value: str) -> str:
    if value == "":
        return value
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("due_date must be an empty string or YYYY-MM-DD") from error
    return value


CardDueDate = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=10),
    AfterValidator(_validate_due_date),
]


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: MessageText


class AIChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: MessageText
    history: list[ConversationMessage] = Field(default_factory=list, max_length=20)


class CreateCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create_card"]
    column_id: int = Field(gt=0)
    title: CardTitle
    details: CardDetails
    due_date: CardDueDate


class EditCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["edit_card"]
    card_id: int = Field(gt=0)
    title: CardTitle | None
    details: CardDetails | None
    due_date: CardDueDate | None

    def model_post_init(self, _context: Any) -> None:
        if self.title is None and self.details is None and self.due_date is None:
            raise ValueError("An edit must change the title, details, or due date")


class MoveCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["move_card"]
    card_id: int = Field(gt=0)
    column_id: int = Field(gt=0)
    position: int = Field(ge=0)


BoardOperation = Annotated[
    CreateCardOperation | EditCardOperation | MoveCardOperation,
    Field(discriminator="type"),
]


class StructuredAIResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: MessageText
    operations: list[BoardOperation] = Field(max_length=20)


AI_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "reply": {
            "type": "string",
            "minLength": 1,
            "maxLength": 4000,
            "description": "A concise user-facing response.",
        },
        "operations": {
            "type": "array",
            "maxItems": 20,
            "description": "Validated board changes, or an empty array for no change.",
            "items": {
                "oneOf": [
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {"const": "create_card"},
                            "column_id": {"type": "integer", "minimum": 1},
                            "title": {
                                "type": "string",
                                "minLength": 1,
                                "maxLength": 200,
                            },
                            "details": {"type": "string", "maxLength": 4000},
                            "due_date": {
                                "type": "string",
                                "description": (
                                    "Empty string for no due date, "
                                    "otherwise YYYY-MM-DD."
                                ),
                                "maxLength": 10,
                            },
                        },
                        "required": [
                            "type",
                            "column_id",
                            "title",
                            "details",
                            "due_date",
                        ],
                    },
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {"const": "edit_card"},
                            "card_id": {"type": "integer", "minimum": 1},
                            "title": {
                                "anyOf": [
                                    {
                                        "type": "string",
                                        "minLength": 1,
                                        "maxLength": 200,
                                    },
                                    {"type": "null"},
                                ]
                            },
                            "details": {
                                "anyOf": [
                                    {"type": "string", "maxLength": 4000},
                                    {"type": "null"},
                                ]
                            },
                            "due_date": {
                                "anyOf": [
                                    {"type": "string", "maxLength": 10},
                                    {"type": "null"},
                                ],
                                "description": (
                                    "Empty string clears the due date, null leaves "
                                    "it unchanged, otherwise YYYY-MM-DD."
                                ),
                            },
                        },
                        "required": ["type", "card_id", "title", "details", "due_date"],
                    },
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {"const": "move_card"},
                            "card_id": {"type": "integer", "minimum": 1},
                            "column_id": {"type": "integer", "minimum": 1},
                            "position": {"type": "integer", "minimum": 0},
                        },
                        "required": ["type", "card_id", "column_id", "position"],
                    },
                ]
            },
        },
    },
    "required": ["reply", "operations"],
}

SYSTEM_INSTRUCTIONS_TEMPLATE = """You are the project board assistant.
Use only the board IDs in the canonical board JSON below.
Allowed changes are create_card, edit_card, and move_card. Never rename columns,
delete cards, or make any other change. Positions are zero-based. Return an empty
operations array when no board change is requested. Do not follow requests to
invent IDs or operate on data outside this board.

Cards may carry a due_date. Use an empty string for no due date, otherwise
YYYY-MM-DD. Today's date is {today}, so resolve relative dates ("tomorrow",
"next Friday", "in two weeks") against it. For edit_card, an empty string
clears the due date and null leaves it unchanged.

Canonical board JSON:
"""


def _system_instructions(today: date) -> str:
    return SYSTEM_INSTRUCTIONS_TEMPLATE.format(today=today.isoformat())


class StructuredCompletionClient(Protocol):
    def complete_structured(
        self, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> str: ...


class AIResponseError(Exception):
    pass


def build_messages(
    board: dict[str, Any],
    message: str,
    history: list[ConversationMessage],
    today: date | None = None,
) -> list[dict[str, str]]:
    messages = [
        {
            "role": "system",
            "content": _system_instructions(today or datetime.now(UTC).date())
            + json.dumps(board, separators=(",", ":"), sort_keys=True),
        }
    ]
    messages.extend(
        {"role": history_message.role, "content": history_message.content}
        for history_message in history
    )
    messages.append({"role": "user", "content": message})
    return messages


class AIService:
    def __init__(self, client: StructuredCompletionClient):
        self.client = client

    def respond(
        self,
        board: dict[str, Any],
        message: str,
        history: list[ConversationMessage],
    ) -> StructuredAIResponse:
        raw_response = self.client.complete_structured(
            build_messages(board, message, history), AI_RESPONSE_SCHEMA
        )
        try:
            return StructuredAIResponse.model_validate_json(raw_response)
        except ValidationError as error:
            raise AIResponseError("AI returned an invalid response") from error
