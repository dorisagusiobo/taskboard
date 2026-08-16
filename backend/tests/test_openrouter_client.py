from types import SimpleNamespace

import httpx
import pytest
from openrouter import errors

import openrouter_client


def fake_sdk(
    monkeypatch: pytest.MonkeyPatch,
    *,
    content: object = "4",
    request_error: Exception | None = None,
) -> tuple[dict[str, object], dict[str, object]]:
    constructor_arguments: dict[str, object] = {}
    request_arguments: dict[str, object] = {}

    class FakeChat:
        def send(self, **kwargs):
            request_arguments.update(kwargs)
            if request_error:
                raise request_error
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
            )

    class FakeOpenRouter:
        def __init__(self, **kwargs):
            constructor_arguments.update(kwargs)
            self.chat = FakeChat()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    monkeypatch.setattr(openrouter_client, "OpenRouter", FakeOpenRouter)
    return constructor_arguments, request_arguments


def test_client_requires_an_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(
        openrouter_client.OpenRouterConfigurationError,
        match="OPENROUTER_API_KEY is not configured",
    ):
        openrouter_client.OpenRouterClient()


def test_complete_uses_environment_key_and_required_model(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("OPENROUTER_API_KEY", " environment-key ")
    monkeypatch.delenv("OPENROUTER_SERVER_URL", raising=False)
    constructor_arguments, request_arguments = fake_sdk(monkeypatch)

    answer = openrouter_client.OpenRouterClient().complete("What is 2+2?")

    assert answer == "4"
    assert constructor_arguments["api_key"] == "environment-key"
    assert (
        constructor_arguments["server_url"] == openrouter_client.OPENROUTER_SERVER_URL
    )
    assert constructor_arguments["timeout_ms"] == 30_000
    assert request_arguments == {
        "model": "openai/gpt-oss-120b",
        "messages": [{"role": "user", "content": "What is 2+2?"}],
        "max_tokens": 128,
        "reasoning_effort": "low",
        "response_format": None,
        "provider": None,
        "temperature": 0,
        "stream": False,
    }


def test_client_supports_a_configured_server_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENROUTER_SERVER_URL", "http://fake-openrouter.test/api/v1")

    client = openrouter_client.OpenRouterClient(api_key="test-key")

    assert client.server_url == "http://fake-openrouter.test/api/v1"


def test_complete_structured_requests_strict_schema_support(
    monkeypatch: pytest.MonkeyPatch,
):
    _, request_arguments = fake_sdk(
        monkeypatch, content='{"reply":"Done","operations":[]}'
    )
    schema = {
        "type": "object",
        "properties": {"reply": {"type": "string"}},
        "required": ["reply"],
    }

    response = openrouter_client.OpenRouterClient(
        api_key="test-key"
    ).complete_structured([{"role": "user", "content": "Update"}], schema)

    assert response == '{"reply":"Done","operations":[]}'
    assert request_arguments["max_tokens"] == 2048
    response_format = request_arguments["response_format"]
    assert response_format.type == "json_schema"
    assert response_format.json_schema.name == "board_assistant_response"
    assert response_format.json_schema.strict is True
    assert response_format.json_schema.schema_ == schema
    assert request_arguments["provider"].require_parameters is True


@pytest.mark.parametrize(
    ("request_error", "expected_message"),
    [
        (httpx.ReadTimeout("secret timeout detail"), "OpenRouter request timed out"),
        (httpx.ConnectError("secret network detail"), "OpenRouter is unavailable"),
        (errors.NoResponseError(), "OpenRouter is unavailable"),
        (
            errors.OpenRouterError(
                "secret provider detail",
                httpx.Response(
                    503,
                    request=httpx.Request("POST", "https://openrouter.test"),
                ),
            ),
            "OpenRouter request failed with status 503",
        ),
    ],
)
def test_complete_maps_sdk_failures_without_exposing_details(
    monkeypatch: pytest.MonkeyPatch,
    request_error: Exception,
    expected_message: str,
):
    fake_sdk(monkeypatch, request_error=request_error)

    with pytest.raises(openrouter_client.OpenRouterRequestError) as caught:
        openrouter_client.OpenRouterClient(api_key="test-key").complete("hello")

    assert str(caught.value) == expected_message
    assert "secret" not in str(caught.value)


@pytest.mark.parametrize("content", [None, "", ["4"]])
def test_complete_rejects_missing_text_content(
    monkeypatch: pytest.MonkeyPatch, content: object
):
    fake_sdk(monkeypatch, content=content)

    with pytest.raises(
        openrouter_client.OpenRouterRequestError,
        match="OpenRouter returned an invalid response",
    ):
        openrouter_client.OpenRouterClient(api_key="test-key").complete("hello")


def test_connectivity_check_requires_exact_answer(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        openrouter_client.OpenRouterClient,
        "complete",
        lambda _self, _prompt: "The answer is 4",
    )

    with pytest.raises(
        openrouter_client.OpenRouterRequestError,
        match="OpenRouter returned an incorrect answer",
    ):
        openrouter_client.run_connectivity_check()


def test_main_reports_success(monkeypatch: pytest.MonkeyPatch, capsys):
    monkeypatch.setattr(openrouter_client, "run_connectivity_check", lambda: "4")

    openrouter_client.main()

    assert capsys.readouterr().out == "OpenRouter connectivity check passed: 4\n"


def test_main_reports_controlled_failure(
    monkeypatch: pytest.MonkeyPatch,
):
    def fail():
        raise openrouter_client.OpenRouterRequestError("OpenRouter is unavailable")

    monkeypatch.setattr(openrouter_client, "run_connectivity_check", fail)

    with pytest.raises(SystemExit, match="OpenRouter is unavailable"):
        openrouter_client.main()
