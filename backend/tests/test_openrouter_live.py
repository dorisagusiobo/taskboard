import os

import pytest

from openrouter_client import run_connectivity_check


@pytest.mark.live
def test_live_openrouter_answers_two_plus_two():
    if os.getenv("RUN_OPENROUTER_LIVE") != "1":
        pytest.skip("set RUN_OPENROUTER_LIVE=1 to run the live OpenRouter test")

    assert run_connectivity_check() == "4"
