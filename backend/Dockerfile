# syntax=docker/dockerfile:1
# Multi-stage:
#   base -> shared system deps (tesseract, poppler) + uv
#   dev  -> base + dev extras (pytest, ruff, watchdog) — local compose targets this
#   prod -> base + runtime deps only, non-root, healthcheck — default build target
#
# Dependencies are installed with `uv sync --locked`, so uv.lock is the single
# source of truth: the image, CI and the security scan all see the same
# versions. Change deps via pyproject.toml + `uv lock`, never by editing here.
FROM python:3.11-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /usr/local/bin/uv

# Peers allowed to set X-Forwarded-For (uvicorn accepts CIDRs). Private ranges
# only -- the reverse proxy is always an in-network container. Override per
# deployment if the proxy sits elsewhere.
ENV FORWARDED_ALLOW_IPS="127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

# UV_PROJECT_ENVIRONMENT syncs into the system interpreter rather than a .venv,
# so uvicorn/pytest stay on PATH and CMD needs no venv prefix.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_PROJECT_ENVIRONMENT=/usr/local \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# System deps: tesseract (OCR fallback), poppler (pdf), libgl (paddle/opencv)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        tesseract-ocr tesseract-ocr-tur \
        poppler-utils \
        libgl1 libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Lock + manifest only: dependency layer stays cached while app source changes.
COPY pyproject.toml uv.lock ./

# ── Dev image: hot-reload tooling + test deps ────────────────────────────────
FROM base AS dev
RUN uv sync --locked --extra dev --no-install-project
COPY . .
RUN uv sync --locked --extra dev
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

# ── Production image: runtime deps only ──────────────────────────────────────
FROM base AS prod
RUN uv sync --locked --no-install-project
COPY . .
RUN uv sync --locked

# Non-root runtime
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/v1/health/live || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
