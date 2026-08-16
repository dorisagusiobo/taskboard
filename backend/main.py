import os
import secrets
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Self

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints, model_validator
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse

from ai_service import AIChatRequest, AIResponseError, AIService
from database import (
    BoardNotFoundError,
    BoardStore,
    CardNotFoundError,
    ColumnNotFoundError,
    InvalidPositionError,
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
MVP_USERNAME = "user"
MVP_PASSWORD = "password"
DEFAULT_SESSION_SECRET = secrets.token_urlsafe(32)

ColumnTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
CardTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
CardDetails = Annotated[str, StringConstraints(max_length=4000)]


class LoginCredentials(BaseModel):
    username: str
    password: str


class UserSession(BaseModel):
    username: str


class CardResponse(BaseModel):
    id: int
    title: str
    details: str
    position: int


class ColumnResponse(BaseModel):
    id: int
    title: str
    position: int
    cards: list[CardResponse]


class BoardResponse(BaseModel):
    id: int
    columns: list[ColumnResponse]


class RenameColumnRequest(BaseModel):
    title: ColumnTitle


class CreateCardRequest(BaseModel):
    column_id: int
    title: CardTitle
    details: CardDetails = ""


class UpdateCardRequest(BaseModel):
    title: CardTitle | None = None
    details: CardDetails | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> Self:
        if self.title is None and self.details is None:
            raise ValueError("Provide a title or details")
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
        board_store.initialize(MVP_USERNAME)
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

    def authenticated_username(request: Request) -> str:
        username = request.session.get("username")
        if username != MVP_USERNAME:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return username

    @app.get("/api/health")
    def health_check():
        return {"status": "ok"}

    @app.post("/api/auth/login", response_model=UserSession)
    def login(credentials: LoginCredentials, request: Request):
        if credentials.username != MVP_USERNAME or credentials.password != MVP_PASSWORD:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        request.session.clear()
        request.session["username"] = MVP_USERNAME
        return UserSession(username=MVP_USERNAME)

    @app.get("/api/auth/me", response_model=UserSession)
    def current_session(request: Request):
        username = authenticated_username(request)
        return UserSession(username=username)

    @app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request):
        request.session.clear()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/board", response_model=BoardResponse)
    def get_board(request: Request):
        return board_store.get_board(authenticated_username(request))

    @app.patch("/api/board/columns/{column_id}", response_model=BoardResponse)
    def rename_column(column_id: int, payload: RenameColumnRequest, request: Request):
        return board_store.rename_column(
            authenticated_username(request), column_id, payload.title
        )

    @app.post(
        "/api/board/cards",
        response_model=BoardResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_card(payload: CreateCardRequest, request: Request):
        return board_store.create_card(
            authenticated_username(request),
            payload.column_id,
            payload.title,
            payload.details,
        )

    @app.patch("/api/board/cards/{card_id}", response_model=BoardResponse)
    def update_card(card_id: int, payload: UpdateCardRequest, request: Request):
        return board_store.update_card(
            authenticated_username(request),
            card_id,
            title=payload.title,
            details=payload.details,
        )

    @app.delete("/api/board/cards/{card_id}", response_model=BoardResponse)
    def delete_card(card_id: int, request: Request):
        return board_store.delete_card(authenticated_username(request), card_id)

    @app.post("/api/board/cards/{card_id}/move", response_model=BoardResponse)
    def move_card(card_id: int, payload: MoveCardRequest, request: Request):
        return board_store.move_card(
            authenticated_username(request),
            card_id,
            payload.column_id,
            payload.position,
        )

    @app.post("/api/ai/chat", response_model=AIChatResponse)
    def ai_chat(payload: AIChatRequest, request: Request):
        username = authenticated_username(request)
        board = board_store.get_board(username)
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
