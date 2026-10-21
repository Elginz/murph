"""File Vault Upload/Deletion & Google Drive ADC Integration Mixin.

Handles uploading and deleting user files (`upload_user_file`, `delete_user_file`),
configuring Google ADC (`configure_google_adc`), the demo-only "Sign in with
Google" (`login_with_google_adc`: Cloud & Marketing demo accounts only; private
accounts come from Sign Up), and querying/importing Google Drive files
(`query_google_drive`, `import_google_drive_file`).
"""

from __future__ import annotations

import datetime
import json
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS

# "Sign in with Google" chooser: email -> (persona id, account track). These two
# shared demo accounts are the only identities Google sign-in can open.
GOOGLE_DEMO_ACCOUNTS: dict[str, tuple[str, str]] = {
    seed_data.CLOUD_ACCOUNT_LDAP: ("persona_creator", "cloud"),
    seed_data.DM_ACCOUNT_LDAP: ("persona_brand", "dm"),
}


class FileVaultAndDriveMixin:
    """Mixin for user file uploads/deletions and Google Drive v3 ADC integration."""

    store: Any
    drive_adc: Any
    last_drive_results: dict[str, Any]
    active_environment: str
    file_environments: dict[str, str]
    current_user: dict[str, Any] | None
    custom_file_descriptions: dict[str, str]
    get_state: Any
    _ensure_personal_and_team_agent_for_user: Any
    _sync_from_store: Any
    _append_turn: Any
    analyze_custom_document: Any
    login_user: Any

    def upload_user_file(
        self,
        filename: str,
        content: str,
        file_type: str = "txt",
        tags: list[str] | str = "",
        visibility: str = "federated",
        user_id: str | None = None,
        also_analyze_in_project: bool = False,
        environment: str = "",
        ldap: str = "",
    ) -> dict[str, Any]:
        """Uploads a file under the specified (or currently logged-in) user, indexing it under their Personal Agent and Team Agent.

        The browser's identity (`user_id`, then `ldap`) wins over the server's
        single global session so a self-registered account's upload never
        lands on whoever logged in last. `environment` accepts the frontend
        account key `user_<slug>` as well as the backend form `user:<id>`.
        """
        _ = file_type
        clean_content = content.strip()
        if not clean_content:
            return self.get_state()

        all_users = self.store.list_users()
        target_user = None
        if user_id:
            target_user = next(
                (u for u in all_users if u["id"] == user_id), None
            )
        clean_ldap = (ldap or "").strip().lower()
        if not target_user and clean_ldap:
            target_user = next(
                (u for u in all_users if str(u.get("ldap", "")).lower() == clean_ldap),
                None,
            )
        if not target_user and self.current_user:
            target_user = self.current_user
        if not target_user:
            target_user = all_users[0]

        personal_ag, team_ag = self._ensure_personal_and_team_agent_for_user(
            target_user,
            team_agent_id=target_user.get("team_agent_id", "pm_agent"),
        )
        slug = re.sub(
            r"[^a-z0-9_]", "_", target_user["ldap"].split("@")[0].lower()
        ).strip("_")
        clean_fname = (
            filename.strip()
            or f"{slug}_file_{len(self.store.list_user_files()) + 1}.md"
        )
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        clean_env = environment.strip().lower()
        registry_meta = getattr(self, "account_registry", {}).get(
            str(target_user.get("ldap", "")).lower(), {}
        )
        is_registered_account = bool(
            target_user.get("is_new_account")
            or (registry_meta or {}).get("is_new_account")
            or str(target_user.get("id", "")).startswith("user_")
        )
        if clean_env in ("cloud", "dm") or clean_env.startswith("user:"):
            resolved_env = clean_env
        elif clean_env.startswith("user_"):  # frontend account key → backend env
            resolved_env = f"user:{clean_env}"
        elif is_registered_account:  # isolated desktop regardless of the global session
            resolved_env = f"user:{target_user['id']}"
        elif self.active_environment in ("cloud", "dm") or self.active_environment.startswith("user:"):
            resolved_env = self.active_environment
        elif team_ag["id"] == "brand_agent":
            resolved_env = "dm"
        else:
            resolved_env = "cloud"

        norm_fname = clean_fname.lower()
        norm_leaf = norm_fname.rsplit("/", 1)[-1]
        existing_matches = [
            ef
            for ef in self.store.list_user_files()
            if (
                str(ef.get("filename", "")).strip().lower() == norm_fname
                or str(ef.get("filename", "")).strip().lower().rsplit("/", 1)[-1]
                == norm_leaf
            )
            and (
                ef.get("user_id") == target_user["id"]
                or self.file_environments.get(ef["id"]) == resolved_env
                or self.file_environments.get(ef.get("filename", "")) == resolved_env
                or ef["id"] in getattr(self, "DEFAULT_FILE_ENVIRONMENTS", {})
            )
        ]
        if existing_matches:
            file_id = existing_matches[0]["id"]
            for dup in existing_matches[1:]:
                self.store.delete_user_file(dup["id"])
        else:
            file_id = f"FILE-{slug.upper()[:8]}-{len(self.store.list_user_files()) + 1}"

        file_record = {
            "id": file_id,
            "user_id": target_user["id"],
            "user_ldap": target_user["ldap"],
            "personal_agent_id": personal_ag["id"],
            "team_agent_id": team_ag["id"],
            "team_name": team_ag["team_name"],
            "filename": clean_fname,
            "content": clean_content,
            "visibility": visibility
            if visibility in ("federated", "private")
            else "federated",
            "uploaded_at": now_str,
        }
        self.file_environments[file_id] = resolved_env
        self.file_environments[clean_fname] = resolved_env
        self.store.set_setting(
            "file_environments", json.dumps(self.file_environments)
        )
        if isinstance(tags, list):
            desc_str = ", ".join(str(t).strip() for t in tags if str(t).strip())
        else:
            desc_str = str(tags or "").strip()
        if desc_str:
            self.custom_file_descriptions[file_id] = desc_str
            self.custom_file_descriptions[clean_fname] = desc_str
            self.store.set_setting(
                "custom_file_descriptions",
                json.dumps(self.custom_file_descriptions),
            )
        self.store.add_user_file(file_record)
        self._sync_from_store()
        self._append_turn(
            agent_id=team_ag["id"]
            if any(a["id"] == team_ag["id"] for a in AGENTS)
            else "pm_agent",
            agent_name=personal_ag["name"],
            badge="FILE",
            turn_type="scrub",
            message=(
                f"Uploaded '{clean_fname}' ({len(clean_content)} chars) under {target_user['ldap']} [{resolved_env}]. "
                f"Indexed by {personal_ag['name']} and shared with {team_ag['name']} ({file_record['visibility']})."
            ),
        )
        if also_analyze_in_project:
            return self.analyze_custom_document(clean_content)
        return self.get_state()

    def delete_user_file(self, file_id: str) -> dict[str, Any]:
        """Deletes a user-uploaded file from SQLite."""
        self.store.delete_user_file(file_id)
        self._sync_from_store()
        return self.get_state()

    def configure_google_adc(
        self,
        access_token: str = "",
        quota_project_id: str = "",
        target_user: str = "",
    ) -> dict[str, Any]:
        """Configures runtime ADC token/project overrides and refreshes Drive connection status."""
        status = self.drive_adc.configure(
            access_token=access_token,
            quota_project_id=quota_project_id,
            target_user=target_user,
        )
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Google ADC Gateway",
            badge="ADC",
            turn_type="resolved",
            message=status["status_message"],
        )
        return self.get_state()

    def login_with_google_adc(
        self,
        email: str = "",
        name: str = "",
        role: str = "",
        department: str = "",
        team_agent_id: str = "pm_agent",
        workspace_tier: str = "collaborative",
        access_token: str = "",
        quota_project_id: str = "",
        target_user: str = "",
        auto_query_drive: bool = False,
    ) -> dict[str, Any]:
        """Signs in to one of the two shared demo accounts via "Sign in with Google".

        Only `GOOGLE_DEMO_ACCOUNTS` (Cloud and Marketing demo) are accepted; any
        other email (including an empty one) raises `ValueError` before ADC is
        touched, so nobody's own Google identity is listed, looked up or
        auto-registered. Private accounts are created on the Sign-Up page.
        `name`/`role`/`department`/`team_agent_id` are accepted for API
        compatibility and ignored: the demo personas define them.
        """
        del name, role, department, team_agent_id
        clean_email = (email or "").strip().lower()
        if clean_email and "@" not in clean_email:
            clean_email = f"{clean_email}@google.com"
        demo = GOOGLE_DEMO_ACCOUNTS.get(clean_email)
        if not demo:
            raise ValueError(
                "Sign in with Google only opens the Cloud and Marketing demo "
                f"accounts ({seed_data.CLOUD_ACCOUNT_LDAP}, "
                f"{seed_data.DM_ACCOUNT_LDAP}). Use Sign Up to create your own "
                "private workspace."
            )
        persona_id, account_key = demo
        if access_token or quota_project_id or target_user:
            self.drive_adc.configure(
                access_token=access_token,
                quota_project_id=quota_project_id,
                target_user=target_user,
            )
        adc_status: dict[str, Any] = {}
        if auto_query_drive:
            adc_status = self.drive_adc.get_status(
                force_refresh=True, probe_network=True
            )
            self.last_drive_results = self.drive_adc.search_files(
                query="", page_size=8
            )

        state = self.login_user(
            persona_id=persona_id,
            custom_ldap=clean_email,
            workspace_tier=workspace_tier,
            environment=account_key,
            require_password=False,
        )
        user = self.current_user or {}
        team_id = str(user.get("team_agent_id") or "")
        track_label = "Marketing" if account_key == "dm" else "Cloud"
        self._append_turn(
            agent_id=team_id
            if any(a["id"] == team_id for a in AGENTS)
            else "pm_agent",
            agent_name="Google Account API (OAuth2 / ADC)",
            badge="GOOGLE-AUTH",
            turn_type="resolved",
            message=(
                f"Signed in with Google as {user.get('name') or clean_email} "
                f"({clean_email}) on the {track_label} demo workspace."
            ),
        )
        final_state = self.get_state()
        for key in ("show_onboarding_tour", "onboarding_tour_account"):
            if key in state:
                final_state[key] = state[key]
        final_state["user"] = self.current_user
        final_state["account_key"] = account_key
        final_state["google_auth"] = {
            "authenticated_email": clean_email,
            "authenticated_name": str(user.get("name") or ""),
            "account_key": account_key,
            "is_new_account": False,
            "adc_status": adc_status,
        }
        return final_state

    def query_google_drive(
        self,
        query: str = "",
        mime_filter: str = "all",
        page_size: int = 12,
    ) -> dict[str, Any]:
        """Queries the user's Google Drive via ADC and stores the results in engine state."""
        res = self.drive_adc.search_files(
            query=query, mime_filter=mime_filter, page_size=page_size
        )
        self.last_drive_results = res
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Google Drive ADC Connector",
            badge="DRIVE",
            turn_type="sim",
            message=res["message"],
        )
        return self.get_state()

    def import_google_drive_file(
        self,
        file_id: str,
        mime_type: str = "",
        file_name: str = "",
        visibility: str = "federated",
        also_analyze_in_project: bool = False,
    ) -> dict[str, Any]:
        """Exports a Google Drive file via ADC and indexes it under the user's Personal Agent & Team Agent."""
        fname, fcontent, note = self.drive_adc.fetch_file_content(
            file_id=file_id, mime_type=mime_type, file_name=file_name
        )
        state = self.upload_user_file(
            filename=fname,
            content=fcontent,
            visibility=visibility,
            also_analyze_in_project=also_analyze_in_project,
        )
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Google Drive ADC Importer",
            badge="DRIVE",
            turn_type="scrub",
            message=f"{note} Indexed '{fname}' under Personal Agent.",
        )
        return state
