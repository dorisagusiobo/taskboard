import os
import secrets
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated, Self

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import (
    AfterValidator,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse

from ai_service import AIChatRequest, AIResponseError, AIService
from database import (
    DEFAULT_BOARD_NAME,
    BoardNotFoundError,
    BoardStore,
    CardNotFoundError,
    ColumnNotFoundError,
    InvalidPositionError,
    LastBoardError,
    UsernameTakenError,
)
from openrouter_client import (
    OpenRouterClient,
    OpenRouterConfigurationError,
    OpenRouterRequestError,
)

APP_ROOT = Path(__file__).resolve().parent
STATIC_DIR = APP_ROOT / "static"
DEFAULT_DATA_DIR = (
    APP_ROOT.parent / "data" if APP_ROOT.name == "backend" else APP_ROOT / "data"
)
DEFAULT_DATABASE_PATH = DEFAULT_DATA_DIR / "project-management.sqlite3"
SESSION_COOKIE = "pm_session"
DEFAULT_SEED_USERNAME = "user"
DEFAULT_SEED_PASSWORD = "password"
DEFAULT_SESSION_SECRET = secrets.token_urlsafe(32)

ColumnTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
BoardName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
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

MAX_LABELS_PER_CARD = 5
MAX_LABEL_LENGTH = 24


def _validate_labels(value: str) -> str:
    if value == "":
        return value
    labels = [label.strip() for label in value.split(",") if label.strip()]
    if len(labels) > MAX_LABELS_PER_CARD:
        raise ValueError(f"A card may have at most {MAX_LABELS_PER_CARD} labels")
    for label in labels:
        if len(label) > MAX_LABEL_LENGTH:
            raise ValueError(
                f"Each label must be {MAX_LABEL_LENGTH} characters or fewer"
            )
    deduped: list[str] = []
    seen: set[str] = set()
    for label in labels:
        key = label.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(label)
    return ",".join(deduped)


CardLabels = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=200),
    AfterValidator(_validate_labels),
]
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=50,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=200)]


