from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main


def make_client(database_path: Path, demo_mode: bool) -> TestClient:
    return TestClient(
        main.create_app(
            session_secret="test-session-secret",
            database_path=database_path,
            demo_mode=demo_mode,
        )
    )


def login(client: TestClient, username: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200
    return response.json()


def test_demo_account_is_hidden_outside_demo_mode(database_path: Path):
    with make_client(database_path, demo_mode=False) as client:
        assert client.get("/api/demo-account").json() is None
        assert login(client, "user", "password") == {
            "username": "user",
            "is_demo": False,
        }
        response = client.post(
            "/api/auth/password",
            json={"current_password": "password", "new_password": "changed-pass"},
        )
        assert response.status_code == 204


def test_demo_mode_advertises_and_flags_the_seed_account(database_path: Path):
    with make_client(database_path, demo_mode=True) as client:
        assert client.get("/api/demo-account").json() == {
            "username": "user",
            "password": "password",
        }
        assert login(client, "user", "password")["is_demo"] is True
        assert client.get("/api/auth/me").json()["is_demo"] is True


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "/api/auth/password",
            {"current_password": "password", "new_password": "hijacked-pass"},
        ),
        ("/api/auth/delete-account", {"password": "password"}),
    ],
)
def test_demo_mode_protects_the_seed_account(
    database_path: Path, path: str, body: dict
):
    with make_client(database_path, demo_mode=True) as client:
        login(client, "user", "password")

        response = client.post(path, json=body)

        assert response.status_code == 403
        client.post("/api/auth/logout")
        assert login(client, "user", "password")["is_demo"] is True


def test_demo_mode_leaves_other_accounts_fully_editable(database_path: Path):
    with make_client(database_path, demo_mode=True) as client:
        registered = client.post(
            "/api/auth/register",
            json={"username": "visitor", "password": "visitor-pass"},
        )
        assert registered.json() == {"username": "visitor", "is_demo": False}

        changed = client.post(
            "/api/auth/password",
            json={"current_password": "visitor-pass", "new_password": "new-pass-123"},
        )
        deleted = client.post(
            "/api/auth/delete-account", json={"password": "new-pass-123"}
        )

        assert changed.status_code == 204
        assert deleted.status_code == 204


def test_session_cookie_is_secure_when_configured(
    database_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("COOKIE_SECURE", "true")
    with make_client(database_path, demo_mode=False) as client:
        response = client.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        )

    assert "secure" in response.headers["set-cookie"].lower()
