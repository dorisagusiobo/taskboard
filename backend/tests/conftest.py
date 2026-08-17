from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "test.sqlite3"


@pytest.fixture
def client(database_path: Path):
    with TestClient(
        main.create_app(
            session_secret="test-session-secret",
            database_path=database_path,
        )
    ) as test_client:
        yield test_client


@pytest.fixture
def authenticated_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return client


@pytest.fixture
def board_id(authenticated_client: TestClient) -> int:
    boards = authenticated_client.get("/api/boards").json()
    return boards[0]["id"]
