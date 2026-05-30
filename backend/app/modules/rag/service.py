"""RAG pipeline orchestration service.

Full turn pipeline:
  1. Security guard — block injection attacks
  2. Query processing — normalize, intent, language
  3. Query rewriting — LLM expansion + sub-questions
  4. Semantic cache lookup — skip pipeline on hit
  5. Conversation memory — fetch history
  6. Hybrid retrieval — vector + BM25 + RRF fusion
  7. Source reliability scoring — annotate chunks
  8. Reranking — BGE cross-encoder
  9. Context packing — token-aware assembly + dedup
 10. Context compression — LLM compression if needed
 11. Citation assembly — build citation references
 12. LLM generation — Gemini with hardened prompt
 13. Hallucination validation — claim-context alignment
 14. Confidence scoring — multi-factor composite
 15. Persistence — Message, Citations, RetrievalLog
 16. Cache store — save result for future queries

Streaming variant streams tokens from step 12 while steps 13-16 run post-stream.
"""
from __future__ import annotations

import uuid
import math
from datetime import datetime, timezone
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.infrastructure.ai.embedder import BgeM3Embedder
from app.infrastructure.ai.llm import GeminiLLM
from app.infrastructure.rag.cache.semantic_cache import SemanticCacheLayer
from app.infrastructure.rag.citation.assembler import CitationAssembler
from app.infrastructure.rag.confidence.scorer import ConfidenceScorer
from app.infrastructure.rag.context.compressor import ContextCompressor
from app.infrastructure.rag.context.packer import ContextPacker
from app.infrastructure.rag.generation.orchestrator import GeminiOrchestrator
from app.infrastructure.rag.generation.validator import HallucinationValidator
from app.infrastructure.rag.memory.store import ConversationMemoryStore, MemoryMessage
from app.infrastructure.rag.observability.tracker import RetrievalTracker, TurnMetrics
from app.infrastructure.rag.query.processor import TurkishQueryProcessor
from app.infrastructure.rag.query.rewriter import QueryRewriter
from app.infrastructure.rag.reranking.bge_reranker import BgeRerankerEngine
from app.infrastructure.rag.reliability.source_scorer import SourceReliabilityScorer
from app.infrastructure.rag.retrieval.bm25_search import BM25SearchEngine
from app.infrastructure.rag.retrieval.hybrid import HybridRetriever
from app.infrastructure.rag.retrieval.vector_search import VectorSearchEngine
from app.infrastructure.rag.security.guard import PromptSecurityGuard
from app.modules.rag.models import Citation, Conversation, Message, MessageRole, RetrievalLog
from app.modules.rag.repository import (
    CitationRepository,
    ConversationRepository,
    MessageRepository,
    RetrievalLogRepository,
    SemanticCacheRepository,
)
from app.modules.rag.schemas import (
    ChatRequest,
    ChatResponse,
    CitationOut,
    DebugResponse,
    MetadataFilter,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    StreamDelta,
    StreamDone,
)

log = get_logger("rag.service")


def _safe_float(val: float | None) -> float | None:
    """Ensure float is JSON/Postgres compatible (not NaN/Inf)."""
    if val is None:
        return None
    try:
        if math.isnan(val) or math.isinf(val):
            return None
    except TypeError:
        pass
    return val


