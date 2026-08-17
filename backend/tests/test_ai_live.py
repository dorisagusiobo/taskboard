import os
from pathlib import Path

import pytest

from ai_service import AIService
from database import BoardStore
from openrouter_client import OpenRouterClient


def require_live_test() -> None:
    if os.getenv("RUN_OPENROUTER_LIVE") != "1":
        pytest.skip("set RUN_OPENROUTER_LIVE=1 to run live OpenRouter tests")


@pytest.mark.live
def test_live_structured_read_only_response(tmp_path: Path):
    require_live_test()
    store = BoardStore(tmp_path / "read-only.sqlite3")
    store.register_user("user", "password")
    board_id = store.list_boards("user")[0]["id"]
    board = store.get_board("user", board_id)

    response = AIService(OpenRouterClient()).respond(
        board,
        "Briefly summarize this board without changing it.",
        [],
    )

    assert response.reply
    assert response.operations == []
    assert store.get_board("user", board_id) == board


@pytest.mark.live
def test_live_structured_create_uses_a_temporary_database(tmp_path: Path):
    require_live_test()
    store = BoardStore(tmp_path / "mutation.sqlite3")
    store.register_user("user", "password")
    board_id = store.list_boards("user")[0]["id"]
    original = store.get_board("user", board_id)
    target_column = original["columns"][0]

    response = AIService(OpenRouterClient()).respond(
        original,
        (
            "Create exactly one card titled 'Part 9 live smoke' with empty details "
            f"at the end of column ID {target_column['id']}. Make no other changes."
        ),
        [],
    )
    updated = store.apply_board_operations(
        "user",
        board_id,
        [operation.model_dump() for operation in response.operations],
    )

    assert len(response.operations) == 1
    assert response.operations[0].type == "create_card"
    assert sum(len(column["cards"]) for column in updated["columns"]) == 9
    assert updated["columns"][0]["cards"][-1]["title"] == "Part 9 live smoke"
