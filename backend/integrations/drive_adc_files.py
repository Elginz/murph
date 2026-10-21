"""Google Drive File Search & Content Export Mixin (`drive_adc_files.py`).

Queries Google Drive files via:
1. Google Drive v3 REST API using ADC OAuth2 tokens.
2. gLinux `gdrive` CLI fallback (`/google/bin/releases/gemini-agents-gdrive/gdrive`).
3. Curated Workspace Drive Preview Catalog (`SAMPLE_DRIVE_FILES`).

Also exports Google Docs, Sheets, Slides, and raw text files into Markdown/CSV.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any, TYPE_CHECKING
import urllib.parse

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
    except ImportError:
        from backend.integrations import drive_adc_samples  # type: ignore


GCLOUD_ADC_DRIVE_LOGIN_CMD = drive_adc_samples.GCLOUD_ADC_DRIVE_LOGIN_CMD
GLINUX_GDRIVE_BIN = drive_adc_samples.GLINUX_GDRIVE_BIN
SAMPLE_DRIVE_FILES = drive_adc_samples.SAMPLE_DRIVE_FILES
_friendly_mime_label = drive_adc_samples._friendly_mime_label


class DriveADCFilesMixin:
    """Mixin providing Google Drive v3 search and document content export."""

    _cached_status: dict[str, Any] | None
    get_status: Any
    _mint_access_token: Any
    _drive_api_get: Any

    def search_files(
        self,
        query: str = "",
        mime_filter: str = "all",
        page_size: int = 12,
    ) -> dict[str, Any]:
        """Queries Google Drive files via ADC REST API v3, gdrive CLI fallback, or preview vault."""
        status = self.get_status()
        clean_q = query.strip()
        token, quota_proj, _ = self._mint_access_token()

        # 1. Try Google Drive REST API v3 using ADC token
        api_err = ""
        if token:
            q_clauses = ["trashed = false"]
            if mime_filter == "docs":
                q_clauses.append(
                    "mimeType = 'application/vnd.google-apps.document'"
                )
            elif mime_filter == "sheets":
                q_clauses.append(
                    "mimeType = 'application/vnd.google-apps.spreadsheet'"
                )
            elif mime_filter == "slides":
                q_clauses.append(
                    "mimeType = 'application/vnd.google-apps.presentation'"
                )
            elif mime_filter == "text":
                q_clauses.append(
                    "(mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/pdf')"
                )
            else:
                q_clauses.append(
                    "mimeType != 'application/vnd.google-apps.folder'"
                )

            if clean_q:
                escaped = clean_q.replace("\\", "\\\\").replace("'", "\\'")
                q_clauses.append(
                    f"(name contains '{escaped}' or fullText contains '{escaped}')"
                )

            params: dict[str, str] = {
                "q": " and ".join(q_clauses),
                "pageSize": str(max(1, min(page_size, 30))),
                "includeItemsFromAllDrives": "true",
                "supportsAllDrives": "true",
                "fields": (
                    "files(id,name,mimeType,modifiedTime,webViewLink,"
                    "owners(displayName,emailAddress),description)"
                ),
            }
            if not clean_q:
                params["orderBy"] = "modifiedTime desc"

            url = (
                "https://www.googleapis.com/drive/v3/files?"
                + urllib.parse.urlencode(params)
            )
            data, api_err = self._drive_api_get(
                url, access_token=token, quota_project_id=quota_proj
            )
            if isinstance(data, dict) and isinstance(data.get("files"), list):
                files_out = []
                for item in data["files"]:
                    owners = item.get("owners") or []
                    first_owner = owners[0] if owners else {}
                    mtype = str(item.get("mimeType", ""))
                    fid = str(item.get("id", ""))
                    files_out.append(
                        {
                            "id": fid,
                            "name": str(item.get("name", "Untitled Drive File")),
                            "mimeType": mtype,
                            "mimeLabel": _friendly_mime_label(mtype),
                            "modifiedTime": str(item.get("modifiedTime", "")),
                            "webViewLink": str(
                                item.get("webViewLink")
                                or f"https://drive.google.com/file/d/{fid}/view"
                            ),
                            "ownerEmail": str(
                                first_owner.get(
                                    "emailAddress",
                                    status["authenticated_email"],
                                )
                            ),
                            "ownerName": str(
                                first_owner.get(
                                    "displayName",
                                    status["authenticated_name"],
                                )
                            ),
                            "description": str(
                                item.get("description")
                                or "Live Google Drive file retrieved via ADC."
                            ),
                            "source": "google_drive_adc",
                        }
                    )
                self._cached_status = None
                if files_out:
                    return {
                        "live_source": True,
                        "transport": "adc_drive_v3",
                        "query": clean_q,
                        "files": files_out,
                        "adc_status": self.get_status(),
                        "message": (
                            f"Retrieved {len(files_out)} file(s) from Google Drive via ADC "
                            f"({status['authenticated_email']})."
                        ),
                    }

        # 2. Secondary fallback: gLinux `/google/bin/releases/gemini-agents-gdrive/gdrive`
        if os.path.isfile(GLINUX_GDRIVE_BIN):
            target_ldap = status.get("authenticated_ldap") or "efch"
            cmd = [GLINUX_GDRIVE_BIN, "--target_user", target_ldap, "readonly"]
            if clean_q:
                cmd.extend(["search", "--name-contains", clean_q, "--json"])
            else:
                cmd.extend(["recent", "--max", str(page_size), "--json"])
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=6.0,
                    check=False,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    raw_items = json.loads(proc.stdout)
                    if isinstance(raw_items, dict):
                        raw_items = (
                            raw_items.get("files") or raw_items.get("items") or []
                        )
                    if isinstance(raw_items, list):
                        files_out = []
                        for item in raw_items[:page_size]:
                            if not isinstance(item, dict):
                                continue
                            fid = str(item.get("id") or item.get("fileId") or "")
                            mtype = str(
                                item.get("mimeType")
                                or "application/vnd.google-apps.document"
                            )
                            files_out.append(
                                {
                                    "id": fid,
                                    "name": str(
                                        item.get("name")
                                        or item.get("title")
                                        or "Drive Document"
                                    ),
                                    "mimeType": mtype,
                                    "mimeLabel": _friendly_mime_label(mtype),
                                    "modifiedTime": str(
                                        item.get("modifiedTime") or ""
                                    ),
                                    "webViewLink": str(
                                        item.get("webViewLink")
                                        or f"https://drive.google.com/file/d/{fid}/view"
                                    ),
                                    "ownerEmail": f"{target_ldap}@google.com",
                                    "ownerName": target_ldap.upper(),
                                    "description": "Retrieved via gLinux gdrive CLI delegation.",
                                    "source": "glinux_gdrive_cli",
                                }
                            )
                        if files_out:
                            return {
                                "live_source": True,
                                "transport": "glinux_gdrive_cli",
                                "query": clean_q,
                                "files": files_out,
                                "adc_status": status,
                                "message": (
                                    f"Retrieved {len(files_out)} file(s) from Google Drive "
                                    f"for {target_ldap}@google.com."
                                ),
                            }
            except Exception:  # pylint: disable=broad-exception-caught
                pass

        # 3. Fallback to Workspace Drive Preview Catalog + clear ADC scope instructions
        q_lower = clean_q.lower()
        filtered_samples = []
        for s in SAMPLE_DRIVE_FILES:
            if mime_filter == "docs" and "document" not in s["mimeType"]:
                continue
            if mime_filter == "sheets" and "spreadsheet" not in s["mimeType"]:
                continue
            if mime_filter == "slides" and "presentation" not in s["mimeType"]:
                continue
            if q_lower and not (
                q_lower in s["name"].lower()
                or q_lower in s["description"].lower()
                or q_lower in s["content"].lower()
            ):
                continue
            item_copy = dict(s)
            item_copy["source"] = "drive_workspace_preview"
            filtered_samples.append(item_copy)

        if not filtered_samples:
            filtered_samples = [
                dict(s, source="drive_workspace_preview")
                for s in SAMPLE_DRIVE_FILES
            ]

        hint = (
            f"ADC token needs Drive scope (`{GCLOUD_ADC_DRIVE_LOGIN_CMD}`). "
            f"Showing {len(filtered_samples)} workspace Drive document(s) ready for import."
            if not status.get("drive_scope_active")
            else f"Drive query note ({api_err or 'offline'}). Showing {len(filtered_samples)} workspace Drive document(s)."
        )
        return {
            "live_source": False,
            "transport": "drive_workspace_preview",
            "query": clean_q,
            "files": filtered_samples,
            "adc_status": status,
            "api_error": api_err,
            "message": hint,
        }

    def fetch_file_content(
        self, file_id: str, mime_type: str = "", file_name: str = ""
    ) -> tuple[str, str, str]:
        """Fetches/exports a Google Drive file's text content.

        Returns:
            (filename, text_content, status_note)
        """
        clean_id = file_id.strip()
        for sample in SAMPLE_DRIVE_FILES:
            if sample["id"] == clean_id:
                ext = ".csv" if "spreadsheet" in sample["mimeType"] else ".md"
                safe_name = sample["name"].replace(" ", "_") + ext
                return (
                    safe_name,
                    sample["content"],
                    f"Imported from Google Drive ({sample['mimeLabel']}: {sample['name']}).",
                )

        token, quota_proj, _ = self._mint_access_token()
        if token and clean_id:
            if not mime_type:
                meta_url = (
                    f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(clean_id)}"
                    "?supportsAllDrives=true&fields=id,name,mimeType"
                )
                meta, _ = self._drive_api_get(
                    meta_url, access_token=token, quota_project_id=quota_proj
                )
                if isinstance(meta, dict):
                    mime_type = str(meta.get("mimeType", ""))
                    if not file_name and meta.get("name"):
                        file_name = str(meta["name"])

            if mime_type == "application/vnd.google-apps.document":
                export_url = (
                    f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(clean_id)}"
                    "/export?mimeType=text/plain"
                )
                content, err = self._drive_api_get(
                    export_url,
                    access_token=token,
                    quota_project_id=quota_proj,
                    raw_bytes=True,
                )
                if content:
                    fname = (file_name or clean_id).replace(" ", "_")
                    if not fname.endswith((".md", ".txt")):
                        fname += ".md"
                    return (
                        fname,
                        str(content),
                        f"Exported Google Doc ({clean_id}) via ADC Drive v3 API.",
                    )
            elif mime_type == "application/vnd.google-apps.spreadsheet":
                export_url = (
                    f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(clean_id)}"
                    "/export?mimeType=text/csv"
                )
                content, err = self._drive_api_get(
                    export_url,
                    access_token=token,
                    quota_project_id=quota_proj,
                    raw_bytes=True,
                )
                if content:
                    fname = (file_name or clean_id).replace(" ", "_")
                    if not fname.endswith(".csv"):
                        fname += ".csv"
                    return (
                        fname,
                        str(content),
                        f"Exported Google Sheet ({clean_id}) as CSV via ADC Drive v3 API.",
                    )
            elif mime_type == "application/vnd.google-apps.presentation":
                export_url = (
                    f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(clean_id)}"
                    "/export?mimeType=text/plain"
                )
                content, err = self._drive_api_get(
                    export_url,
                    access_token=token,
                    quota_project_id=quota_proj,
                    raw_bytes=True,
                )
                if content:
                    fname = (file_name or clean_id).replace(" ", "_")
                    if not fname.endswith((".md", ".txt")):
                        fname += ".md"
                    return (
                        fname,
                        str(content),
                        f"Exported Google Slides ({clean_id}) as text via ADC Drive v3 API.",
                    )
            else:
                media_url = (
                    f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(clean_id)}"
                    "?alt=media&supportsAllDrives=true"
                )
                content, err = self._drive_api_get(
                    media_url,
                    access_token=token,
                    quota_project_id=quota_proj,
                    raw_bytes=True,
                )
                if content:
                    fname = (file_name or clean_id).replace(" ", "_")
                    return (
                        fname,
                        str(content),
                        f"Downloaded Drive file ({clean_id}) via ADC Drive v3 API.",
                    )
                _ = err

        # Fallback: try gLinux gdrive CLI export
        if os.path.isfile(GLINUX_GDRIVE_BIN) and clean_id:
            status = self.get_status()
            target_ldap = status.get("authenticated_ldap") or "efch"
            with tempfile.NamedTemporaryFile(
                suffix=".md", delete=False
            ) as tmp_file:
                tmp_path = tmp_file.name
            try:
                proc = subprocess.run(
                    [
                        GLINUX_GDRIVE_BIN,
                        "--target_user",
                        target_ldap,
                        "readonly",
                        "export",
                        clean_id,
                        tmp_path,
                        "--format",
                        "md",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=6.0,
                    check=False,
                )
                if proc.returncode == 0 and os.path.isfile(tmp_path):
                    with open(
                        tmp_path, "r", encoding="utf-8", errors="replace"
                    ) as f:
                        exported_text = f.read().strip()
                    if exported_text:
                        fname = (file_name or clean_id).replace(" ", "_") + ".md"
                        return (
                            fname,
                            exported_text,
                            f"Exported Drive file ({clean_id}) via gdrive CLI.",
                        )
            except Exception:  # pylint: disable=broad-exception-caught
                pass
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass

        fallback_name = (
            (file_name or clean_id or "Drive_Document").replace(" ", "_") + ".md"
        )
        fallback_body = (
            f"# {file_name or clean_id}\n"
            f"- Google Drive File ID: `{clean_id}`\n"
            f"- Note: Full text export requires ADC with `drive.readonly` scope (`{GCLOUD_ADC_DRIVE_LOGIN_CMD}`)."
        )
        return (
            fallback_name,
            fallback_body,
            "Created Drive reference stub (run gcloud ADC login for full export).",
        )
