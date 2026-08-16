import os
from typing import Any

import httpx
from openrouter import OpenRouter, components, errors
from openrouter.utils import BackoffStrategy, RetryConfig

OPENROUTER_MODEL = "openai/gpt-oss-120b"
OPENROUTER_SERVER_URL = "https://openrouter.ai/api/v1"
OPENROUTER_TIMEOUT_MS = 30_000


class OpenRouterClientError(Exception):
    """Base error for controlled OpenRouter failures."""


class OpenRouterConfigurationError(OpenRouterClientError):
    """Raised when required OpenRouter configuration is missing."""


class OpenRouterRequestError(OpenRouterClientError):
    """Raised when OpenRouter cannot return a usable response."""


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        server_url: str | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        configured_api_key = api_key or os.getenv("OPENROUTER_API_KEY") or ""
        self.api_key = configured_api_key.strip()
        if not self.api_key:
            raise OpenRouterConfigurationError("OPENROUTER_API_KEY is not configured")

        self.server_url = (
            server_url or os.getenv("OPENROUTER_SERVER_URL") or OPENROUTER_SERVER_URL
        )
        self.http_client = http_client

    def _complete(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        response_format: components.ResponseFormat | None = None,
        provider: components.ProviderPreferences | None = None,
    ) -> str:
        retry_config = RetryConfig(
            "none",
            BackoffStrategy(0, 0, 1, 0),
            retry_connection_errors=False,
        )

        try:
            with OpenRouter(
                api_key=self.api_key,
                server_url=self.server_url,
                client=self.http_client,
                retry_config=retry_config,
                timeout_ms=OPENROUTER_TIMEOUT_MS,
            ) as sdk:
                response = sdk.chat.send(
                    model=OPENROUTER_MODEL,
                    messages=messages,  # type: ignore[arg-type]
                    max_tokens=max_tokens,
                    reasoning_effort="low",
                    response_format=response_format,
                    provider=provider,
                    temperature=0,
                    stream=False,
                )
        except httpx.TimeoutException as error:
            raise OpenRouterRequestError("OpenRouter request timed out") from error
        except (httpx.NetworkError, errors.NoResponseError) as error:
            raise OpenRouterRequestError("OpenRouter is unavailable") from error
        except errors.OpenRouterError as error:
            raise OpenRouterRequestError(
                f"OpenRouter request failed with status {error.status_code}"
            ) from error

        if not response.choices:
            raise OpenRouterRequestError("OpenRouter returned an invalid response")

        content = response.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise OpenRouterRequestError("OpenRouter returned an invalid response")

        return content.strip()

    def complete(self, prompt: str) -> str:
        return self._complete(
            [{"role": "user", "content": prompt}],
            max_tokens=128,
        )

    def complete_structured(
        self, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> str:
        return self._complete(
            messages,
            max_tokens=2048,
            response_format=components.ChatFormatJSONSchemaConfig(
                type="json_schema",
                json_schema=components.ChatJSONSchemaConfig(
                    name="board_assistant_response",
                    description="A reply and optional validated board operations.",
                    schema_=schema,
                    strict=True,
                ),
            ),
            provider=components.ProviderPreferences(require_parameters=True),
        )


def run_connectivity_check() -> str:
    answer = OpenRouterClient().complete("Reply with exactly 4. What is 2+2?")
    if answer != "4":
        raise OpenRouterRequestError("OpenRouter returned an incorrect answer")
    return answer


def main() -> None:
    try:
        answer = run_connectivity_check()
    except OpenRouterClientError as error:
        raise SystemExit(f"OpenRouter connectivity check failed: {error}") from error

    print(f"OpenRouter connectivity check passed: {answer}")


if __name__ == "__main__":
    main()
