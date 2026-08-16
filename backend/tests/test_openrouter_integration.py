import json

import httpx
import pytest

import openrouter_client


def test_official_sdk_parses_a_local_fake_provider_response():
    def respond(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert request.url.path == "/api/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-key"
        assert payload["model"] == "openai/gpt-oss-120b"
        assert payload["messages"] == [{"role": "user", "content": "What is 2+2?"}]
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "index": 0,
                        "message": {"content": "4", "role": "assistant"},
                    }
                ],
                "created": 1,
                "id": "chatcmpl-test",
                "model": "openai/gpt-oss-120b",
                "object": "chat.completion",
                "system_fingerprint": None,
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as http_client:
        client = openrouter_client.OpenRouterClient(
            api_key="test-key",
            server_url="https://fake.openrouter.test/api/v1",
            http_client=http_client,
        )
        assert client.complete("What is 2+2?") == "4"


def test_official_sdk_provider_error_is_mapped_without_leaking_its_body():
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            503,
            headers={"content-type": "application/json"},
            json={"error": {"code": 503, "message": "secret provider detail"}},
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as http_client:
        client = openrouter_client.OpenRouterClient(
            api_key="test-key",
            server_url="https://fake.openrouter.test/api/v1",
            http_client=http_client,
        )
        with pytest.raises(openrouter_client.OpenRouterRequestError) as caught:
            client.complete("What is 2+2?")

    assert str(caught.value) == "OpenRouter request failed with status 503"
    assert "secret provider detail" not in str(caught.value)


def test_official_sdk_serializes_the_strict_structured_output_request():
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "reply": {"type": "string"},
            "operations": {"type": "array", "items": {}},
        },
        "required": ["reply", "operations"],
    }

    def respond(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["response_format"] == {
            "type": "json_schema",
            "json_schema": {
                "name": "board_assistant_response",
                "description": "A reply and optional validated board operations.",
                "schema": schema,
                "strict": True,
            },
        }
        assert payload["provider"]["require_parameters"] is True
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "index": 0,
                        "message": {
                            "content": '{"reply":"Done","operations":[]}',
                            "role": "assistant",
                        },
                    }
                ],
                "created": 1,
                "id": "chatcmpl-test",
                "model": "openai/gpt-oss-120b",
                "object": "chat.completion",
                "system_fingerprint": None,
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as http_client:
        client = openrouter_client.OpenRouterClient(
            api_key="test-key",
            server_url="https://fake.openrouter.test/api/v1",
            http_client=http_client,
        )
        response = client.complete_structured(
            [{"role": "user", "content": "Update"}], schema
        )

    assert response == '{"reply":"Done","operations":[]}'
