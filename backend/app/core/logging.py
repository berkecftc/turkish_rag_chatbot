"""Structured logging. JSON in prod, pretty console in dev. Auto-injects the
request context (request_id, tenant_id, user_id) into every log line."""
from __future__ import annotations

import logging

import structlog

from app.core import context
from app.core.config import get_settings


def _inject_context(_: object, __: str, event_dict: dict) -> dict:
    ctx = context.current()
    event_dict.setdefault("request_id", ctx.request_id)
    if ctx.tenant_id:
        event_dict.setdefault("tenant_id", str(ctx.tenant_id))
    if ctx.user_id:
        event_dict.setdefault("user_id", str(ctx.user_id))
    return event_dict


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _inject_context,
        structlog.processors.StackInfoRenderer(),
    ]
    renderer = (
        structlog.processors.JSONRenderer()
        if settings.is_production
        else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
