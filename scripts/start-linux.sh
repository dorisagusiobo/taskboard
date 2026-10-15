#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env file in project root." >&2
  exit 1
fi

docker build -t taskboard .
docker rm -f taskboard >/dev/null 2>&1 || true
docker run --rm -d \
  --name taskboard \
  -p 8000:8000 \
  --env-file .env \
  -v project-management-mvp-data:/app/data \
  taskboard >/dev/null

for ((attempt = 1; attempt <= 30; attempt++)); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' taskboard 2>/dev/null || true)"
  case "$status" in
    healthy)
      echo "Application running at http://localhost:8000"
      exit 0
      ;;
    unhealthy|exited|dead)
      docker logs taskboard >&2 || true
      docker rm -f taskboard >/dev/null 2>&1 || true
      echo "Application failed to start." >&2
      exit 1
      ;;
  esac
  sleep 1
done

docker logs taskboard >&2 || true
docker rm -f taskboard >/dev/null 2>&1 || true
echo "Application did not become healthy within 30 seconds." >&2
exit 1
