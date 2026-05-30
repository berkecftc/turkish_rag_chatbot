"""S3/MinIO object storage adapter implementing the ObjectStorage port.

boto3 is synchronous; calls run in a worker thread so the async contract holds.
Uploads stream from a file object (memory-efficient for large files).
"""
from __future__ import annotations

import asyncio
from typing import BinaryIO

import boto3
from botocore.client import Config

from app.core.config import Settings
from app.core.logging import get_logger

log = get_logger("storage")


class MinioStorage:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.storage_bucket
        self._presign_expiry = settings.storage_presign_expiry_seconds
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint,
            aws_access_key_id=settings.storage_access_key,
            aws_secret_access_key=settings.storage_secret_key,
            config=Config(signature_version="s3v4"),
        )

    def ensure_bucket(self) -> None:
        """Create the bucket if missing. Call once at startup (sync)."""
        existing = {b["Name"] for b in self._client.list_buckets().get("Buckets", [])}
        if self._bucket not in existing:
            self._client.create_bucket(Bucket=self._bucket)
            log.info("storage.bucket_created", bucket=self._bucket)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    async def put_stream(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.upload_fileobj,
            fileobj,
            self._bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )

    async def get(self, key: str) -> bytes:
        resp = await asyncio.to_thread(self._client.get_object, Bucket=self._bucket, Key=key)
        return await asyncio.to_thread(resp["Body"].read)

    async def presigned_put(self, key: str, expires: int | None = None) -> str:
        return await asyncio.to_thread(
            self._client.generate_presigned_url,
            "put_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires or self._presign_expiry,
        )
