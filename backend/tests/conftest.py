"""Root Pytest configuration and shared fixtures.

Sets required environment variables BEFORE any app module is imported
(pydantic-settings reads from the environment at first Settings() call,
which is cached via lru_cache).

Provides shared fixtures for unit, integration, and E2E tests with 
dual-mode execution (using testcontainers when Docker is active, 
falling back to mocks otherwise).
"""
import os

# ── Required env vars ─────────────────────────────────────────────────────────
# Must be set before any `from app.*` import triggers get_settings()
_TEST_ENV = {
    "DATABASE_URL": "postgresql+asyncpg://test:test@localhost/testdb",
    "CELERY_BROKER_URL": "redis://localhost:6379/1",
    "CELERY_RESULT_BACKEND": "redis://localhost:6379/2",
    "STORAGE_ENDPOINT": "http://localhost:9000",
    "STORAGE_ACCESS_KEY": "minioadmin",
    "STORAGE_SECRET_KEY": "minioadmin",
    "GEMINI_API_KEY": "test-key",
    "JWT_PRIVATE_KEY": "test-private-key",
    "JWT_PUBLIC_KEY": "test-public-key",
}

for _k, _v in _TEST_ENV.items():
    os.environ.setdefault(_k, _v)


# ── Shared Fixtures & Setup ───────────────────────────────────────────────────

import asyncio
import uuid
from typing import AsyncIterator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.db import Base
from app.infrastructure.ingestion.storage.minio_storage import MinioStorage

# Explicitly import models to register with Base.metadata
import app.modules.tenancy.models
import app.modules.auth.models
import app.modules.documents.models
import app.modules.ingestion.models
import app.modules.rag.models


# ── Docker Detection ──────────────────────────────────────────────────────────

def is_docker_available() -> bool:
    """Check if Docker daemon is accessible."""
    try:
        import docker
        client = docker.from_env(timeout=1)
        client.ping()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def docker_available() -> bool:
    return is_docker_available()


@pytest.fixture(scope="session")
def test_settings(docker_available: bool) -> Settings:
    settings = get_settings()
    if docker_available:
        # Dynamic port mapping by testcontainers will be handled
        pass
    else:
        settings.database_url = "postgresql+asyncpg://test:test@localhost/testdb"
        settings.redis_url = "redis://localhost:6379/1"
    return settings


# ── Database Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def pg_container(docker_available: bool) -> Generator[str | None, None, None]:
    if not docker_available:
        yield None
        return

    from testcontainers.postgres import PostgresContainer
    with PostgresContainer("ankane/pgvector:latest") as postgres:
        db_url = postgres.get_connection_url(driver="asyncpg")
        yield db_url


@pytest_asyncio.fixture(scope="function")
async def db_session(
    docker_available: bool, pg_container: str | None
) -> AsyncIterator[AsyncSession]:
    if not docker_available:
        # Fallback: Yield an AsyncMock session for DB isolation without Docker
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.execute = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = MagicMock()
        mock_session.flush = AsyncMock()
        mock_session.get = AsyncMock(return_value=None)
        yield mock_session
        return

    # Real DB Container Flow
    engine = create_async_engine(pg_container, echo=False)
    # Create tables
    async with engine.begin() as conn:
        # Enable pgvector extension
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    import sys
    import app.core.db

    old_db_factory = app.core.db.SessionFactory
    old_engine = app.core.db.engine

    # Override on app.core.db first
    app.core.db.SessionFactory = session_factory
    app.core.db.engine = engine

    # Dynamically find and override in all imported modules to catch any "from app.core.db import SessionFactory"
    overridden_factories = []
    overridden_engines = []

    for name, module in list(sys.modules.items()):
        if name.startswith("app.") or "test" in name or name == "app" or name == "tasks" or name.startswith("app"):
            try:
                if hasattr(module, "SessionFactory") and getattr(module, "SessionFactory") is old_db_factory:
                    setattr(module, "SessionFactory", session_factory)
                    overridden_factories.append((module, old_db_factory))
                if hasattr(module, "engine") and getattr(module, "engine") is old_engine:
                    setattr(module, "engine", engine)
                    overridden_engines.append((module, old_engine))
            except Exception:
                pass

    try:
        async with session_factory() as session:
            yield session
    finally:
        # Restore original factories and engines
        app.core.db.SessionFactory = old_db_factory
        app.core.db.engine = old_engine
        for module, original in overridden_factories:
            try:
                setattr(module, "SessionFactory", original)
            except Exception:
                pass
        for module, original in overridden_engines:
            try:
                setattr(module, "engine", original)
            except Exception:
                pass
            
        await engine.dispose()