class LoginCredentials(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: Username
    password: Password


class UserSession(BaseModel):
    username: str


class CardResponse(BaseModel):
    id: int
    title: str
    details: str
    due_date: str
    labels: str
    position: int


class ColumnResponse(BaseModel):
    id: int
    title: str
    position: int
    cards: list[CardResponse]


class BoardResponse(BaseModel):
    id: int
    name: str
    columns: list[ColumnResponse]


class BoardSummary(BaseModel):
    id: int
    name: str
    position: int


class CreateBoardRequest(BaseModel):
    name: BoardName = DEFAULT_BOARD_NAME


class RenameBoardRequest(BaseModel):
    name: BoardName


class RenameColumnRequest(BaseModel):
    title: ColumnTitle


class CreateCardRequest(BaseModel):
    column_id: int
    title: CardTitle
    details: CardDetails = ""
    due_date: CardDueDate = ""
    labels: CardLabels = ""


class UpdateCardRequest(BaseModel):
    title: CardTitle | None = None
    details: CardDetails | None = None
    due_date: CardDueDate | None = None
    labels: CardLabels | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> Self:
        if (
            self.title is None
            and self.details is None
            and self.due_date is None
            and self.labels is None
        ):
            raise ValueError("Provide a title, details, due date, or labels")
        return self


class MoveCardRequest(BaseModel):
    column_id: int
    position: int = Field(ge=0)


class AIChatResponse(BaseModel):
    reply: str
    board: BoardResponse | None


def create_app(
    session_secret: str | None = None,
    database_path: str | Path | None = None,
    openrouter_client_factory: Callable[[], OpenRouterClient] | None = None,
) -> FastAPI:
    resolved_database_path = Path(
        database_path or os.getenv("DATABASE_PATH") or DEFAULT_DATABASE_PATH
    )
    board_store = BoardStore(resolved_database_path)
    resolved_openrouter_client_factory = openrouter_client_factory or OpenRouterClient

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        board_store.init_schema()
        board_store.ensure_seed_account(DEFAULT_SEED_USERNAME, DEFAULT_SEED_PASSWORD)
        yield

    app = FastAPI(title="Project Management MVP", version="0.3.0", lifespan=lifespan)
    app.state.board_store = board_store
    app.add_middleware(
        SessionMiddleware,
        secret_key=session_secret
        or os.getenv("SESSION_SECRET")
        or DEFAULT_SESSION_SECRET,
        session_cookie=SESSION_COOKIE,
        max_age=None,
        same_site="lax",
        https_only=False,
    )

    @app.exception_handler(BoardNotFoundError)
    def handle_board_not_found(_request: Request, _error: BoardNotFoundError):
        return JSONResponse(status_code=404, content={"detail": "Board not found"})

    @app.exception_handler(ColumnNotFoundError)
    def handle_column_not_found(_request: Request, _error: ColumnNotFoundError):
        return JSONResponse(status_code=404, content={"detail": "Column not found"})

    @app.exception_handler(CardNotFoundError)
    def handle_card_not_found(_request: Request, _error: CardNotFoundError):
        return JSONResponse(status_code=404, content={"detail": "Card not found"})

    @app.exception_handler(InvalidPositionError)
    def handle_invalid_position(_request: Request, _error: InvalidPositionError):
        return JSONResponse(status_code=422, content={"detail": "Invalid position"})

    @app.exception_handler(LastBoardError)
    def handle_last_board(_request: Request, _error: LastBoardError):
        return JSONResponse(
            status_code=409, content={"detail": "Cannot delete your last board"}
        )

    def authenticated_username(request: Request) -> str:
        username = request.session.get("username")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return username

    @app.get("/api/health")
    def health_check():
        return {"status": "ok"}

    @app.post(
        "/api/auth/register",
        response_model=UserSession,
        status_code=status.HTTP_201_CREATED,
    )
    def register(payload: RegisterRequest, request: Request):
        try:
            board_store.register_user(payload.username, payload.password)
        except UsernameTakenError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username is already taken",
            ) from error

        request.session.clear()
        request.session["username"] = payload.username
        return UserSession(username=payload.username)

    @app.post("/api/auth/login", response_model=UserSession)
    def login(credentials: LoginCredentials, request: Request):
        if not board_store.verify_password(credentials.username, credentials.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        request.session.clear()
        request.session["username"] = credentials.username
        return UserSession(username=credentials.username)

    @app.get("/api/auth/me", response_model=UserSession)
    def current_session(request: Request):
        username = authenticated_username(request)
        return UserSession(username=username)

    @app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request):
        request.session.clear()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/boards", response_model=list[BoardSummary])
    def list_boards(request: Request):
        return board_store.list_boards(authenticated_username(request))

    @app.post(
        "/api/boards",
        response_model=BoardResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_board(payload: CreateBoardRequest, request: Request):
        return board_store.create_board(authenticated_username(request), payload.name)

    @app.get("/api/boards/{board_id}", response_model=BoardResponse)
    def get_board(board_id: int, request: Request):
        return board_store.get_board(authenticated_username(request), board_id)

    @app.patch("/api/boards/{board_id}", response_model=BoardResponse)
    def rename_board(board_id: int, payload: RenameBoardRequest, request: Request):
        return board_store.rename_board(
            authenticated_username(request), board_id, payload.name
        )

    @app.delete("/api/boards/{board_id}", response_model=list[BoardSummary])
    def delete_board(board_id: int, request: Request):
        return board_store.delete_board(authenticated_username(request), board_id)

    @app.patch(
        "/api/boards/{board_id}/columns/{column_id}", response_model=BoardResponse
    )
    def rename_column(
        board_id: int, column_id: int, payload: RenameColumnRequest, request: Request
    ):
        return board_store.rename_column(
            authenticated_username(request), board_id, column_id, payload.title
        )

    @app.post(
        "/api/boards/{board_id}/cards",
        response_model=BoardResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_card(board_id: int, payload: CreateCardRequest, request: Request):
        return board_store.create_card(
            authenticated_username(request),
            board_id,
            payload.column_id,
            payload.title,
            payload.details,
            payload.due_date,
            payload.labels,
        )

    @app.patch("/api/boards/{board_id}/cards/{card_id}", response_model=BoardResponse)
    def update_card(
        board_id: int, card_id: int, payload: UpdateCardRequest, request: Request
    ):
        return board_store.update_card(
            authenticated_username(request),
            board_id,
            card_id,
            title=payload.title,
            details=payload.details,
            due_date=payload.due_date,
            labels=payload.labels,
        )

    @app.delete("/api/boards/{board_id}/cards/{card_id}", response_model=BoardResponse)
    def delete_card(board_id: int, card_id: int, request: Request):
        return board_store.delete_card(
            authenticated_username(request), board_id, card_id
        )

    @app.post(
        "/api/boards/{board_id}/cards/{card_id}/move", response_model=BoardResponse
    )
    def move_card(
        board_id: int, card_id: int, payload: MoveCardRequest, request: Request
    ):
        return board_store.move_card(
            authenticated_username(request),
            board_id,
            card_id,
            payload.column_id,
            payload.position,
        )

    @app.post("/api/boards/{board_id}/ai/chat", response_model=AIChatResponse)
    def ai_chat(board_id: int, payload: AIChatRequest, request: Request):
        username = authenticated_username(request)
        board = board_store.get_board(username, board_id)
        try:
            ai_response = AIService(resolved_openrouter_client_factory()).respond(
                board,
                payload.message,
                payload.history,
            )
        except OpenRouterConfigurationError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is not configured",
            ) from error
        except OpenRouterRequestError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI service is unavailable",
            ) from error
        except AIResponseError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI service returned an invalid response",
            ) from error

        if not ai_response.operations:
            return AIChatResponse(reply=ai_response.reply, board=None)

        try:
            updated_board = board_store.apply_board_operations(
                username,
                board_id,
                [operation.model_dump() for operation in ai_response.operations],
            )
        except (
            CardNotFoundError,
            ColumnNotFoundError,
            InvalidPositionError,
            ValueError,
        ) as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="AI response could not be applied",
            ) from error

        return AIChatResponse(
            reply=ai_response.reply,
            board=BoardResponse.model_validate(updated_board),
        )

    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
    else:

        @app.get("/", response_class=HTMLResponse)
        def root_page():
            return """
            <!doctype html>
            <html lang="en">
              <head><meta charset="utf-8" /><title>Project Management MVP</title></head>
              <body><h1>Project Management MVP</h1><p>API status: ok</p></body>
            </html>
            """

    return app


app = create_app()
