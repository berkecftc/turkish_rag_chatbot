# syntax=docker/dockerfile:1
# Multi-stage:
#   base -> shared system deps (tesseract, poppler)
#   dev  -> base + dev extras (pytest, ruff, watchdog) — local compose targets this
#   prod -> base + runtime deps only, non-root, healthcheck — default build target
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: tesseract (OCR fallback), poppler (pdf), libgl (paddle/opencv)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        tesseract-ocr tesseract-ocr-tur \
        poppler-utils \
        libgl1 libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching
COPY pyproject.toml ./

# ── Dev image: hot-reload tooling + test deps ────────────────────────────────
FROM base AS dev
RUN pip install --upgrade pip && pip install ".[dev]"
COPY . .
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Production image: runtime deps only ──────────────────────────────────────
FROM base AS prod
RUN pip install --upgrade pip && pip install .
COPY . .

# Non-root runtime
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/v1/health/live || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
