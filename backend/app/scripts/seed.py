"""Seed the permission catalog and system roles. Idempotent.

Run: python -m app.scripts.seed   (or `make seed`)
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.db import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.modules.auth.models import Permission, Role

PERMISSIONS = [
    "document:read", "document:write", "document:delete",
    "chat:use", "search:use",
    "admin:manage_users", "admin:manage_tenant", "admin:view_audit",
]

# System roles -> granted permission codes
ROLES = {
    "owner": PERMISSIONS,
    "admin": [p for p in PERMISSIONS if p != "admin:manage_tenant"],
    "member": ["document:read", "document:write", "chat:use", "search:use"],
    "viewer": ["document:read", "chat:use", "search:use"],
}

log = get_logger("seed")


async def seed() -> None:
    async with SessionFactory() as session:
        existing = {p.code for p in (await session.execute(select(Permission))).scalars()}
        perms: dict[str, Permission] = {}
        for code in PERMISSIONS:
            if code in existing:
                perms[code] = (
                    await session.execute(select(Permission).where(Permission.code == code))
                ).scalar_one()
            else:
                perms[code] = Permission(code=code)
                session.add(perms[code])
        await session.flush()

        for name, codes in ROLES.items():
            role = (
                await session.execute(
                    select(Role).where(Role.name == name, Role.tenant_id.is_(None))
                )
            ).scalar_one_or_none()
            if role is None:
                role = Role(name=name, tenant_id=None, description=f"System role: {name}")
                session.add(role)
            role.permissions = [perms[c] for c in codes]

        await session.commit()
        log.info("seed.done", permissions=len(PERMISSIONS), roles=list(ROLES))


if __name__ == "__main__":
    configure_logging()
    asyncio.run(seed())
