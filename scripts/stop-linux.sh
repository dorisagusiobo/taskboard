#!/usr/bin/env bash
set -euo pipefail

docker rm -f project-management-mvp >/dev/null 2>&1 || true

echo "Stopped project-management-mvp"
