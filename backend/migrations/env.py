"""Alembic async env. Pulls the URL from app settings and the metadata from the
declarative Base so `--autogenerate` sees every model."""
from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from app.core.config import get_settings
from app.core.db import Base

# Import model modules so they register on Base.metadata for autogenerate.
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.documents import models as _doc_models  # noqa: F401
from app.modules.ingestion import models as _ing_models  # noqa: F401
from app.modules.rag import models as _rag_models  # noqa: F401
from app.modules.tenancy import models as _ten_models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def _run_sync(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync)
    await engine.dispose()


def run_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_async())
