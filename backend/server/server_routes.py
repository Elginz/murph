"""HTTP Route Dispatch Mixin (`do_GET` and `do_POST`) for Murph Server.

Dispatches REST API endpoints for:
- Workspace state & Agent Mesh (`/api/state`, `/api/agent/network`, `/api/drive/status`)
- Sign-in, Sign-Up, sign-out and per-visitor sessions (`/api/auth/*`), handled
  by `ServerAccountRoutesMixin`. Before any other POST runs, its
  `_session_identity_guard` replaces the identity fields of the body with the
  visitor's server session (see `server_identity`).
- Google Drive ADC & File Vault (`/api/drive/*`, `/api/user/files/*`)
- Cross-Team A2A & Bilateral Tickets (`/api/agent/ask`, `/api/tickets/create`, `/api/tickets/action`)
- Governance, Projects, Claims, Policies, Rate Cards & Workflows (via `ServerGovernanceRoutesMixin`)
"""

from __future__ import annotations

from http import HTTPStatus
from typing import Any, TYPE_CHECKING
from urllib.parse import urlparse

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.server import server_routes_accounts
    from google3.experimental.users.efch.murph.backend.server import server_routes_governance
else:
    try:
        from google3.experimental.users.efch.murph.backend.server import server_routes_accounts
        from google3.experimental.users.efch.murph.backend.server import server_routes_governance
    except ImportError:
        from backend.server import server_routes_accounts  # type: ignore
        from backend.server import server_routes_governance  # type: ignore


