#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="project-management-mvp-e2e"
IMAGE_NAME="project-management-mvp:e2e"
VOLUME_NAME="project-management-mvp-e2e-data"
HOST_PORT="18001"
FAKE_OPENROUTER_PORT="18002"
FAKE_OPENROUTER_PID=""

cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env file in project root." >&2
  exit 1
fi

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
  if [[ -n "$FAKE_OPENROUTER_PID" ]]; then
    kill "$FAKE_OPENROUTER_PID" >/dev/null 2>&1 || true
    wait "$FAKE_OPENROUTER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT
cleanup

docker build -t "$IMAGE_NAME" .

python3 scripts/fake-openrouter-server.py "$FAKE_OPENROUTER_PORT" &
FAKE_OPENROUTER_PID="$!"
FAKE_OPENROUTER_READY="0"
for ((attempt = 1; attempt <= 20; attempt++)); do
  if curl --fail --silent "http://127.0.0.1:${FAKE_OPENROUTER_PORT}/health" >/dev/null; then
    FAKE_OPENROUTER_READY="1"
    break
  fi
  if ! kill -0 "$FAKE_OPENROUTER_PID" >/dev/null 2>&1; then
    echo "Fake OpenRouter server failed to start." >&2
    exit 1
  fi
  sleep 0.25
done
if [[ "$FAKE_OPENROUTER_READY" != "1" ]]; then
  echo "Fake OpenRouter server did not become ready." >&2
  exit 1
fi

start_container() {
  docker run --rm -d \
    --name "$CONTAINER_NAME" \
    -p "127.0.0.1:${HOST_PORT}:8000" \
    --env-file .env \
    --env DATABASE_PATH=/app/data/project-management.sqlite3 \
    --env OPENROUTER_API_KEY=test-key \
    --env OPENROUTER_SERVER_URL="http://host.docker.internal:${FAKE_OPENROUTER_PORT}/api/v1" \
    --add-host host.docker.internal:host-gateway \
    -v "${VOLUME_NAME}:/app/data" \
    "$IMAGE_NAME" >/dev/null

  local status=""
  for ((attempt = 1; attempt <= 30; attempt++)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      docker logs "$CONTAINER_NAME" >&2 || true
      echo "End-to-end container failed to start." >&2
      exit 1
    fi
    sleep 1
  done

  docker logs "$CONTAINER_NAME" >&2 || true
  echo "End-to-end container did not become healthy within 30 seconds." >&2
  exit 1
}

start_container
(
  cd frontend
  PLAYWRIGHT_BASE_URL="http://127.0.0.1:${HOST_PORT}" npm run test:e2e
)

docker rm -f "$CONTAINER_NAME" >/dev/null
start_container
(
  cd frontend
  PLAYWRIGHT_BASE_URL="http://127.0.0.1:${HOST_PORT}" \
    PLAYWRIGHT_RESTART_CHECK=1 \
    npx playwright test --grep "persists every board mutation"
)

echo "Docker browser integration test passed."
