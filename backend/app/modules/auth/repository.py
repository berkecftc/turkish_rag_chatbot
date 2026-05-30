"""Auth persistence."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.infrastructure.repository import BaseRepository
from app.modules.auth.models import Membership, RefreshToken, User


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def membership_for(self, user_id: uuid.UUID) -> Membership | None:
        stmt = (
            select(Membership)
            .where(Membership.user_id == user_id)
            .options(selectinload(Membership.role))
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    async def get_by_jti(self, jti: uuid.UUID) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.jti == jti)
        return (await self.session.execute(stmt)).scalar_one_or_none()
