"""Celery application: async document ingestion + embedding off the request path.

Queues:
  - ingestion: parse/ocr/chunk/embed/index (CPU/GPU heavy, long-running)
  - default:   light maintenance tasks
Dead-lettering and retry policy are configured per-task in app.workers.tasks.
"""
from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery = Celery(
    "turkish_rag",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery.conf.update(
    task_acks_late=True,                 # redeliver if worker dies mid-task
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,        # fair dispatch for long tasks
    task_default_queue="default",
    task_routes={"app.workers.tasks.ingest_document": {"queue": "ingestion"}},
    task_track_started=True,
    result_expires=3600,
    broker_transport_options={"max_retries": 3},
)
