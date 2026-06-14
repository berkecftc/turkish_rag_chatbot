"""Create a tenant + user + membership so the frontend has a real login.

Idempotent. Reuses the system `owner` role (tenant_id IS NULL) seeded by
`app.scripts.seed`, so the user gets every permission. Safe to re-run.

Run inside the api container:
    python -m app.scripts.create_user

Override via env: SEED_EMAIL, SEED_PASSWORD, SEED_FULL_NAME, SEED_TENANT_NAME.
"""
from __future__ import annotations

import asyncio
import os

from sqlalchemy import select

from app.core import security
from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.modules.auth.models import Membership, Role, User
from app.modules.tenancy.models import Tenant

log = get_logger("create_user")

EMAIL = os.getenv("SEED_EMAIL", "admin@demo.com")
PASSWORD = os.getenv("SEED_PASSWORD", "Admin12345!")
FULL_NAME = os.getenv("SEED_FULL_NAME", "Demo Admin")
TENANT_NAME = os.getenv("SEED_TENANT_NAME", "Demo Workspace")
TENANT_SLUG = os.getenv("SEED_TENANT_SLUG", "demo")
ROLE_NAME = os.getenv("SEED_ROLE", "owner")


async def create_user() -> None:
    async with SessionFactory() as session:
        role = (
            await session.execute(
                select(Role).where(Role.name == ROLE_NAME, Role.tenant_id.is_(None))
            )
        ).scalar_one_or_none()
        if role is None:
            raise SystemExit(
                f"System role {ROLE_NAME!r} not found — run `python -m app.scripts.seed` first."
            )

        # Tenant (by slug).
        tenant = (
            await session.execute(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        ).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name=TENANT_NAME, slug=TENANT_SLUG)
            session.add(tenant)
            await session.flush()
            log.info("tenant.created", id=str(tenant.id), slug=tenant.slug)
        else:
            log.info("tenant.exists", id=str(tenant.id), slug=tenant.slug)

        # User (by email).
        user = (
            await session.execute(select(User).where(User.email == EMAIL))
        ).scalar_one_or_none()
        if user is None:
            user = User(
                email=EMAIL,
                password_hash=security.hash_password(PASSWORD),
                full_name=FULL_NAME,
                is_active=True,
                is_superuser=True,
            )
            session.add(user)
            await session.flush()
            log.info("user.created", id=str(user.id), email=user.email)
        else:
            # Reset password so the documented credentials always work.
            user.password_hash = security.hash_password(PASSWORD)
            user.is_active = True
            log.info("user.exists.password_reset", id=str(user.id), email=user.email)

        # Membership (tenant + user unique).
        membership = (
            await session.execute(
                select(Membership).where(
                    Membership.tenant_id == tenant.id, Membership.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if membership is None:
            membership = Membership(tenant_id=tenant.id, user_id=user.id, role_id=role.id)
            session.add(membership)
            log.info("membership.created", tenant=str(tenant.id), role=ROLE_NAME)
        else:
            membership.role_id = role.id
            log.info("membership.exists", tenant=str(tenant.id), role=ROLE_NAME)

        await session.commit()
        log.info(
            "create_user.done",
            email=EMAIL,
            password=PASSWORD,
            tenant=tenant.slug,
            role=ROLE_NAME,
        )
        print(f"\n  OK  login -> email={EMAIL}  password={PASSWORD}  (tenant={tenant.slug}, role={ROLE_NAME})\n")


if __name__ == "__main__":
    configure_logging()
    asyncio.run(create_user())
