"""User Account Registration & Personal/Team Agent Provisioning Mixin.

Handles Personal/Team agent binding (`_ensure_personal_and_team_agent_for_user`)
and user account registration (`register_user_account`).
"""

from __future__ import annotations

import copy
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
PERSONAS = seed_data.PERSONAS

# Placeholder password of accounts the old "Sign in with Google" auto-created
# from whatever Google identity the server saw; those accounts were never set up
# by their owner, so they can no longer sign in and Sign Up refuses it.
RETIRED_GOOGLE_OAUTH_PASSWORD = "GOOGLE_OAUTH_ADC_VERIFIED"
# Old ids of the two demo accounts; Sign Up must never mint them.
RESERVED_ACCOUNT_IDS = ("user_owner", "user_brand")


def is_private_account_id(user_id: Any) -> bool:
    """True for a self-registered (Sign-Up) account; such accounts are private."""
    uid = str(user_id or "").strip().lower()
    return uid.startswith("user_") and uid not in RESERVED_ACCOUNT_IDS


class UserRegistrationMixin:
    """Mixin for Personal/Team agent provisioning and user registration."""

    store: Any
    workspace_tier: str
    active_environment: str
    account_registry: dict[str, dict[str, Any]]
    auth_sessions: dict[str, dict[str, Any]]
    file_environments: dict[str, str]
    current_user: dict[str, Any] | None
    user_agents: list[dict[str, Any]]
    custom_workflows: list[dict[str, Any]]
    _sync_from_store: Any
    _append_turn: Any
    get_state: Any

    def _ensure_personal_and_team_agent_for_user(
        self,
        user: dict[str, Any],
        team_agent_id: str = "pm_agent",
        custom_team_name: str = "",
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Ensures a Personal Agent exists for `user` and is bound to a Team Agent in SQLite."""
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        all_agents = self.store.list_user_agents()
        team_ag = next(
            (
                a
                for a in all_agents
                if a["id"] == team_agent_id and a["agent_type"] == "team"
            ),
            None,
        )
        if not team_ag:
            clean_team_id = re.sub(
                r"[^a-z0-9_]", "_", (team_agent_id or "pm_agent").lower()
            )
            if not clean_team_id.endswith("_agent"):
                clean_team_id = f"{clean_team_id}_agent"
            team_ag = next(
                (a for a in all_agents if a["id"] == clean_team_id),
                None,
            )
            if not team_ag:
                t_label = (
                    custom_team_name.strip()
                    or user.get("department")
                    or "Custom Cross-Functional Team"
                )
                team_ag = {
                    "id": clean_team_id,
                    "agent_type": "team",
                    "name": f"{t_label} Team Agent",
                    "owner_user_id": user["id"],
                    "owner_ldap": user["ldap"],
                    "team_id": f"team_{clean_team_id.replace('_agent', '')}",
                    "team_name": t_label,
                    "parent_team_agent_id": clean_team_id,
                    "specialty": f"Team Governance & Shared Knowledge for {t_label}",
                    "badge": "TEAM-AG",
                    "created_at": now_str,
                }
                self.store.upsert_user_agent(team_ag)

        slug = re.sub(
            r"[^a-z0-9_]", "_", user["ldap"].split("@")[0].lower()
        ).strip("_")
        personal_id = user.get("personal_agent_id") or f"agent_user_{slug}"
        short_name = user["name"].split("(")[0].strip()
        existing_personal = self.store.get_user_agent(personal_id)
        personal_ag = {
            "id": personal_id,
            "agent_type": "personal",
            "name": user.get("personal_agent_name")
            or (
                existing_personal["name"]
                if existing_personal
                else f"{short_name}'s Personal Agent"
            ),
            "owner_user_id": user["id"],
            "owner_ldap": user["ldap"],
            "team_id": team_ag["team_id"],
            "team_name": team_ag["team_name"],
            "parent_team_agent_id": team_ag["id"],
            "specialty": user.get("personal_agent_specialty")
            or (
                existing_personal["specialty"]
                if existing_personal
                else f"Personal Agent for {user['name']} ({user['role']})"
            ),
            "badge": "USER-AG",
            "created_at": now_str,
        }
        self.store.upsert_user_agent(personal_ag)
        user["personal_agent_id"] = personal_id
        user["team_agent_id"] = team_ag["id"]
        self.store.upsert_user(user)
        self.user_agents = self.store.list_user_agents()
        return personal_ag, team_ag

    def _check_new_account_allowed(
        self, clean_ldap: str, slug: str, user_id: str, password: str
    ) -> None:
        """Raises `ValueError` when Sign Up must not create `user_id`.

        Rejects an empty username, the retired Google auto-sign-up password,
        the demo accounts' current/legacy emails and old ids, an email or
        username that already has an account (sign in instead), and a username
        whose personal agent id belongs to someone else (e.g. `efch@x.com`
        would otherwise overwrite the Cloud demo's `agent_user_efch`).
        """
        email_lower = clean_ldap.lower()
        if not slug:
            raise ValueError("Enter a valid work email to create an account.")
        if password == RETIRED_GOOGLE_OAUTH_PASSWORD:
            raise ValueError("Choose a different password.")
        if (
            user_id in RESERVED_ACCOUNT_IDS
            or email_lower in seed_data.DEMO_ACCOUNT_LDAPS
            or email_lower in seed_data.LEGACY_ACCOUNT_LDAP_MAP
        ):
            raise ValueError(
                f"'{clean_ldap}' is reserved for the demo accounts. Use a different email."
            )
        all_users = self.store.list_users()
        if any(str(u.get("ldap", "")).lower() == email_lower for u in all_users):
            raise ValueError(
                f"'{clean_ldap}' already has an account. Sign in instead."
            )
        if any(u.get("id") == user_id for u in all_users):
            raise ValueError(
                f"The username '{slug}' is already taken. Use a different email."
            )
        agent = self.store.get_user_agent(f"agent_user_{slug}")
        if agent and agent.get("owner_user_id") != user_id:
            raise ValueError(
                f"The username '{slug}' is reserved. Use a different email."
            )

    def register_user_account(
        self,
        ldap: str,
        name: str = "",
        role: str = "",
        department: str = "",
        org: str = "",
        team_agent_id: str = "pm_agent",
        personal_agent_name: str = "",
        personal_agent_specialty: str = "",
        workspace_tier: str = "collaborative",
        uploaded_files: list[dict[str, Any]] | None = None,
        initial_files: list[dict[str, Any]] | None = None,
        require_initial_file: bool = False,
        password: str = "",
        environment: str = "",
        start_empty: bool = False,
        account_slug: str = "",
    ) -> dict[str, Any]:
        """Creates a new user account, provisions their Personal Agent, binds them to a Team Agent, and initializes their isolated user state.

        `account_slug` is only passed by `register_google_account`, which has
        already validated it, so the Sign-Up checks are skipped for it.
        """
        files_to_ingest = (
            []
            if start_empty
            else (
                uploaded_files
                if uploaded_files is not None
                else (initial_files or [])
            )
        )
        valid_files = [
            f
            for f in files_to_ingest
            if isinstance(f, dict) and str(f.get("content", "")).strip()
        ]
        if require_initial_file and not valid_files:
            raise ValueError(
                "Account creation requires creating a Personal Agent and uploading at least one reference file (.txt, .md, .csv, .json, or inline document) to initialize your agent's knowledge base."
            )

        clean_ldap = (ldap or "new.user@google.com").strip()
        if "@" not in clean_ldap:
            clean_ldap = f"{clean_ldap}@google.com"
        username_part = clean_ldap.split("@")[0]
        slug = account_slug or re.sub(r"[^a-z0-9_]", "_", username_part.lower()).strip("_")
        user_id = f"user_{slug}"
        if not account_slug:
            self._check_new_account_allowed(clean_ldap, slug, user_id, password)

        if workspace_tier in ("collaborative", "personal"):
            self.workspace_tier = workspace_tier
            self.store.set_setting("workspace_tier", workspace_tier)

        display_role = (role or "Cloud Launch Stakeholder").strip()
        clean_person_name = (
            name.strip() or username_part.replace(".", " ").title()
        )
        display_name = (
            f"{clean_person_name} ({display_role})"
            if "(" not in clean_person_name
            else clean_person_name
        )

        target_team_agent_id = (
            team_agent_id.strip() if team_agent_id.strip() else "pm_agent"
        )
        matched_core_agent = next(
            (a for a in AGENTS if a["id"] == target_team_agent_id), None
        )
        dept_name = (
            department.strip()
            or org.strip()
            or (
                matched_core_agent["owner_team"]
                if matched_core_agent
                else "Google Cloud & Marketing"
            )
        )
        lens = (
            target_team_agent_id
            if target_team_agent_id
            in ("pm_agent", "brand_agent", "legal_agent", "commercial_agent")
            else "all"
        )
        personal_agent_id = f"agent_user_{slug}"

        seed_persona_ldaps = {p["ldap"].lower() for p in PERSONAS}
        is_seed_ldap = (
            clean_ldap.lower() in seed_persona_ldaps and not start_empty
        )
        clean_env = environment.strip().lower()
        if clean_env in ("cloud", "dm"):
            target_env = clean_env
            is_new_account = bool(start_empty)
        elif is_seed_ldap and not valid_files:
            target_env = "all"
            is_new_account = False
        else:
            target_env = f"user:{user_id}"
            is_new_account = True

        new_user: dict[str, Any] = {
            "id": user_id,
            "ldap": clean_ldap,
            "name": display_name,
            "role": display_role,
            "department": dept_name,
            "default_lens": lens,
            "default_stage": "2"
            if lens in ("legal_agent", "commercial_agent")
            else "1",
            "nda_clearance": "Tier-2 Cleared"
            if self.workspace_tier == "collaborative"
            else "Personal Sandbox (Strict Local)",
            "badge": matched_core_agent["badge"]
            if matched_core_agent
            else "USER",
            "description": f"Account bound to {personal_agent_id} and Team Agent {target_team_agent_id}.",
            "personal_agent_id": personal_agent_id,
            "team_agent_id": target_team_agent_id,
            "personal_agent_name": personal_agent_name.strip(),
            "personal_agent_specialty": personal_agent_specialty.strip(),
            "is_new_account": is_new_account,
            "environment": target_env,
            "password": password,
        }

        personal_ag, team_ag = self._ensure_personal_and_team_agent_for_user(
            new_user,
            team_agent_id=target_team_agent_id,
            custom_team_name=dept_name,
        )

        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        if is_new_account or password:
            if start_empty:
                for existing_f in list(self.store.list_user_files()):
                    if existing_f.get("user_id") == user_id:
                        self.store.delete_user_file(existing_f["id"])
            self.account_registry[clean_ldap.lower()] = {
                "user_id": user_id,
                "ldap": clean_ldap,
                "name": display_name,
                "role": display_role,
                "department": dept_name,
                "team_agent_id": target_team_agent_id,
                "personal_agent_id": personal_agent_id,
                "password": password,
                "environment": target_env,
                "is_new_account": is_new_account,
                "created_at": now_str,
            }
            self.store.set_setting(
                "account_registry", json.dumps(self.account_registry)
            )

        self.active_environment = target_env
        self.store.set_setting("active_environment", self.active_environment)
        self.current_user = copy.deepcopy(new_user)

        saved_filenames: list[str] = []
        for idx, raw_f in enumerate(valid_files):
            fname = str(raw_f.get("filename", "")).strip()
            fcontent = str(raw_f.get("content", "")).strip()
            if not fname:
                fname = f"{slug}_knowledge_doc_{idx + 1}.md"
            file_id = (
                f"FILE-{slug.upper()[:8]}-{len(self.store.list_user_files()) + 1}"
            )
            file_record = {
                "id": file_id,
                "user_id": new_user["id"],
                "user_ldap": new_user["ldap"],
                "personal_agent_id": personal_ag["id"],
                "team_agent_id": team_ag["id"],
                "team_name": team_ag["team_name"],
                "filename": fname,
                "content": fcontent,
                "visibility": str(raw_f.get("visibility", "federated")),
                "uploaded_at": now_str,
            }
            self.file_environments[file_id] = target_env
            self.file_environments[fname] = target_env
            self.store.add_user_file(file_record)
            saved_filenames.append(fname)

        if saved_filenames:
            self.store.set_setting(
                "file_environments", json.dumps(self.file_environments)
            )

        self._sync_from_store()
        files_note = (
            f" Indexed {len(saved_filenames)} uploaded file(s) ({', '.join(saved_filenames)}) under {personal_ag['name']}."
            if saved_filenames
            else " Initialized with an empty file state (0 pre-existing files)."
        )
        self._append_turn(
            agent_id=team_ag["id"]
            if any(a["id"] == team_ag["id"] for a in AGENTS)
            else "pm_agent",
            agent_name=personal_ag["name"],
            badge=new_user["badge"],
            turn_type="resolved",
            message=(
                f"Account created for {new_user['name']} ({new_user['ldap']}). "
                f"Provisioned '{personal_ag['name']}' and linked to Team Agent '{team_ag['name']}' ({team_ag['team_name']})."
                f"{files_note}"
            ),
        )
        state = self.get_state()
        state["account_id"] = user_id
        return state

    def reset_registered_accounts(self) -> dict[str, Any]:
        """Deletes every self-registered `user_*` account and everything it owns.

        Removes the user rows, their Personal/Team agents, files, custom workflows,
        tickets, `account_registry` entries, dual-auth sessions and `user:*`
        environments. Built-in Cloud/DM personas and seed data are untouched.
        Refreshes the engine's in-memory caches so no server restart is needed.
        """
        removed_ids: list[str] = []
        removed_ldaps: set[str] = set()
        for u in self.store.list_users():
            uid = str(u.get("id", ""))
            if not uid.startswith("user_"):
                continue
            removed_ids.append(uid)
            removed_ldaps.add(str(u.get("ldap", "")).lower())
            self.store.delete_user(uid)
        removed = set(removed_ids)

        for ag in self.store.list_user_agents():
            if ag.get("owner_user_id") in removed:
                self.store.delete_user_agent(ag["id"])

        removed_files = 0
        for uf in self.store.list_user_files():
            if uf.get("user_id") in removed:
                self.store.delete_user_file(uf["id"])
                self.file_environments.pop(uf["id"], None)
                self.file_environments.pop(uf.get("filename", ""), None)
                removed_files += 1
        self.file_environments = {
            k: v for k, v in self.file_environments.items() if not str(v).startswith("user:")
        }
        self.store.set_setting("file_environments", json.dumps(self.file_environments))

        kept_workflows = [
            w
            for w in self.custom_workflows
            if w.get("creator_user_id") not in removed
            and not str(w.get("environment", "")).startswith("user:")
            and str(w.get("creator_ldap", "")).lower() not in removed_ldaps
        ]
        removed_workflows = len(self.custom_workflows) - len(kept_workflows)
        self.custom_workflows = kept_workflows
        self.store.set_setting("custom_workflows", json.dumps(self.custom_workflows))

        removed_tickets = 0
        for t in self.store.list_tickets():
            participants = {str(p.get("user_id", "")) for p in t.get("participating_users", [])}
            if t.get("requester_user_id") in removed or participants & removed:
                self.store.delete_ticket(t["id"])
                removed_tickets += 1

        self.account_registry = {
            k: v
            for k, v in self.account_registry.items()
            if v.get("user_id") not in removed and k.lower() not in removed_ldaps
        }
        self.store.set_setting("account_registry", json.dumps(self.account_registry))

        for env_key, sess in list(self.auth_sessions.items()):
            if sess.get("user_id") in removed or str(sess.get("email", "")).lower() in removed_ldaps:
                self.auth_sessions[env_key] = {"email": "", "name": "", "authenticated": False}
        self.store.set_setting("auth_sessions", json.dumps(self.auth_sessions))

        if str(self.active_environment).startswith("user:"):
            self.active_environment = "all"
            self.store.set_setting("active_environment", "all")
        if not self.current_user or self.current_user.get("id") in removed:
            seed_users = self.store.list_users()
            self.current_user = copy.deepcopy(
                next((u for u in seed_users if u["id"] == PERSONAS[0]["id"]), seed_users[0])
            )

        self._sync_from_store()
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Murph Workspace Admin",
            badge="ADMIN",
            turn_type="resolved",
            message=(
                f"Reset {len(removed_ids)} self-registered account(s): "
                f"removed {removed_files} file(s), {removed_workflows} workflow(s) and {removed_tickets} ticket(s)."
            ),
        )
        state = self.get_state()
        state["reset_registered_summary"] = {
            "removed_accounts": len(removed_ids),
            "removed_files": removed_files,
            "removed_workflows": removed_workflows,
            "removed_tickets": removed_tickets,
        }
        return state
