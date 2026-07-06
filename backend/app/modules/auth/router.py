"""Auth HTTP interface. Thin: validates input, delegates to AuthService."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.core.exceptions import NotFoundError
from app.modules.auth.repository import RefreshTokenRepository, UserRepository
from app.modules.auth.schemas import LoginRequest, MeOut, RefreshRequest, TokenPair
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


@router.get("/me", response_model=MeOut)
async def me(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_db),
) -> MeOut:
    from app.modules.tenancy.models import Tenant

    users = UserRepository(session)
    user = await users.get(principal.user_id)
    if user is None:
        raise NotFoundError("User not found")
    membership = await users.membership_in_tenant(principal.user_id, principal.tenant_id)
    tenant = await session.get(Tenant, principal.tenant_id)
    return MeOut(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role.name if membership else "unknown",
        tenant_id=principal.tenant_id,
        tenant_name=tenant.name if tenant else "",
        tenant_slug=tenant.slug if tenant else "",
    )