class ServerRoutesMixin(
    server_routes_accounts.ServerAccountRoutesMixin,
    server_routes_governance.ServerGovernanceRoutesMixin,
):
    """Mixin implementing `do_GET` and `do_POST` HTTP route handlers."""

    path: str
    engine_instance: Any
    send_response: Any
    send_header: Any
    end_headers: Any
    send_error: Any
    _send_json: Any
    _read_json_body: Any
    _resolve_frontend_file: Any
    _serve_file: Any
    _serve_css_with_imports: Any
    _serve_html_with_fragments: Any
    _serve_zip_export: Any
    _serve_markdown_export: Any
    _serve_project_json_export: Any

    def do_HEAD(self) -> None:  # pylint: disable=invalid-name
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

    def do_GET(self) -> None:  # pylint: disable=invalid-name
        self.__dict__.pop("_visitor_cache", None)
        parsed = urlparse(self.path)
        path = parsed.path

        if self._dispatch_account_get(path):
            return

        if path == "/api/state":
            self._send_json(self.engine_instance.get_state())
            return

        if path == "/api/drive/status":
            self._send_json(
                self.engine_instance.drive_adc.get_status(
                    force_refresh=True, probe_network=True
                )
            )
            return

        if path == "/api/agent/network":
            state = self.engine_instance.get_state()
            self._send_json(
                {
                    "current_user": state["current_user"],
                    "user_agents": state["user_agents"],
                    "user_files": state["user_files"],
                    "a2a_messages": state["a2a_messages"],
                    "agent_tickets": state["agent_tickets"],
                    "agent_mesh": state["agent_mesh"],
                }
            )
            return

        if path in ("/download/murph.zip", "/api/export/zip"):
            self._serve_zip_export()
            return

        if path == "/api/export/deliverables.md":
            self._serve_markdown_export()
            return

        if path == "/api/export/project.json":
            self._serve_project_json_export()
            return

        normalized_path = path.rstrip("/") or "/"
        if normalized_path in (
            "/",
            "/index.html",
            "/home",
            "/login",
            "/signup",
            "/workspace",
        ):
            self._serve_html_with_fragments(
                self._resolve_frontend_file("index.html")
            )
            return

        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return

        if path == "/styles.css":
            self._serve_css_with_imports(self._resolve_frontend_file("styles.css"))
            return

        if path.startswith(("/assets/", "/css/", "/js/", "/fragments/")):
            rel = path.lstrip("/")
            self._serve_file(self._resolve_frontend_file(rel))
            return

        if path.startswith("/static/"):
            rel = path[len("/static/") :]
            if rel == "index.html":
                self._serve_html_with_fragments(
                    self._resolve_frontend_file("index.html")
                )
            elif rel == "styles.css":
                self._serve_css_with_imports(
                    self._resolve_frontend_file("styles.css")
                )
            else:
                self._serve_file(self._resolve_frontend_file(rel))
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:  # pylint: disable=invalid-name
        self.__dict__.pop("_visitor_cache", None)
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if self._dispatch_account_post(path, body):
            return
        guarded = self._session_identity_guard(path, body)
        if guarded is None:
            return
        body = guarded

        if path == "/api/auth/update_profile":
            self._send_json(
                self.engine_instance.update_user_settings(
                    email=str(body.get("email") or body.get("ldap") or ""),
                    name=str(body.get("name", "")),
                    role=str(body.get("role", "")),
                    department=str(body.get("department", "")),
                    nda_clearance=str(body.get("nda_clearance", "")),
                    team_agent_id=str(body.get("team_agent_id", "")),
                    personal_agent_name=str(
                        body.get("personal_agent_name", "")
                    ),
                    workspace_tier=str(body.get("workspace_tier", "")),
                    environment=str(body.get("environment", "")),
                    user_id=str(body.get("user_id", "")),
                )
            )
            return

        if path == "/api/auth/switch_env":
            self._send_json(
                self.engine_instance.switch_environment(
                    environment=str(body.get("environment", "cloud")),
                )
            )
            return

        if path == "/api/drive/configure":
            self._send_json(
                self.engine_instance.configure_google_adc(
                    access_token=str(body.get("access_token", "")),
                    quota_project_id=str(body.get("quota_project_id", "")),
                    target_user=str(body.get("target_user", "")),
                )
            )
            return

        if path == "/api/drive/query":
            self._send_json(
                self.engine_instance.query_google_drive(
                    query=str(body.get("query", "")),
                    mime_filter=str(body.get("mime_filter", "all")),
                    page_size=int(body.get("page_size", 12)),
                )
            )
            return

        if path == "/api/drive/import":
            self._send_json(
                self.engine_instance.import_google_drive_file(
                    file_id=str(body.get("file_id", "")),
                    mime_type=str(body.get("mime_type", "")),
                    file_name=str(body.get("file_name", "")),
                    visibility=str(body.get("visibility", "federated")),
                    also_analyze_in_project=bool(
                        body.get("also_analyze_in_project", False)
                    ),
                )
            )
            return

        if path == "/api/user/files/upload":
            self._send_json(
                self.engine_instance.upload_user_file(
                    filename=str(body.get("filename", "")),
                    content=str(body.get("content", "")),
                    file_type=str(body.get("file_type", "txt")),
                    tags=body.get("tags", ""),
                    visibility=str(body.get("visibility", "federated")),
                    user_id=body.get("user_id"),
                    environment=str(body.get("environment", "")),
                    ldap=str(body.get("ldap") or body.get("email") or ""),
                )
            )
            return

        if path == "/api/user/files/delete":
            self._send_json(
                self.engine_instance.delete_user_file(
                    file_id=str(body.get("file_id", ""))
                )
            )
            return

        if path == "/api/agent/ask":
            raw_targets = body.get("target_team_agent_ids")
            targets = (
                [str(x) for x in raw_targets if str(x).strip()]
                if isinstance(raw_targets, list)
                else None
            )
            raw_history = body.get("conversation_history")
            conv_history = (
                [
                    {
                        "role": str(item.get("role", "user")),
                        "text": str(item.get("text", "")),
                    }
                    for item in raw_history
                    if isinstance(item, dict) and str(item.get("text", "")).strip()
                ]
                if isinstance(raw_history, list)
                else None
            )
            self._send_json(
                self.engine_instance.ask_user_agent(
                    question=str(body.get("question", "")),
                    target_team_agent_ids=targets,
                    user_id=body.get("user_id"),
                    ldap=str(body.get("ldap") or body.get("email") or ""),
                    environment=str(body.get("environment", "")),
                    workspace_context=str(body.get("workspace_context", "")),
                    conversation_history=conv_history,
                    model=str(body.get("model", "")),
                )
            )
            return

        if path == "/api/tickets/create":
            raw_file_ids = body.get("reference_file_ids")
            ref_file_ids = (
                [str(x) for x in raw_file_ids if str(x).strip()]
                if isinstance(raw_file_ids, list)
                else None
            )
            raw_target_users = body.get("target_user_ids")
            target_users = (
                [str(x) for x in raw_target_users if str(x).strip()]
                if isinstance(raw_target_users, list)
                else None
            )
            raw_target_teams = body.get("target_team_agent_ids")
            target_teams = (
                [str(x) for x in raw_target_teams if str(x).strip()]
                if isinstance(raw_target_teams, list)
                else None
            )
            self._send_json(
                self.engine_instance.create_agent_ticket(
                    title=str(body.get("title", "")),
                    request_summary=str(body.get("request_summary", "")),
                    reference_file_ids=ref_file_ids,
                    custom_file_name=str(body.get("custom_file_name", "")),
                    custom_file_content=str(
                        body.get("custom_file_content", "")
                    ),
                    target_user_ids=target_users,
                    target_team_agent_ids=target_teams,
                    user_id=body.get("user_id"),
                    force_needs_assistance=bool(
                        body.get("force_needs_assistance", False)
                    ),
                )
            )
            return

        if path == "/api/tickets/action":
            self._send_json(
                self.engine_instance.act_on_agent_ticket(
                    ticket_id=str(body.get("ticket_id", "")),
                    action=str(body.get("action", "approve_compromise")),
                    actor_user_id=body.get("actor_user_id"),
                    actor_ldap=str(
                        body.get("actor_ldap")
                        or body.get("ldap")
                        or body.get("email")
                        or ""
                    ),
                    comment=str(body.get("comment", "")),
                    updated_shared_file_content=body.get(
                        "updated_shared_file_content"
                    ),
                    updated_compromise_summary=body.get(
                        "updated_compromise_summary"
                    ),
                    followup_prompt=str(body.get("followup_prompt", "")),
                    h2h_message=str(body.get("h2h_message", "")),
                )
            )
            return

        if self._dispatch_governance_post(path, body):
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")

    def log_message(self, format: str, *args: Any) -> None:  # pylint: disable=redefined-builtin
        del format, args
        return

