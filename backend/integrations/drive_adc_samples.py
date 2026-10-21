"""Constants, MIME helpers, and Workspace Preview Catalog for Google Drive ADC.

Separated from `drive_adc.py` to keep credential/API logic concise and modular.
"""

from __future__ import annotations

from typing import Any


GCLOUD_ADC_DRIVE_LOGIN_CMD = (
    "gcloud auth application-default login "
    '--scopes="https://www.googleapis.com/auth/cloud-platform,'
    "https://www.googleapis.com/auth/drive.readonly,"
    'https://www.googleapis.com/auth/userinfo.email,openid"'
)

GLINUX_GDRIVE_BIN = "/google/bin/releases/gemini-agents-gdrive/gdrive"

SAMPLE_DRIVE_FILES: list[dict[str, Any]] = [
    {
        "id": "drive-sample-vertex-prd",
        "name": "Vertex AI Agent Builder Q4 Global Launch PRD",
        "mimeType": "application/vnd.google-apps.document",
        "mimeLabel": "Google Doc",
        "modifiedTime": "2026-09-28T18:40:00Z",
        "webViewLink": "https://docs.google.com/document/d/drive-sample-vertex-prd/edit",
        "ownerEmail": "cloud_demo@google.com",
        "ownerName": "Cloud Demo (Product Lead)",
        "description": "Official Q4 Product Requirements Document covering GA regions, TPU v5e latency benchmarks, and CMEK rotation requirements.",
        "content": (
            "# Vertex AI Agent Builder Q4 Global Launch PRD\n"
            "- Regional Availability: us-central1 and europe-west4 are GA. asia-southeast1 (Singapore) is in Public Preview until Q4 capacity sign-off.\n"
            "- Performance Benchmark: Verified p99 latency on Cloud TPU v5e is 340ms under enterprise RAG load.\n"
            "- Security & Encryption: Regulated financial services deployments require 30-day automated CMEK rotation and VPC-SC perimeter enforcement.\n"
            "- Voice Streaming: Bidirectional low-latency voice streaming is currently in Private Preview (allowlist required)."
        ),
    },
    {
        "id": "drive-sample-apex-nda",
        "name": "Apex Global Bank Mutual NDA & Logo Clearance Tracker",
        "mimeType": "application/vnd.google-apps.spreadsheet",
        "mimeLabel": "Google Sheet",
        "modifiedTime": "2026-09-28T16:15:00Z",
        "webViewLink": "https://docs.google.com/spreadsheets/d/drive-sample-apex-nda/edit",
        "ownerEmail": "priya.nair@google.com",
        "ownerName": "Priya Nair (Legal Counsel)",
        "description": "Customer NDA registry, public reference clearance status, and HIPAA BAA execution tracker.",
        "content": (
            "Customer,NDA_Tier,Logo_Clearance_Status,Approved_External_Description,Notes\n"
            "Apex Global Bank,Tier-1 Strict Mutual NDA,BLOCKED (Pending Marketing Waiver),a Fortune 50 Global Retail & Investment Bank,Do not use customer name or logo in external keynote decks without signed waiver.\n"
            "MedCore Health Systems,HIPAA BAA Pending,RESTRICTED,a Leading National Healthcare Provider,Production PHI ingestion blocked until BAA countersignature."
        ),
    },
    {
        "id": "drive-sample-pso-rates",
        "name": "PSO Commercial Delivery Rate Card & Q4 FTE Capacity",
        "mimeType": "application/vnd.google-apps.document",
        "mimeLabel": "Google Doc",
        "modifiedTime": "2026-09-27T22:10:00Z",
        "webViewLink": "https://docs.google.com/document/d/drive-sample-pso-rates/edit",
        "ownerEmail": "marcus.vance@google.com",
        "ownerName": "Marcus Vance (Commercial Lead)",
        "description": "Standard PSO engagement SKUs, FTE staffing loads, and Q4 bench capacity limits.",
        "content": (
            "# PSO Commercial Delivery Rate Card & Q4 FTE Capacity\n"
            "- PSO-CORE-RAG: Core Vertex AI RAG & Vector Search Setup ($24,000 | 1.5 FTE | 10 days)\n"
            "- PSO-SEC-CMEK: Regulated CMEK & VPC-SC Security Hardening ($18,000 | 1.0 FTE | 8 days)\n"
            "- PSO-SAP-ERP: Custom SAP ERP Real-Time Connector ($22,000 | 1.5 FTE | 14 days)\n"
            "- PSO-MAINFRAME: Legacy Mainframe & COBOL Bridge ($18,000 | 1.5 FTE | 15 days)\n"
            "- Q4 Staffing Envelope: Maximum 4.0 FTE available without VP Commercial exception; standard launch budget is $60,000 ($66,000 max tolerance)."
        ),
    },
    {
        "id": "drive-sample-brand-deck",
        "name": "Cloud Next Keynote Brand & Naming Governance Guide",
        "mimeType": "application/vnd.google-apps.presentation",
        "mimeLabel": "Google Slides",
        "modifiedTime": "2026-09-26T14:05:00Z",
        "webViewLink": "https://docs.google.com/presentation/d/drive-sample-brand-deck/edit",
        "ownerEmail": "elena.rostova@google.com",
        "ownerName": "Elena Rostova (Brand Lead)",
        "description": "Official Google Cloud & Gemini brand nomenclature rules for external launches.",
        "content": (
            "# Cloud Next Keynote Brand & Naming Governance Guide\n"
            "- Rule BR-01: Always write 'Google Cloud' in full; never use the retired acronym 'GCP' in external copy.\n"
            "- Rule BR-02: Replace legacy 'Duet AI' or 'Bard Enterprise' references with 'Gemini for Google Cloud'.\n"
            "- Rule BR-03: Avoid anthropomorphic claims such as 'Autonomous Brain' or '100% Hallucination-Free'; use 'Enterprise-Grounded Reasoning Engine'."
        ),
    },
]


def _friendly_mime_label(mime_type: str) -> str:
    """Maps a Google Drive MIME type to a concise human-readable label."""
    mapping = {
        "application/vnd.google-apps.document": "Google Doc",
        "application/vnd.google-apps.spreadsheet": "Google Sheet",
        "application/vnd.google-apps.presentation": "Google Slides",
        "application/vnd.google-apps.folder": "Drive Folder",
        "application/pdf": "PDF Document",
        "text/markdown": "Markdown",
        "text/plain": "Plain Text",
        "text/csv": "CSV Sheet",
        "application/json": "JSON File",
    }
    return mapping.get(
        mime_type, mime_type.split("/")[-1][:24] if mime_type else "File"
    )
