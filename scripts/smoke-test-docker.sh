#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="project-management-mvp-smoke"
IMAGE_NAME="project-management-mvp:smoke"
VOLUME_NAME="project-management-mvp-smoke-data"
HOST_PORT="18000"

cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env file in project root." >&2
  exit 1
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
COOKIE_JAR="$(mktemp)"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
  rm -f "$COOKIE_JAR"
}

trap cleanup EXIT

docker build -t "$IMAGE_NAME" .

start_container() {
  docker run --rm -d \
    --name "$CONTAINER_NAME" \
    -p "127.0.0.1:${HOST_PORT}:8000" \
    --env-file .env \
    --env DATABASE_PATH=/app/data/project-management.sqlite3 \
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
}

login() {
  local response
  response="$(curl --fail --silent --show-error \
    --cookie-jar "$COOKIE_JAR" \
    --header 'Content-Type: application/json' \
    --data '{"username":"user","password":"password"}' \
    "http://127.0.0.1:${HOST_PORT}/api/auth/login")"
  if [[ "$response" != '{"username":"user"}' ]]; then
    echo "Unexpected login response: $response" >&2
    exit 1
  fi
}

start_container

unauthenticated_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "http://127.0.0.1:${HOST_PORT}/api/board")"
if [[ "$unauthenticated_status" != "401" ]]; then
  echo "Unauthenticated board request returned $unauthenticated_status instead of 401." >&2
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

login
board_response="$(curl --fail --silent --show-error \
  --cookie "$COOKIE_JAR" \
  "http://127.0.0.1:${HOST_PORT}/api/board")"
if [[ "$board_response" != *'"title":"Backlog"'* || "$board_response" != *'"title":"Done"'* ]]; then
  echo "Seeded board was not returned after login." >&2
  exit 1
fi

rename_response="$(curl --fail --silent --show-error \
  --request PATCH \
  --cookie "$COOKIE_JAR" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Docker persistence probe"}' \
  "http://127.0.0.1:${HOST_PORT}/api/board/columns/1")"
if [[ "$rename_response" != *'"title":"Docker persistence probe"'* ]]; then
  echo "Column rename did not succeed in the smoke-test container." >&2
  exit 1
fi

docker rm -f "$CONTAINER_NAME" >/dev/null
start_container
login

persisted_response="$(curl --fail --silent --show-error \
  --cookie "$COOKIE_JAR" \
  "http://127.0.0.1:${HOST_PORT}/api/board")"
if [[ "$persisted_response" != *'"title":"Docker persistence probe"'* ]]; then
  echo "Board mutation did not persist across a container restart." >&2
  exit 1
fi

echo "Docker smoke test passed."
