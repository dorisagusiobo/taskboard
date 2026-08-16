from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main


def test_health_endpoint_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_page_loads_html_and_calls_api(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Project Management MVP" in response.text
    assert "API status: ok" in response.text


def test_static_frontend_is_served_when_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    assets_dir = static_dir / "_next" / "static"
    assets_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text(
        "<html><head><title>Frontend Build</title></head><body>Board ready</body></html>",
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('ready')", encoding="utf-8")

    monkeypatch.setattr(main, "STATIC_DIR", static_dir)
    test_app = main.create_app(database_path=tmp_path / "test.sqlite3")

    with TestClient(test_app) as test_client:
        response = test_client.get("/")
        health_response = test_client.get("/api/health")
        asset_response = test_client.get("/_next/static/app.js")
        missing_response = test_client.get("/missing.js")
        missing_api_response = test_client.get("/api/missing")

    assert response.status_code == 200
    assert "Frontend Build" in response.text
    assert health_response.status_code == 200
    assert asset_response.status_code == 200
    assert "console.log('ready')" in asset_response.text
    assert missing_response.status_code == 404
    assert missing_api_response.status_code == 404


def test_login_creates_a_signed_session_cookie(client):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{main.SESSION_COOKIE}=")
    assert "httponly" in cookie.lower()
    assert "samesite=lax" in cookie.lower()
    assert "max-age" not in cookie.lower()
    assert "password" not in cookie.lower()

    session_response = client.get("/api/auth/me")
    assert session_response.status_code == 200
    assert session_response.json() == {"username": "user"}


@pytest.mark.parametrize(
    ("username", "password"),
    [("wrong", "password"), ("user", "wrong")],
)
def test_login_rejects_invalid_credentials(client, username, password):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}
    assert main.SESSION_COOKIE not in client.cookies


def test_current_session_rejects_unauthenticated_and_tampered_cookies(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401

    client.cookies.set(main.SESSION_COOKIE, "not-a-valid-session")
    tampered_response = client.get("/api/auth/me")
    assert tampered_response.status_code == 401


def test_logout_clears_the_session(client):
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "expires=thu, 01 jan 1970" in response.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").status_code == 401
