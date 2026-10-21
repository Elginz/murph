"""Cloud Run runtime credentials from the metadata server, for Vertex AI Gemini calls.

The Cloud Run container has no `gcloud` CLI and no user ADC file, so the Help Desk's
Vertex AI transport (`llm_agent_helpdesk`) asks the metadata server for an OAuth2
access token of the service's runtime service account instead. That account needs
`roles/aiplatform.user` (`deploy/deploy_cloud_run.sh` grants it).

Lookups only happen when `K_SERVICE` is set (Cloud Run sets it on every revision), so a
GCE VM or cloudtop never borrows its machine service account for Gemini calls.
"""

from __future__ import annotations

import json
import os
import urllib.request

METADATA_BASE_URL = "http://metadata.google.internal/computeMetadata/v1"
# Tokens live ~1 h; refresh well before that (same window as the gcloud/ADC cache).
MAX_TOKEN_CACHE_SEC = 2400.0
EXPIRY_SAFETY_MARGIN_SEC = 120.0


def on_cloud_run() -> bool:
    """Returns True when running as a Cloud Run service."""
    return bool(os.environ.get("K_SERVICE", "").strip())


def metadata_get(path: str, timeout: float = 2.0) -> str:
    """GETs one metadata-server value, or "" on any failure.

    Uses a proxy-free opener: `metadata.google.internal` must never go through an
    `http_proxy`.
    """
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        f"{METADATA_BASE_URL}/{path.lstrip('/')}",
        headers={"Metadata-Flavor": "Google"},
    )
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace").strip()
    except Exception:  # pylint: disable=broad-exception-caught
        return ""


def runtime_credentials() -> tuple[str, float, str]:
    """Returns `(access_token, cache_ttl_sec, project_id)` for the runtime service account.

    Every value is empty when not on Cloud Run or when the metadata server returns no token.
    """
    if not on_cloud_run():
        return "", 0.0, ""
    try:
        data = json.loads(metadata_get("instance/service-accounts/default/token") or "{}")
        token = str(data.get("access_token", "")).strip()
        expires_in = float(data.get("expires_in", 0) or 0)
    except (AttributeError, TypeError, ValueError):
        return "", 0.0, ""
    if not token:
        return "", 0.0, ""
    ttl = min(MAX_TOKEN_CACHE_SEC, max(0.0, expires_in - EXPIRY_SAFETY_MARGIN_SEC))
    return token, ttl, metadata_get("project/project-id")
