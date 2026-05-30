"""Turkish text normalization stage.

Handles:
- Unicode NFC normalization
- Whitespace collapsing
- Turkish-specific ligature fixes (fi/fl often OCR'd incorrectly)
- Soft-hyphen removal
- Control character stripping
"""
from __future__ import annotations

import re
import unicodedata

from app.core.logging import get_logger
from app.workers.pipeline import IngestionContext

log = get_logger("normalizer")

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SOFT_HYPHEN = re.compile(r"\xad+")
_MULTI_WS = re.compile(r"[ \t]+")
_MULTI_NL = re.compile(r"\n{3,}")
# Common OCR ligature errors affecting Turkish text
_LIGATURES = str.maketrans({"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"})


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.translate(_LIGATURES)
    text = _SOFT_HYPHEN.sub("", text)
    text = _CTRL.sub("", text)
    text = _MULTI_WS.sub(" ", text)
    text = _MULTI_NL.sub("\n\n", text)
    return text.strip()


class TurkishNormalizerStage:
    name = "normalize"

    async def run(self, ctx: IngestionContext) -> IngestionContext:
        for block in ctx.blocks:
            block.text = normalize(block.text)
        # Drop empty blocks produced after normalization
        ctx.blocks = [b for b in ctx.blocks if b.text]
        log.debug("normalize.done", document_id=ctx.document_id, blocks=len(ctx.blocks))
        return ctx
