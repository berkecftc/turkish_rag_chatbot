# syntax=docker/dockerfile:1
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install ".[dev]"

COPY . .

# Non-root runtime
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
