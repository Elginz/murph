"""Static Asset Serving, HTML Fragment Assembler & Export Handlers Mixin.

Provides HTTP response helpers (`_send_json`, `_serve_file`, `_read_json_body`),
dynamic `<!-- @fragment <path> -->` template assembly (`_serve_html_with_fragments`),
and `.zip` / `.md` / `.json` deliverable exports (`_serve_zip_export`,
`_serve_markdown_export`, `_serve_project_json_export`).

Every workspace-state JSON response (`_send_json`, the `.json` export) goes
through `state_privacy` first: passwords are dropped and other visitors'
private `user_*` accounts are hidden. The viewer is the account behind the
request's server session (`murph_sid`), never a browser-written cookie;
`server_identity.overlay_viewer` then adds `viewer_session` and the viewer's
own `current_user`.
"""

from __future__ import annotations

from http import HTTPStatus
import io
import json
import mimetypes
import os
import re
from typing import Any, TYPE_CHECKING
import zipfile

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend import paths
    from google3.experimental.users.efch.murph.backend.server import server_identity
    from google3.experimental.users.efch.murph.backend.server import state_privacy
else:
    try:
        from google3.experimental.users.efch.murph.backend import paths
        from google3.experimental.users.efch.murph.backend.server import server_identity
        from google3.experimental.users.efch.murph.backend.server import state_privacy
    except ImportError:
        from backend import paths  # type: ignore
        from backend.server import server_identity  # type: ignore
        from backend.server import state_privacy  # type: ignore

PROJECT_ROOT = paths.PROJECT_ROOT
FRONTEND_DIR = paths.FRONTEND_DIR
# Source bundle offered at /download/murph.zip (paths relative to PROJECT_ROOT).
EXPORT_ROOT_FILES = (
    "main.py", "README.md", "BUILD", "requirements.txt",
    "Dockerfile", ".dockerignore", ".gcloudignore", ".gitignore",
)
EXPORT_DIRS = ("backend", "frontend", "tests", "deploy")


