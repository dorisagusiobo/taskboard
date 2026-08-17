import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/boards", None),
        ("post", "/api/boards", {"name": "New board"}),
        ("patch", "/api/boards/1", {"name": "New name"}),
        ("delete", "/api/boards/1", None),
    ],
)
def test_every_board_management_route_requires_authentication(
    client: TestClient, method: str, path: str, payload: dict | None
):
    response = client.request(method, path, json=payload)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_lists_the_seeded_board_by_default(
    authenticated_client: TestClient, board_id: int
):
    response = authenticated_client.get("/api/boards")

    assert response.status_code == 200
    assert response.json() == [{"id": board_id, "name": "Board", "position": 0}]


def test_creates_a_second_board_with_fixed_empty_columns(
    authenticated_client: TestClient, board_id: int
):
    response = authenticated_client.post(
        "/api/boards", json={"name": "Personal projects"}
    )

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Personal projects"
    assert [column["title"] for column in created["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert sum(len(column["cards"]) for column in created["columns"]) == 0

    listed = authenticated_client.get("/api/boards").json()
    assert [board["name"] for board in listed] == ["Board", "Personal projects"]


def test_create_board_defaults_the_name_and_rejects_blank_names(
    authenticated_client: TestClient,
):
    default_response = authenticated_client.post("/api/boards", json={})
    assert default_response.status_code == 201
    assert default_response.json()["name"] == "Board"

    blank_response = authenticated_client.post("/api/boards", json={"name": "   "})
    assert blank_response.status_code == 422


def test_renames_a_board(authenticated_client: TestClient, board_id: int):
    response = authenticated_client.patch(
        f"/api/boards/{board_id}", json={"name": "Renamed"}
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert authenticated_client.get("/api/boards").json() == [
        {"id": board_id, "name": "Renamed", "position": 0}
    ]


def test_cannot_delete_the_only_board(authenticated_client: TestClient, board_id: int):
    response = authenticated_client.delete(f"/api/boards/{board_id}")

    assert response.status_code == 409
    assert response.json() == {"detail": "Cannot delete your last board"}
    assert authenticated_client.get(f"/api/boards/{board_id}").status_code == 200


def test_deletes_a_second_board(authenticated_client: TestClient, board_id: int):
    created = authenticated_client.post(
        "/api/boards", json={"name": "Temporary"}
    ).json()

    response = authenticated_client.delete(f"/api/boards/{created['id']}")

    assert response.status_code == 200
    assert response.json() == [{"id": board_id, "name": "Board", "position": 0}]
    assert authenticated_client.get(f"/api/boards/{created['id']}").status_code == 404


def test_board_management_routes_are_isolated_per_user(
    authenticated_client: TestClient, board_id: int, database_path
):
    from database import BoardStore

    store = BoardStore(database_path)
    store.register_user("other", "password")
    other_board_id = store.list_boards("other")[0]["id"]

    responses = [
        authenticated_client.get(f"/api/boards/{other_board_id}"),
        authenticated_client.patch(
            f"/api/boards/{other_board_id}", json={"name": "Stolen"}
        ),
        authenticated_client.delete(f"/api/boards/{other_board_id}"),
    ]

    assert all(response.status_code == 404 for response in responses)
    assert store.get_board("other", other_board_id)["name"] == "Board"
