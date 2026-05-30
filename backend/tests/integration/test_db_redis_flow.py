"""Sample integration test to verify dual-mode database and cache operations."""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


@pytest.mark.asyncio
async def test_redis_client_operations(redis_client):
    # Test setting a value
    set_ok = await redis_client.set("test_key", "test_value", ex=60)
    assert set_ok is True

    # Test retrieving the value
    value = await redis_client.get("test_key")
    assert value == "test_value"

    # Test deleting the key
    del_count = await redis_client.delete("test_key")
    assert del_count == 1

    # Verify deletion
    deleted_val = await redis_client.get("test_key")
    assert deleted_val is None


@pytest.mark.asyncio
async def test_db_session_ping(db_session: AsyncSession, docker_available: bool):
    if not docker_available:
        # In mock mode, check that AsyncMock resolves correctly
        assert db_session.commit is not None
        # Mock execute returning a mock result
        db_session.execute.return_value.fetchall.return_value = [(1,)]
        res = await db_session.execute(text("SELECT 1"))
        assert res.fetchall() == [(1,)]
    else:
        # In Docker mode, execute a real SQL select
        res = await db_session.execute(text("SELECT 1"))
        val = res.scalar()
        assert val == 1
