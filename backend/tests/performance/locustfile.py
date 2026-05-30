"""Locust performance and load testing suite.

Simulates concurrent user activities: chat, search, document ingestion, and health checks
across multiple dynamically generated tenant contexts.
"""
from __future__ import annotations

import io
import os
import sys
import uuid
import random
from locust import HttpUser, task, between

# Add the parent directory to Python path to allow app imports when executing Locust from root/tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.config import get_settings
from app.core.security import create_access_token


class RagLoadUser(HttpUser):
    # Simulated think time between user tasks: 1 to 5 seconds
    wait_time = between(1.0, 5.0)

    def on_start(self) -> None:
        """Executed when a new simulated user initializes.

        Generates unique Tenant ID, User ID, and builds authorization headers.
        """
        self.tenant_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        
        # Generate valid RS256/HS256 access token using local secret settings
        token = create_access_token(
            user_id=self.user_id,
            tenant_id=self.tenant_id,
            perms=["document:read", "document:write", "rag:chat", "rag:search"]
        )
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        self.conversation_id = None

    @task(5)
    def chat_session(self) -> None:
        """Simulate a multi-turn chat interaction with the RAG endpoint."""
        queries = [
            "Kira sözleşmesinde kiracının borçları nelerdir?",
            "Gecikme faizi oranı ne kadar?",
            "Şirketin 2024 yılı net karı ne kadar gerçekleşmiştir?",
            "Kişisel veriler ne kadar süre saklanabilir?"
        ]
        query = random.choice(queries)

        # If a conversation is not active, create one first or run chat directly
        payload = {
            "query": query,
            "conversation_id": str(self.conversation_id) if self.conversation_id else None,
            "stream": False
        }
        
        with self.client.post("/api/v1/rag/chat", json=payload, headers=self.headers, catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                # Keep track of conversation ID for follow-up turns
                if "conversation_id" in data:
                    self.conversation_id = data["conversation_id"]
                response.success()
            else:
                response.failure(f"Chat failed with status {response.status_code}: {response.text}")

    @task(3)
    def hybrid_search(self) -> None:
        """Simulate a retrieval-only search call under load."""
        search_terms = [
            "tahliye davası",
            "finansal rapor gelirleri",
            "KVKK veri saklama süreleri",
            "yıllık izin hakları"
        ]
        term = random.choice(search_terms)
        
        payload = {
            "query": term,
            "limit": 5
        }
        
        with self.client.post("/api/v1/rag/search", json=payload, headers=self.headers, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Search failed with status {response.status_code}")

    @task(1)
    def upload_document(self) -> None:
        """Simulate document uploads and triggering the OCR + parsing ingestion pipeline."""
        dummy_pdf_data = (
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>\nendobj\n"
            b"4 0 obj\n<< /Length 50 >>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(Performans test belgesi icerigi.) Tj\nET\nendstream\nendobj\n"
            b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n250\n%%EOF"
        )
        
        # Prepare multipart form upload
        files = {
            "file": ("performance_doc.pdf", io.BytesIO(dummy_pdf_data), "application/pdf")
        }
        
        # Override headers for multipart boundary formatting
        upload_headers = self.headers.copy()
        del upload_headers["Content-Type"]

        with self.client.post("/api/v1/documents/upload", files=files, headers=upload_headers, catch_response=True) as response:
            # Check if upload succeeds (FastAPI endpoints return 200 or 201 on success)
            if response.status_code in (200, 201, 202):
                response.success()
            else:
                response.failure(f"Upload failed: {response.status_code}")

    @task(2)
    def check_health(self) -> None:
        """Simulate hitting public health check endpoint."""
        self.client.get("/api/v1/health")