class RagService:
    """Full RAG pipeline orchestrator."""

    def __init__(self, session: AsyncSession, redis_client) -> None:
        self._session = session
        self._redis = redis_client
        cfg = get_settings()

        # AI adapters
        self._embedder = BgeM3Embedder()
        self._llm = GeminiLLM()

        # Pipeline stages
        self._security = PromptSecurityGuard()
        self._processor = TurkishQueryProcessor()
        self._rewriter = QueryRewriter(GeminiLLM(temperature=0.0))
        self._retriever = HybridRetriever(
            VectorSearchEngine(session),
            BM25SearchEngine(session),
        )
        self._reranker = BgeRerankerEngine()
        self._packer = ContextPacker()
        self._compressor = ContextCompressor(GeminiLLM(temperature=0.0, max_tokens=4096))
        self._citation_assembler = CitationAssembler()
        self._orchestrator = GeminiOrchestrator(self._llm)
        self._validator = HallucinationValidator(self._embedder)
        self._memory = ConversationMemoryStore(redis_client, GeminiLLM(temperature=0.0))
        self._cache = SemanticCacheLayer(session)
        self._confidence_scorer = ConfidenceScorer()
        self._source_scorer = SourceReliabilityScorer()
        self._tracker = RetrievalTracker()

        # Repositories
        self._conv_repo: ConversationRepository | None = None
        self._msg_repo: MessageRepository | None = None
        self._cit_repo: CitationRepository | None = None
        self._log_repo: RetrievalLogRepository | None = None

    def _init_repos(self, tenant_id: uuid.UUID) -> None:
        self._conv_repo = ConversationRepository(self._session, tenant_id)
        self._msg_repo = MessageRepository(self._session, tenant_id)
        self._cit_repo = CitationRepository(self._session, tenant_id)
        self._log_repo = RetrievalLogRepository(self._session, tenant_id)

    # ── Public API ────────────────────────────────────────────────────────────

    async def chat(
        self,
        request: ChatRequest,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> ChatResponse:
        self._init_repos(tenant_id)
        self._tracker.start(tenant_id, request.query)

        # 1. Security
        safe_query = self._security.check_query(request.query)

        # 2. Get or create conversation
        conv = await self._get_or_create_conversation(
            request.conversation_id, tenant_id, user_id
        )

        # 3. Query processing + rewriting
        processed = self._processor.process(safe_query)
        history = await self._memory.get_formatted(conv.id)
        rewrite = await self._rewriter.rewrite(processed, history)

        self._tracker.metrics.rewritten_query = rewrite.rewritten
        self._tracker.metrics.query_intent = processed.intent

        # 4. Embed query
        query_emb = await self._embedder.embed_query(rewrite.rewritten)
        sub_embs = []
        if rewrite.sub_questions:
            sub_emb_results = await self._embedder.embed_documents(rewrite.sub_questions)
            sub_embs = [e.dense for e in sub_emb_results]

        # 5. Cache lookup
        cached = await self._cache.lookup(
            tenant_id=tenant_id,
            query=rewrite.rewritten,
            query_embedding=query_emb.dense,
        )
        if cached:
            self._tracker.metrics.cache_hit = True
            self._tracker.finish()
            return ChatResponse(**cached, cached=True)

        # 6. Hybrid retrieval
        async with self._tracker.measure("retrieval"):
            fused, vw, bw = await self._retriever.retrieve(
                tenant_id=tenant_id,
                query_text=rewrite.rewritten,
                query_embedding=query_emb.dense,
                intent=processed.intent,
                is_turkish=processed.is_turkish,
                filters=request.filters,
                sub_questions=rewrite.sub_questions or None,
                sub_embeddings=sub_embs or None,
            )

        self._tracker.metrics.vector_results = sum(1 for r in fused if r.vector_score is not None)
        self._tracker.metrics.bm25_results = sum(1 for r in fused if r.bm25_score is not None)
        self._tracker.metrics.vector_weight = vw
        self._tracker.metrics.bm25_weight = bw

        # 7. Security: sanitize retrieved chunks
        fused = self._security.sanitize_chunks(fused)

        # 8. Source reliability scoring
        await self._annotate_reliability(fused, tenant_id)

        # 9. Reranking
        async with self._tracker.measure("rerank"):
            reranked = await self._reranker.rerank(rewrite.rewritten, fused)

        self._tracker.metrics.reranked_results = len(reranked)
        self._tracker.metrics.debug_payload = {"chunks": reranked}

        # 10. Context packing + compression
        ctx = self._packer.pack(reranked)
        ctx = await self._compressor.compress(ctx, rewrite.rewritten)

        self._tracker.metrics.context_chunks = len(ctx.chunks)
        self._tracker.metrics.context_tokens = ctx.token_count
        self._tracker.metrics.was_compressed = ctx.was_truncated

        # 11. Build citations
        citations = self._citation_assembler.build_from_context(ctx)

        # 12. Generation
        async with self._tracker.measure("generation"):
            response_text = await self._orchestrator.generate(
                ctx=ctx,
                user_query=safe_query,
                conversation_history=history,
            )

        # 13. Filter used citations
        used_citations = self._citation_assembler.filter_used(citations, response_text)

        # 14. Hallucination validation
        validation = await self._validator.validate(response_text, reranked)

        # 15. Confidence scoring
        confidence = self._confidence_scorer.score(
            reranked_chunks=reranked,
            all_chunks=fused,
            validation=validation,
            citation_count=len(used_citations),
            context_chunk_count=len(ctx.chunks),
        )
        self._tracker.metrics.confidence = confidence
        self._tracker.metrics.hallucination_flags = validation.hallucination_flags

        # 16. Persist
        self._tracker.finish()
        msg_id = await self._persist(
            conv=conv,
            user_query=safe_query,
            response=response_text,
            citations=used_citations,
            confidence=confidence,
            validation=validation,
            metrics=self._tracker.metrics,
        )

        # 17. Update memory
        await self._memory.append(conv.id, MemoryMessage("user", safe_query))
        await self._memory.append(conv.id, MemoryMessage("assistant", response_text, str(msg_id)))

        citation_outs = [
            CitationOut(
                id=uuid.uuid4(),
                citation_number=c.citation_number,
                document_id=c.document_id,
                document_title=c.document_title,
                text_excerpt=c.text_excerpt,
                page_number=c.page_number,
                section=c.section,
                vector_score=c.vector_score,
                rerank_score=c.rerank_score,
                combined_score=c.combined_score,
                source_reliability=c.source_reliability,
            )
            for c in used_citations
        ]

        response = ChatResponse(
            conversation_id=conv.id,
            message_id=msg_id,
            content=response_text,
            citations=citation_outs,
            confidence_score=confidence,
            retrieval_quality=reranked[0].rerank_score if reranked else None,
            hallucination_flags=validation.hallucination_flags,
            tokens_used=self._tracker.metrics.context_tokens,
            latency_ms=self._tracker.metrics.total_ms,
            model=get_settings().gemini_model,
            cached=False,
        )

        # 18. Cache the response
        await self._cache.store(
            tenant_id=tenant_id,
            query=rewrite.rewritten,
            query_embedding=query_emb.dense,
            response=response.model_dump(mode="json"),
        )

        return response

    async def stream_chat(
        self,
        request: ChatRequest,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> AsyncIterator[dict]:
        """Yields SSE-compatible dicts: delta, citation, done."""
        self._init_repos(tenant_id)
        self._tracker.start(tenant_id, request.query)

        safe_query = self._security.check_query(request.query)
        conv = await self._get_or_create_conversation(request.conversation_id, tenant_id, user_id)
        processed = self._processor.process(safe_query)
        history = await self._memory.get_formatted(conv.id)
        rewrite = await self._rewriter.rewrite(processed, history)

        self._tracker.metrics.query_intent = processed.intent
        query_emb = await self._embedder.embed_query(rewrite.rewritten)
        sub_embs = []
        if rewrite.sub_questions:
            sub_emb_results = await self._embedder.embed_documents(rewrite.sub_questions)
            sub_embs = [e.dense for e in sub_emb_results]

        # Cache check
        cached = await self._cache.lookup(
            tenant_id=tenant_id, query=rewrite.rewritten, query_embedding=query_emb.dense
        )
        if cached:
            yield {"type": "delta", "content": cached.get("content", "")}
            yield {"type": "done", **{k: v for k, v in cached.items() if k != "content"}, "cached": True}
            return

        async with self._tracker.measure("retrieval"):
            fused, vw, bw = await self._retriever.retrieve(
                tenant_id=tenant_id,
                query_text=rewrite.rewritten,
                query_embedding=query_emb.dense,
                intent=processed.intent,
                is_turkish=processed.is_turkish,
                filters=request.filters,
                sub_questions=rewrite.sub_questions or None,
                sub_embeddings=sub_embs or None,
            )

        fused = self._security.sanitize_chunks(fused)
        await self._annotate_reliability(fused, tenant_id)

        async with self._tracker.measure("rerank"):
            reranked = await self._reranker.rerank(rewrite.rewritten, fused)

        self._tracker.metrics.debug_payload = {"chunks": reranked}
        ctx = self._packer.pack(reranked)
        ctx = await self._compressor.compress(ctx, rewrite.rewritten)
        citations = self._citation_assembler.build_from_context(ctx)

        # Emit citations before streaming text
        for c in citations:
            yield {
                "type": "citation",
                "citation": CitationOut(
                    id=uuid.uuid4(),
                    citation_number=c.citation_number,
                    document_id=c.document_id,
                    document_title=c.document_title,
                    text_excerpt=c.text_excerpt,
                    page_number=c.page_number,
                    section=c.section,
                    vector_score=c.vector_score,
                    rerank_score=c.rerank_score,
                    combined_score=c.combined_score,
                    source_reliability=c.source_reliability,
                ).model_dump(mode="json"),
            }

        full_response = ""
        async with self._tracker.measure("generation"):
            async for chunk in self._orchestrator.stream(
                ctx=ctx, user_query=safe_query, conversation_history=history
            ):
                full_response += chunk
                yield {"type": "delta", "content": chunk}

        used_citations = self._citation_assembler.filter_used(citations, full_response)
        validation = await self._validator.validate(full_response, reranked)
        confidence = self._confidence_scorer.score(
            reranked_chunks=reranked,
            all_chunks=fused,
            validation=validation,
            citation_count=len(used_citations),
            context_chunk_count=len(ctx.chunks),
        )
        self._tracker.metrics.confidence = confidence
        self._tracker.finish()

        msg_id = await self._persist(
            conv=conv,
            user_query=safe_query,
            response=full_response,
            citations=used_citations,
            confidence=confidence,
            validation=validation,
            metrics=self._tracker.metrics,
        )

        await self._memory.append(conv.id, MemoryMessage("user", safe_query))
        await self._memory.append(conv.id, MemoryMessage("assistant", full_response, str(msg_id)))

        yield {
            "type": "done",
            "message_id": str(msg_id),
            "confidence_score": confidence,
            "tokens_used": self._tracker.metrics.context_tokens,
            "latency_ms": self._tracker.metrics.total_ms,
            "hallucination_flags": validation.hallucination_flags,
            "cached": False,
        }

    async def search(
        self,
        request: SearchRequest,
        tenant_id: uuid.UUID,
    ) -> SearchResponse:
        """Retrieval-only (no generation) for search use case."""
        import time
        t0 = time.monotonic()

        safe_query = self._security.check_query(request.query)
        processed = self._processor.process(safe_query)
        rewrite = await self._rewriter.rewrite(processed)
        query_emb = await self._embedder.embed_query(rewrite.rewritten)

        fused, _, _ = await self._retriever.retrieve(
            tenant_id=tenant_id,
            query_text=rewrite.rewritten,
            query_embedding=query_emb.dense,
            intent=processed.intent,
            is_turkish=processed.is_turkish,
            filters=request.filters,
        )
        fused = self._security.sanitize_chunks(fused)
        reranked = await self._reranker.rerank(rewrite.rewritten, fused, top_n=request.top_k)

        self._source_scorer.annotate(reranked)

        items = [
            SearchResultItem(
                chunk_id=r.chunk_id,
                document_id=r.document_id,
                document_title=r.document_title,
                content=r.content,
                page=r.page,
                section=r.section,
                vector_score=r.vector_score,
                bm25_score=r.bm25_score,
                combined_score=r.combined_score,
                rerank_score=r.rerank_score,
                source_reliability=r.source_reliability,
            )
            for r in reranked[: request.top_k]
        ]

        return SearchResponse(
            results=items,
            query_intent=processed.intent,
            rewritten_query=rewrite.rewritten if rewrite.rewritten != safe_query else None,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )

    async def get_debug(
        self, message_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> DebugResponse | None:
        self._init_repos(tenant_id)
        assert self._log_repo is not None
        log_entry = await self._log_repo.for_message(message_id)
        if log_entry is None:
            return None

        payload = log_entry.debug_payload or {}
        chunk_infos = payload.get("chunks", [])

        from app.modules.rag.schemas import ChunkDebugInfo

        return DebugResponse(
            message_id=message_id,
            original_query=log_entry.original_query,
            rewritten_query=log_entry.rewritten_query,
            query_intent=log_entry.query_intent,
            retrieved_chunks=[ChunkDebugInfo(**c) for c in chunk_infos],
            context_tokens=log_entry.context_tokens,
            was_compressed=log_entry.was_compressed,
            vector_weight=log_entry.vector_weight,
            bm25_weight=log_entry.bm25_weight,
            retrieval_latency_ms=log_entry.retrieval_latency_ms,
            rerank_latency_ms=log_entry.rerank_latency_ms,
            generation_latency_ms=log_entry.generation_latency_ms,
            total_latency_ms=log_entry.total_latency_ms,
            confidence_score=log_entry.confidence_score,
            cache_hit=log_entry.cache_hit,
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _get_or_create_conversation(
        self,
        conv_id: uuid.UUID | None,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Conversation:
        assert self._conv_repo is not None
        if conv_id is not None:
            conv = await self._conv_repo.get(conv_id)
            if conv is not None and conv.tenant_id == tenant_id:
                return conv

        conv = Conversation(
            tenant_id=tenant_id,
            user_id=user_id,
        )
        await self._conv_repo.add(conv)
        await self._session.flush()
        return conv

    async def _annotate_reliability(self, chunks, tenant_id: uuid.UUID) -> None:
        from sqlalchemy import func, select
        from app.modules.rag.models import Citation as CitModel

        # Load citation frequency for all document IDs in the result set
        doc_ids = list({c.document_id for c in chunks})
        if not doc_ids:
            return

        stmt = (
            select(CitModel.document_id, func.count(CitModel.id).label("cnt"))
            .where(CitModel.tenant_id == tenant_id, CitModel.document_id.in_(doc_ids))
            .group_by(CitModel.document_id)
        )
        rows = (await self._session.execute(stmt)).fetchall()
        freq = {row.document_id: row.cnt for row in rows}
        self._source_scorer.set_citation_frequencies(freq)
        self._source_scorer.annotate(chunks)

    async def _persist(
        self,
        *,
        conv: Conversation,
        user_query: str,
        response: str,
        citations,
        confidence: float,
        validation,
        metrics: TurnMetrics,
    ) -> uuid.UUID:
        assert self._msg_repo is not None
        # User message
        user_msg = Message(
            id=uuid.uuid4(),
            tenant_id=conv.tenant_id,
            conversation_id=conv.id,
            role=MessageRole.USER,
            content=user_query,
        )
        await self._msg_repo.add(user_msg)

        # Assistant message
        asst_msg = Message(
            id=uuid.uuid4(),
            tenant_id=conv.tenant_id,
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=response,
            model=get_settings().gemini_model,
            token_count=metrics.context_tokens,
            confidence_score=_safe_float(confidence),
            has_citations=bool(citations),
            citation_count=len(citations),
            hallucination_flags=validation.hallucination_flags or None,
        )
        await self._msg_repo.add(asst_msg)
        await self._session.flush()

        # Citations
        for c in citations:
            cit = Citation(
                tenant_id=conv.tenant_id,
                message_id=asst_msg.id,
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                citation_number=c.citation_number,
                document_title=c.document_title,
                text_excerpt=c.text_excerpt,
                page_number=c.page_number,
                section=c.section,
                vector_score=_safe_float(c.vector_score),
                rerank_score=_safe_float(c.rerank_score),
                combined_score=_safe_float(c.combined_score),
                source_reliability=_safe_float(c.source_reliability),
            )
            self._session.add(cit)

        # Retrieval log with debug payload
        debug_chunks = [
            {
                "chunk_id": str(r.chunk_id),
                "document_title": r.document_title,
                "content_preview": r.content[:150],
                "page": r.page,
                "vector_score": _safe_float(r.vector_score),
                "bm25_score": _safe_float(r.bm25_score),
                "combined_score": _safe_float(r.combined_score),
                "rerank_score": _safe_float(r.rerank_score),
                "token_count": r.token_count,
                "included_in_context": True,
            }
            for r in metrics.debug_payload.get("chunks", [])
        ]

        rl = RetrievalLog(
            tenant_id=conv.tenant_id,
            conversation_id=conv.id,
            message_id=asst_msg.id,
            original_query=user_query,
            rewritten_query=metrics.rewritten_query,
            query_intent=metrics.query_intent,
            vector_results_count=metrics.vector_results,
            bm25_results_count=metrics.bm25_results,
            reranked_results_count=metrics.reranked_results,
            final_context_chunks=metrics.context_chunks,
            context_tokens=metrics.context_tokens,
            was_compressed=metrics.was_compressed,
            cache_hit=metrics.cache_hit,
            retrieval_latency_ms=metrics.retrieval_ms,
            rerank_latency_ms=metrics.rerank_ms,
            generation_latency_ms=metrics.generation_ms,
            total_latency_ms=metrics.total_ms,
            confidence_score=_safe_float(confidence),
            vector_weight=_safe_float(metrics.vector_weight),
            bm25_weight=_safe_float(metrics.bm25_weight),
            debug_payload={"chunks": debug_chunks},
        )
        self._session.add(rl)

        # Update conversation counters
        assert self._conv_repo is not None
        await self._conv_repo.touch(conv.id)
        await self._conv_repo.add_tokens(conv.id, metrics.context_tokens)

        return asst_msg.id
