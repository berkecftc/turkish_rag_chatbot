"""Auth HTTP interface. Thin: validates input, delegates to AuthService."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.modules.auth.repository import RefreshTokenRepository, UserRepository
from app.modules.auth.schemas import LoginRequest, RefreshRequest, TokenPair
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _service(session: AsyncSession) -> AuthService:
    return AuthService(UserRepository(session), RefreshTokenRepository(session))


@router.post("/login", response_model=TokenPair)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)) -> TokenPair:
    return await _service(session).authenticate(body.email, body.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_db)) -> TokenPair:
    return await _service(session).refresh(body.refresh_token)
