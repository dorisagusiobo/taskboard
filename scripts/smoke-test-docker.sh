#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="project-management-mvp-smoke"
IMAGE_NAME="project-management-mvp:smoke"
HOST_PORT="18000"

cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env file in project root." >&2
  exit 1
fi

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup

docker build -t "$IMAGE_NAME" .
docker run --rm -d \
  --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${HOST_PORT}:8000" \
  --env-file .env \
  "$IMAGE_NAME" >/dev/null

for ((attempt = 1; attempt <= 30; attempt++)); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
    docker logs "$CONTAINER_NAME" >&2 || true
    echo "Smoke-test container failed to start." >&2
    exit 1
  fi
  sleep 1
done

if [[ "$status" != "healthy" ]]; then
  docker logs "$CONTAINER_NAME" >&2 || true
  echo "Smoke-test container did not become healthy within 30 seconds." >&2
  exit 1
fi

api_response="$(curl --fail --silent --show-error "http://127.0.0.1:${HOST_PORT}/api/health")"
if [[ "$api_response" != '{"status":"ok"}' ]]; then
  echo "Unexpected health response: $api_response" >&2
  exit 1
fi

root_response="$(curl --fail --silent --show-error "http://127.0.0.1:${HOST_PORT}/")"
if [[ "$root_response" != *"Loading workspace"* || "$root_response" != *"/_next/"* ]]; then
  echo "Root page did not contain the exported authenticated application." >&2
  exit 1
fi

echo "Docker smoke test passed."