# ── Cache / Redis Fixtures ────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def redis_container(docker_available: bool) -> Generator[str | None, None, None]:
    if not docker_available:
        yield None
        return

    from testcontainers.redis import RedisContainer
    with RedisContainer("redis:7-alpine") as redis:
        host = redis.get_container_host_ip()
        port = redis.get_exposed_port(redis.port)
        yield f"redis://{host}:{port}/0"


@pytest_asyncio.fixture(scope="function")
async def redis_client(docker_available: bool, redis_container: str | None):
    if not docker_available:
        # Fallback Mock Redis
        mock_redis = AsyncMock()
        store = {}

        async def _get(key):
            return store.get(key)

        async def _set(key, val, ex=None):
            store[key] = val
            return True

        async def _delete(key):
            if key in store:
                del store[key]
                return 1
            return 0

        async def _flushall():
            store.clear()
            return True

        mock_redis.get = AsyncMock(side_effect=_get)
        mock_redis.set = AsyncMock(side_effect=_set)
        mock_redis.delete = AsyncMock(side_effect=_delete)
        mock_redis.flushall = AsyncMock(side_effect=_flushall)
        yield mock_redis
        return

    from redis.asyncio import from_url
    client = from_url(redis_container, decode_responses=True)
    try:
        yield client
    finally:
        await client.flushall()
        await client.aclose()


# ── Storage / MinIO Fixtures ──────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def object_storage(docker_available: bool, test_settings: Settings):
    if not docker_available:
        # Fallback Mock Storage
        mock_storage = AsyncMock(spec=MinioStorage)
        store: dict[str, bytes] = {}

        async def _put(key, data, content_type):
            store[key] = data

        async def _get(key):
            if key not in store:
                raise KeyError(f"File not found: {key}")
            return store[key]

        mock_storage.put = AsyncMock(side_effect=_put)
        mock_storage.get = AsyncMock(side_effect=_get)
        mock_storage.ensure_bucket = MagicMock()
        mock_storage.presigned_put = AsyncMock(return_value="http://mock-presigned-url.com")
        yield mock_storage
        return

    # Real Storage Container Flow (requires dockerized S3/MinIO)
    from testcontainers.core.container import DockerContainer
    with DockerContainer("minio/minio").with_exposed_ports(9000).with_command("server /data") as minio:
        host = minio.get_container_host_ip()
        port = minio.get_exposed_port(9000)
        test_settings.storage_endpoint = f"http://{host}:{port}"
        storage = MinioStorage(test_settings)
        storage.ensure_bucket()
        yield storage


# ── AI Models Mocking ─────────────────────────────────────────────────────────

@pytest.fixture()
def mock_gemini_llm() -> MagicMock:
    llm = MagicMock()
    llm.generate = AsyncMock(return_value="Mocked LLM Response from Gemini")
    
    async def stream_mock(*args, **kwargs):
        for word in ["Mocked", " response", " stream", " from", " Gemini."]:
            yield word
            await asyncio.sleep(0.01)

    llm.stream = stream_mock
    return llm


@pytest.fixture()
def mock_embedder() -> MagicMock:
    embedder = MagicMock()
    dummy_vector = [0.1] * 1024
    from app.domain.ports import Embedding
    embedder.embed_query = AsyncMock(return_value=Embedding(dense=dummy_vector))
    embedder.embed_documents = AsyncMock(
        return_value=[Embedding(dense=dummy_vector)]
    )
    return embedder
