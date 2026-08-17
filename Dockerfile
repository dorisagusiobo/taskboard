FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/ .
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_CACHE_DIR=/tmp/uv-cache

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock* ./
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev --no-install-project

COPY backend/main.py ./main.py
COPY backend/database.py ./database.py
COPY backend/auth.py ./auth.py
COPY backend/ai_service.py ./ai_service.py
COPY backend/openrouter_client.py ./openrouter_client.py
COPY --from=frontend-builder /app/frontend/out ./static

EXPOSE 8000

HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=15 \
    CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1).read()"]

CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