class ServerAssetsAndExportMixin:
    """Mixin for serving static assets, HTML fragments, and deliverable exports."""

    headers: Any
    rfile: Any
    wfile: Any
    engine_instance: Any
    send_response: Any
    send_header: Any
    end_headers: Any
    send_error: Any
    _visitor_view: Any

    def _safe_write(self, data: bytes) -> None:
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _redact_for_viewer(
        self,
        payload: dict[str, Any],
        visitor: tuple[dict[str, Any] | None, str] | None = None,
    ) -> dict[str, Any]:
        """Filters a state payload for the visitor behind this request.

        `visitor` is `(account row or None, provider)`; sign-in and sign-out
        responses pass the account they just switched to, everything else uses
        the request's server session (`_visitor_view`).
        """
        account, provider = visitor if visitor is not None else self._visitor_view()
        viewer = server_identity.account_key_for(account.get("id")) if account else ""
        redacted = state_privacy.redact_state_for_viewer(
            payload, viewer, self.engine_instance.store.list_users()
        )
        return server_identity.overlay_viewer(redacted, account, provider)

    def _send_json(
        self,
        payload: dict[str, Any],
        status: int = HTTPStatus.OK,
        cookies: list[str] | None = None,
        visitor: tuple[dict[str, Any] | None, str] | None = None,
    ) -> None:
        if state_privacy.looks_like_state(payload):
            payload = self._redact_for_viewer(payload, visitor)
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for cookie_header in cookies or []:
            self.send_header("Set-Cookie", cookie_header)
        self.end_headers()
        self._safe_write(raw)

    def _serve_file(self, file_path: str) -> None:
        if not os.path.isfile(file_path):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        mime_type, _ = mimetypes.guess_type(file_path)
        with open(file_path, "rb") as f:
            content = f.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._safe_write(content)

    def _serve_css_with_imports(self, file_path: str) -> None:
        """Serves `styles.css` while inlining local `@import url('/static/css/...');` modules to avoid 15 waterfall requests."""
        if not os.path.isfile(file_path):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        with open(file_path, "r", encoding="utf-8") as f:
            css_text = f.read()

        def _replace_import(match: re.Match[str]) -> str:
            imp_rel = match.group(1).strip().strip("'\"")
            imp_path = self._resolve_frontend_file(imp_rel)
            if os.path.isfile(imp_path):
                with open(imp_path, "r", encoding="utf-8") as cf:
                    return f"/* @inlined {imp_rel} */\n" + cf.read() + "\n"
            return match.group(0)

        bundled = re.sub(
            r"@import\s+url\(\s*([^)]+)\s*\)\s*;",
            _replace_import,
            css_text,
        )
        raw = bundled.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/css; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._safe_write(raw)

    def _serve_html_with_fragments(self, file_path: str) -> None:
        """Serves `index.html` while expanding `<!-- @fragment <path> -->` includes from `frontend/fragments/`."""
        if not os.path.isfile(file_path):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        with open(file_path, "r", encoding="utf-8") as f:
            html_text = f.read()

        def _replace_fragment(match: re.Match[str]) -> str:
            frag_path = self._resolve_frontend_file(match.group(1).strip())
            if os.path.isfile(frag_path):
                with open(frag_path, "r", encoding="utf-8") as ff:
                    return ff.read()
            return match.group(0)

        assembled = html_text
        for _ in range(4):
            if "<!-- @fragment" not in assembled:
                break
            assembled = re.sub(
                r"<!--\s*@fragment\s+([^\s]+)\s*-->",
                _replace_fragment,
                assembled,
            )
        raw = assembled.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._safe_write(raw)

    def _resolve_frontend_file(self, rel_path: str) -> str:
        """Maps `/static/<rel>`, `/<rel>` or `<rel>` onto `frontend/<rel>`.

        Only files inside `frontend/` are ever served (never the backend sources, `.env`
        or the SQLite database); anything else resolves to "" and becomes a 404.
        """
        rel_clean = rel_path.lstrip("/")
        if rel_clean.startswith("static/"):
            rel_clean = rel_clean[len("static/") :]
        candidate = os.path.normpath(os.path.join(FRONTEND_DIR, rel_clean))
        if candidate.startswith(FRONTEND_DIR + os.sep):
            return candidate
        return ""

    def _iter_export_files(self) -> list[str]:
        """Lists the project files bundled into `murph.zip` (no database, caches or `.env`)."""
        files = [os.path.join(PROJECT_ROOT, name) for name in EXPORT_ROOT_FILES]
        for top in EXPORT_DIRS:
            for dirpath, dirnames, filenames in os.walk(os.path.join(PROJECT_ROOT, top)):
                dirnames[:] = sorted(d for d in dirnames if d != "__pycache__")
                files.extend(
                    os.path.join(dirpath, fname)
                    for fname in sorted(filenames)
                    if not fname.endswith((".pyc", ".db"))
                )
        return [path for path in files if os.path.isfile(path)]

    def _serve_zip_export(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for abs_path in self._iter_export_files():
                rel_arc = os.path.relpath(abs_path, PROJECT_ROOT)
                zf.write(abs_path, arcname=os.path.join("murph", rel_arc))
        raw = buf.getvalue()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", 'attachment; filename="murph.zip"')
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _serve_markdown_export(self) -> None:
        md_text = self.engine_instance.export_deliverables_markdown()
        raw = md_text.encode("utf-8")
        proj_id = self.engine_instance.active_scenario_id
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/markdown; charset=utf-8")
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{proj_id}_deliverables.md"',
        )
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _serve_project_json_export(self) -> None:
        state = self._redact_for_viewer(self.engine_instance.get_state())
        raw = json.dumps(state, indent=2).encode("utf-8")
        proj_id = self.engine_instance.active_scenario_id
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{proj_id}_workspace.json"',
        )
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
