"""Secure upload validation. No external libmagic dependency — MIME is verified
from file magic bytes (signatures) and cross-checked against the extension.
"""
from __future__ import annotations

import re
import unicodedata
import zipfile
from dataclasses import dataclass
from typing import BinaryIO, Protocol, runtime_checkable

from app.core.config import Settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.modules.documents.models import DocumentSource

log = get_logger("validation")

# extension -> (allowed MIME types, source type, accepted magic-byte prefixes)
_PDF_SIG = (b"%PDF-",)
_ZIP_SIG = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")  # zip (docx/xlsx are zips)
_PNG_SIG = (b"\x89PNG\r\n\x1a\n",)
_JPG_SIG = (b"\xff\xd8\xff",)

_SPEC: dict[str, tuple[tuple[str, ...], DocumentSource, tuple[bytes, ...]]] = {
    ".pdf": (("application/pdf",), DocumentSource.PDF, _PDF_SIG),
    ".docx": (
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",),
        DocumentSource.DOCX,
        _ZIP_SIG,
    ),
    ".xlsx": (
        ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",),
        DocumentSource.XLSX,
        _ZIP_SIG,
    ),
    ".csv": (("text/csv", "application/csv", "text/plain"), DocumentSource.CSV, ()),
    ".png": (("image/png",), DocumentSource.IMAGE, _PNG_SIG),
    ".jpg": (("image/jpeg",), DocumentSource.IMAGE, _JPG_SIG),
    ".jpeg": (("image/jpeg",), DocumentSource.IMAGE, _JPG_SIG),
}

# OOXML internal markers to disambiguate docx vs xlsx (both are zips).
_OOXML_MARKER = {".docx": "word/", ".xlsx": "xl/"}

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9 ._\-()]+")


@runtime_checkable
class MalwareScanner(Protocol):
    async def scan(self, fileobj: BinaryIO) -> bool:
        """Return True if clean. Implementations must reset the stream."""
        ...


class NoopMalwareScanner:
    """Default no-op scanner. Swap for a ClamAV adapter in production."""

    async def scan(self, fileobj: BinaryIO) -> bool:  # noqa: D401
        return True


@dataclass(slots=True)
class ValidationResult:
    safe_filename: str
    mime_type: str
    source_type: DocumentSource
    extension: str


class ValidationService:
    def __init__(self, settings: Settings, scanner: MalwareScanner) -> None:
        self._settings = settings
        self._scanner = scanner
        self._max_bytes = settings.max_upload_mb * 1024 * 1024
        self._max_uncompressed = settings.max_archive_uncompressed_mb * 1024 * 1024

    async def validate(
        self, *, filename: str, fileobj: BinaryIO, size_bytes: int
    ) -> ValidationResult:
        safe_name = self._sanitize_filename(filename)
        ext = self._extension(safe_name)

        if ext not in _SPEC:
            raise ValidationError(f"Unsupported file type: {ext or '(none)'}")
        if size_bytes <= 0:
            raise ValidationError("Empty file")
        if size_bytes > self._max_bytes:
            raise ValidationError(f"File exceeds {self._settings.max_upload_mb} MB limit")

        allowed_mimes, source_type, signatures = _SPEC[ext]

        # Magic-byte check (defeats renamed extensions).
        head = self._read_head(fileobj, 16)
        if signatures and not any(head.startswith(sig) for sig in signatures):
            raise ValidationError(f"File content does not match extension {ext}")

        # Disambiguate + bomb-guard zip-based office formats.
        if ext in _OOXML_MARKER:
            self._validate_ooxml(fileobj, ext)
        elif ext == ".csv":
            self._validate_text(fileobj)

        if not await self._scanner.scan(fileobj):
            raise ValidationError("File failed malware scan")
        fileobj.seek(0)

        return ValidationResult(
            safe_filename=safe_name,
            mime_type=allowed_mimes[0],
            source_type=source_type,
            extension=ext,
        )

    # ── internals ────────────────────────────────────────────────────────
    @staticmethod
    def _read_head(fileobj: BinaryIO, n: int) -> bytes:
        fileobj.seek(0)
        head = fileobj.read(n)
        fileobj.seek(0)
        return head

    @staticmethod
    def _extension(name: str) -> str:
        _, _, ext = name.rpartition(".")
        return f".{ext.lower()}" if ext and ext != name else ""

    def _sanitize_filename(self, filename: str) -> str:
        # Never trust client path. Take the basename, drop traversal + control chars.
        base = filename.replace("\\", "/").split("/")[-1]
        base = base.replace("\x00", "")
        base = unicodedata.normalize("NFC", base)
        base = _FILENAME_SAFE.sub("_", base).strip(". ")
        if not base or base in {".", ".."}:
            raise ValidationError("Invalid filename")
        return base[:255]

    def _validate_ooxml(self, fileobj: BinaryIO, ext: str) -> None:
        fileobj.seek(0)
        try:
            with zipfile.ZipFile(fileobj) as zf:
                names = zf.namelist()
                if len(names) > 5000:
                    raise ValidationError("Archive has too many entries")
                total = sum(info.file_size for info in zf.infolist())
                if total > self._max_uncompressed:
                    raise ValidationError("Archive decompresses beyond allowed size")
                marker = _OOXML_MARKER[ext]
                if not any(n.startswith(marker) for n in names):
                    raise ValidationError(f"File is not a valid {ext} document")
        except zipfile.BadZipFile as exc:
            raise ValidationError("Corrupt or invalid office document") from exc
        finally:
            fileobj.seek(0)

    def _validate_text(self, fileobj: BinaryIO) -> None:
        fileobj.seek(0)
        sample = fileobj.read(8192)
        fileobj.seek(0)
        if b"\x00" in sample:
            raise ValidationError("CSV appears to be binary")
        for codec in ("utf-8-sig", "latin-1"):
            try:
                sample.decode(codec)
                return
            except UnicodeDecodeError:
                continue
        raise ValidationError("CSV is not valid text")
