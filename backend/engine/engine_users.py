"""User Authentication, 2-Account Sessions & Profile Settings Mixin.

Handles 2-account Cloud & Digital Marketing (DM) login (`login_user`,
`switch_environment`), profile settings (`update_user_settings`), and session
sign-out (`logout_user`), while inheriting account registration and agent
provisioning from `engine_registration.UserRegistrationMixin`.
"""

from __future__ import annotations

import copy
import datetime
import json
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_registration
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_registration
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.engine import engine_registration  # type: ignore
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS
PERSONAS = seed_data.PERSONAS


class UserAuthAndSettingsMixin(engine_registration.UserRegistrationMixin):
    """Mixin for user authentication, 2-account Cloud/DM sessions, and user settings."""

    store: Any
    workspace_tier: str
    active_environment: str
    auth_sessions: dict[str, dict[str, Any]]
    account_registry: dict[str, dict[str, Any]]
    file_environments: dict[str, str]
    current_user: dict[str, Any] | None
    user_agents: list[dict[str, Any]]
    demo_tour_seen: dict[str, bool]
    _sync_from_store: Any
    _append_turn: Any
    get_state: Any

    def login_user(
        self,
        persona_id: str = "",
        custom_ldap: str = "",
        custom_name: str = "",
        custom_role: str = "",
        default_lens: str = "all",
        workspace_tier: str = "collaborative",
        password: str = "",
        environment: str = "",
        require_password: bool = False,
    ) -> dict[str, Any]:
        """Authenticates a user via a preset Demo Account, Role Persona, or Registered Account."""
        if workspace_tier in ("collaborative", "personal"):
            self.workspace_tier = workspace_tier
            self.store.set_setting("workspace_tier", workspace_tier)

        clean_env = environment.strip().lower()
        all_users = self.store.list_users()
        matched = next((p for p in all_users if p["id"] == persona_id), None)
        if not matched and custom_ldap.strip():
            norm_ldap = custom_ldap.strip()
            if "@" not in norm_ldap:
                norm_ldap = f"{norm_ldap}@google.com"
            matched = next(
                (
                    p
                    for p in all_users
                    if p["ldap"].lower() == norm_ldap.lower()
                ),
                None,
            )
            if not matched:
                mapped_ldap = seed_data.LEGACY_ACCOUNT_LDAP_MAP.get(
                    norm_ldap.lower(), norm_ldap
                )
                matched = next(
                    (
                        p
                        for p in all_users
                        if p["ldap"].lower() == mapped_ldap.lower()
                    ),
                    None,
                )

        if matched:
            resolved_email = matched["ldap"]
        else:
            resolved_email = custom_ldap.strip() or "cloud_demo@google.com"
            if "@" not in resolved_email:
                resolved_email = f"{resolved_email}@google.com"
            resolved_email = seed_data.LEGACY_ACCOUNT_LDAP_MAP.get(
                resolved_email.lower(), resolved_email
            )

        if not matched:
            raise ValueError(
                f"Account '{resolved_email}' is not registered. Only demo accounts (cloud_demo@google.com, marketing_demo@google.com) or accounts created on the Sign-Up page can sign in."
            )

        if clean_env in ("cloud", "dm"):
            other_env = "dm" if clean_env == "cloud" else "cloud"
            other_sess = self.auth_sessions.get(other_env) or {}
            if (
                other_sess.get("authenticated")
                and str(other_sess.get("email", "")).lower()
                == resolved_email.lower()
            ):
                raise ValueError(
                    f"Cloud and Marketing require separate email sign-ins. '{resolved_email}' is already signed in for {other_env.upper()}."
                )

        email_lower = resolved_email.lower()
        reg_meta = self.account_registry.get(email_lower)
        expected_pwd = str(
            (reg_meta or {}).get("password")
            or matched.get("password")
            or (
                seed_data.DEMO_ACCOUNT_PASSWORD
                if email_lower in seed_data.DEMO_ACCOUNT_LDAPS
                else ""
            )
        )
        is_demo_account = email_lower in seed_data.DEMO_ACCOUNT_LDAPS
        is_registered_account = bool(
            str(matched.get("id", "")).startswith("user_")
            or (reg_meta and reg_meta.get("is_new_account"))
        )
        if (
            not is_demo_account
            and expected_pwd == engine_registration.RETIRED_GOOGLE_OAUTH_PASSWORD
        ):
            raise ValueError(
                f"'{resolved_email}' was auto-created by the old Google sign-in and can no longer sign in. Create a private account on the Sign-Up page with a different email."
            )

        if require_password:
            if not (is_demo_account or is_registered_account):
                raise ValueError(
                    f"Account '{resolved_email}' cannot sign in from the login page. Only demo accounts (cloud_demo@google.com, marketing_demo@google.com) or Sign-Up accounts can log in."
                )
            if not expected_pwd:
                raise ValueError(
                    f"'{resolved_email}' signs in with Google. Use the Sign in with Google button."
                    if (reg_meta or {}).get("auth_provider") == "google"
                    else f"'{resolved_email}' has no password. Use the Sign in with Google button."
                )
            if not password:
                raise ValueError(
                    f"Password is required to sign in as '{resolved_email}'."
                )
            if password != expected_pwd:
                raise ValueError(
                    f"Invalid password for account '{resolved_email}'."
                )
        elif password and expected_pwd and password != expected_pwd:
            raise ValueError(
                f"Invalid password for account '{resolved_email}'."
            )

        team_ag_id = matched.get("team_agent_id") or (
            matched["default_lens"]
            if matched.get("default_lens")
            in ("pm_agent", "brand_agent", "legal_agent", "commercial_agent")
            else "brand_agent"
        )
        self._ensure_personal_and_team_agent_for_user(
            matched, team_agent_id=team_ag_id
        )
        user_copy = copy.deepcopy(matched)
        if custom_name.strip():
            user_copy["name"] = custom_name.strip()
        if custom_role.strip():
            user_copy["role"] = custom_role.strip()
        if default_lens and default_lens != "all":
            user_copy["default_lens"] = default_lens
        if (
            reg_meta
            and reg_meta.get("is_new_account")
            and clean_env not in ("cloud", "dm")
        ):
            user_copy["is_new_account"] = True
            user_copy["environment"] = reg_meta.get(
                "environment", f"user:{matched['id']}"
            )
            self.active_environment = user_copy["environment"]
        elif clean_env in ("cloud", "dm"):
            user_copy["is_new_account"] = False
            user_copy["environment"] = clean_env
            self.active_environment = clean_env
        else:
            user_copy["is_new_account"] = False
            user_copy["environment"] = "all"
            self.active_environment = "all"
        self.store.set_setting(
            "active_environment", self.active_environment
        )
        self.current_user = user_copy

        if clean_env in ("cloud", "dm") and self.current_user:
            now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%d %H:%M UTC"
            )
            self.auth_sessions[clean_env] = {
                "authenticated": True,
                "email": self.current_user["ldap"],
                "user_id": self.current_user["id"],
                "name": self.current_user["name"],
                "role": self.current_user["role"],
                "environment": clean_env,
                "signed_in_at": now_str,
            }
            self.store.set_setting(
                "auth_sessions", json.dumps(self.auth_sessions)
            )

        demo_track = (
            clean_env
            if clean_env in ("cloud", "dm")
            else (
                "dm"
                if is_demo_account and seed_data.is_dm_account_ldap(email_lower)
                else ("cloud" if is_demo_account else "")
            )
        )
        first_demo_login = False
        if demo_track in ("cloud", "dm"):
            first_demo_login = not self.demo_tour_seen.get(demo_track, False)
            self.demo_tour_seen[demo_track] = True

        self._sync_from_store()
        assert self.current_user is not None
        self._append_turn(
            agent_id=self.current_user.get("team_agent_id", "pm_agent"),
            agent_name="Corp SSO Gateway",
            badge=self.current_user["badge"],
            turn_type="resolved",
            message=(
                f"Authenticated session for {self.current_user['name']} "
                f"(Account Track: {self.active_environment}, "
                f"Personal Agent: {self.current_user.get('personal_agent_id')}, "
                f"Team Agent: {self.current_user.get('team_agent_id')})."
            ),
        )
        state = self.get_state()
        state["account_id"] = matched["id"]
        if demo_track in ("cloud", "dm"):
            state["show_onboarding_tour"] = first_demo_login
            state["onboarding_tour_account"] = demo_track
        return state

    def switch_environment(self, environment: str) -> dict[str, Any]:
        """Switches between 'cloud' (Cloud User) and 'dm' (Digital Marketing User) accounts."""
        clean_env = (environment or "cloud").strip().lower()
        first_demo_login = False
        if clean_env in ("cloud", "dm"):
            first_demo_login = not self.demo_tour_seen.get(clean_env, False)
            self.demo_tour_seen[clean_env] = True
            self.active_environment = clean_env
            sess = self.auth_sessions.get(clean_env) or {}
            target_uid = sess.get("user_id")
            target_email = str(sess.get("email", "")).strip().lower()
            all_users = self.store.list_users()
            matched_u = None
            if target_uid:
                matched_u = next(
                    (u for u in all_users if u["id"] == target_uid), None
                )
            if not matched_u and target_email:
                matched_u = next(
                    (
                        u
                        for u in all_users
                        if str(u.get("ldap", "")).lower() == target_email
                    ),
                    None,
                )
            if matched_u:
                u_copy = copy.deepcopy(matched_u)
                u_copy["is_new_account"] = False
                u_copy["environment"] = clean_env
                self.current_user = u_copy
        elif clean_env.startswith("user:"):
            self.active_environment = clean_env
            target_uid = clean_env.split(":", 1)[1]
            all_users = self.store.list_users()
            matched_u = next(
                (u for u in all_users if u["id"] == target_uid), None
            )
            if matched_u:
                u_copy = copy.deepcopy(matched_u)
                u_copy["is_new_account"] = True
                u_copy["environment"] = clean_env
                self.current_user = u_copy
        elif clean_env == "all":
            self.active_environment = clean_env
        self.store.set_setting("active_environment", self.active_environment)
        self._sync_from_store()
        state = self.get_state()
        if clean_env in ("cloud", "dm"):
            state["show_onboarding_tour"] = first_demo_login
            state["onboarding_tour_account"] = clean_env
        return state

    def update_user_settings(
        self,
        email: str = "",
        name: str = "",
        role: str = "",
        department: str = "",
        nda_clearance: str = "",
        team_agent_id: str = "",
        personal_agent_name: str = "",
        workspace_tier: str = "",
        environment: str = "",
        user_id: str = "",
    ) -> dict[str, Any]:
        """Updates one account's profile & workspace settings in SQLite.

        The target row is resolved from `user_id` (then the Cloud/DM session) before
        falling back to the global `current_user`, so a settings save from one browser
        can never rewrite another account's row.
        """
        if workspace_tier in ("collaborative", "personal"):
            self.workspace_tier = workspace_tier
            self.store.set_setting("workspace_tier", workspace_tier)

        clean_env = (
            (environment or self.active_environment or "cloud").strip().lower()
        )
        all_users = self.store.list_users()
        clean_uid = (user_id or "").strip()
        target = next(
            (u for u in all_users if clean_uid and u["id"] == clean_uid), None
        )
        if not target and clean_env in ("cloud", "dm"):
            sess_uid = str(
                (self.auth_sessions.get(clean_env) or {}).get("user_id", "")
            )
            target = next(
                (u for u in all_users if sess_uid and u["id"] == sess_uid), None
            )
        cur = copy.deepcopy(target or self.current_user or PERSONAS[0])

        clean_email = email.strip().lower()
        if clean_email:
            if "@" not in clean_email:
                clean_email = f"{clean_email}@google.com"
            cur["ldap"] = clean_email
        if name.strip():
            cur["name"] = name.strip()
        if role.strip():
            cur["role"] = role.strip()
        if department.strip():
            cur["department"] = department.strip()
        if nda_clearance.strip():
            cur["nda_clearance"] = nda_clearance.strip()
        if team_agent_id in (
            "pm_agent",
            "brand_agent",
            "legal_agent",
            "commercial_agent",
        ):
            cur["team_agent_id"] = team_agent_id
            cur["default_lens"] = team_agent_id
        if personal_agent_name.strip():
            cur["personal_agent_name"] = personal_agent_name.strip()

        self.store.upsert_user(cur)
        self._ensure_personal_and_team_agent_for_user(
            cur,
            team_agent_id=cur.get("team_agent_id", "pm_agent"),
            custom_team_name=cur.get("department", ""),
        )
        if not self.current_user or self.current_user.get("id") == cur["id"]:
            self.current_user = cur

        if clean_env in ("cloud", "dm"):
            now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%d %H:%M UTC"
            )
            self.auth_sessions[clean_env] = {
                "authenticated": True,
                "email": cur["ldap"],
                "user_id": cur["id"],
                "name": cur["name"],
                "role": cur["role"],
                "environment": clean_env,
                "signed_in_at": now_str,
            }
            self.store.set_setting(
                "auth_sessions", json.dumps(self.auth_sessions)
            )

        self._sync_from_store()
        return self.get_state()

    def logout_user(self) -> dict[str, Any]:
        """Logs out the active user session and clears dual-auth Lock Screen sessions."""
        self.current_user = None
        self.auth_sessions = {
            "cloud": {"email": "", "name": "", "authenticated": False},
            "dm": {"email": "", "name": "", "authenticated": False},
        }
        self.active_environment = "all"
        self.store.set_setting("auth_sessions", json.dumps(self.auth_sessions))
        self.store.set_setting("active_environment", "all")
        return self.get_state()
