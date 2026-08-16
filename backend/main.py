import os
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

APP_ROOT = Path(__file__).resolve().parent
STATIC_DIR = APP_ROOT / "static"
SESSION_COOKIE = "pm_session"
MVP_USERNAME = "user"
MVP_PASSWORD = "password"
DEFAULT_SESSION_SECRET = secrets.token_urlsafe(32)


class LoginCredentials(BaseModel):
    username: str
    password: str


class UserSession(BaseModel):
    username: str


def create_app(session_secret: str | None = None) -> FastAPI:
    app = FastAPI(title="Project Management MVP", version="0.1.0")
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
        username = request.session.get("username")
        if username != MVP_USERNAME:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return UserSession(username=username)

    @app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request):
        request.session.clear()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

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
