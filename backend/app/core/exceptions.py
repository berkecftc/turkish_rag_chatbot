"""Domain exceptions + FastAPI handlers that emit RFC 9457 problem+json.

Domain/application code raises these framework-free errors; the interface layer
maps them to HTTP. Inner layers never import FastAPI.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core import context


class AppError(Exception):
    """Base application error. status/code/detail map cleanly to HTTP."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.__class__.__name__
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class AuthenticationError(AppError):
    status_code = 401
    code = "unauthorized"


class AuthorizationError(AppError):
    status_code = 403
    code = "forbidden"


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"


class PromptInjectionError(AppError):
    status_code = 400
    code = "prompt_injection_detected"


def _problem(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "type": f"about:blank#{code}",
            "title": code,
            "status": status,
            "detail": detail,
            "request_id": context.current().request_id,
        },
        media_type="application/problem+json",
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _problem(exc.status_code, exc.code, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _problem(422, "validation_error", str(exc.errors()))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        # Never leak internals; full trace goes to structured logs upstream.
        return _problem(500, "internal_error", "An unexpected error occurred.")
