"""Google-only Murph accounts behind "Sign in with Google".

Google proves who the visitor is (see `backend/server/google_identity.py`);
this mixin maps that verified identity onto Murph's private `user_*` accounts:

- `resolve_google_sign_in(identity)`: the account linked to the Google account
  id (`google_sub`), else the private account with exactly that email. An
  existing password account is converted to Google-only (`link_google_account`
  retires its password). No match means the visitor must finish Sign-Up first.
- `register_google_account(identity, ...)`: Sign-Up for a verified Google
  identity. The email comes from Google, there is no password, and a unique
  `user_<slug>` / `agent_user_<slug>` pair is minted (e.g. `efch@google.com`
  becomes `user_efch_2`, because `agent_user_efch` is the Cloud demo's agent).

The two demo accounts never use Google sign-in, and the built-in role personas'
emails cannot be claimed.
"""

from __future__ import annotations

import datetime
import json
import re
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

GOOGLE_PROVIDER = "google"
MAX_SLUG_ATTEMPTS = 500


class GoogleAccountsMixin:
    """Mixin linking verified Google identities to private Murph accounts."""

    store: Any
    account_registry: dict[str, dict[str, Any]]
    register_user_account: Any

    def _save_account_registry(self) -> None:
        self.store.set_setting("account_registry", json.dumps(self.account_registry))

    @staticmethod
    def _reject_demo_google_email(email: str) -> None:
        if email in seed_data.DEMO_ACCOUNT_LDAPS:
            raise ValueError(
                "The Cloud and Marketing demo accounts don't use Google sign-in. "
                "Pick them from the User menu on the Lock Screen instead."
            )

    def resolve_google_sign_in(self, identity: dict[str, str]) -> dict[str, Any]:
        """Finds (and links) the account for a verified Google identity.

        Returns `{"status": "signed_in", "account_id": ...}` or
        `{"status": "needs_signup"}`.

        Raises:
          ValueError: demo or built-in persona email, or an account already
            linked to a different Google account.
        """
        email = str(identity.get("email") or "").strip().lower()
        sub = str(identity.get("sub") or "").strip()
        self._reject_demo_google_email(email)
        users = self.store.list_users()
        by_id = {str(u.get("id")): u for u in users}
        linked_id = next(
            (
                str(meta.get("user_id"))
                for meta in self.account_registry.values()
                if sub and meta.get("google_sub") == sub and str(meta.get("user_id")) in by_id
            ),
            "",
        )
        account = by_id.get(linked_id) if linked_id else next(
            (
                u
                for u in users
                if engine_registration.is_private_account_id(u.get("id"))
                and str(u.get("ldap") or "").strip().lower() == email
            ),
            None,
        )
        if account is None:
            if any(str(u.get("ldap") or "").strip().lower() == email for u in users):
                raise ValueError(
                    f"'{email}' belongs to a built-in Murph persona and can't be used to sign in."
                )
            return {"status": "needs_signup"}
        meta = self.account_registry.get(str(account.get("ldap") or "").lower()) or {}
        if meta.get("google_sub") and meta.get("google_sub") != sub:
            raise ValueError("This Murph account is linked to a different Google account.")
        self.link_google_account(account, identity)
        return {"status": "signed_in", "account_id": str(account["id"])}

    def link_google_account(self, account: dict[str, Any], identity: dict[str, str]) -> None:
        """Makes `account` Google-only: stores the Google id, retires any password."""
        key = str(account.get("ldap") or "").strip().lower()
        meta = dict(self.account_registry.get(key) or {})
        if not meta:
            meta = {
                "user_id": account["id"],
                "ldap": account.get("ldap", key),
                "name": account.get("name", ""),
                "role": account.get("role", ""),
                "department": account.get("department", ""),
                "team_agent_id": account.get("team_agent_id", "pm_agent"),
                "personal_agent_id": account.get("personal_agent_id", ""),
                "environment": f"user:{account['id']}",
                "is_new_account": True,
                "created_at": datetime.datetime.now(datetime.timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            }
        meta.update(
            password="",
            auth_provider=GOOGLE_PROVIDER,
            google_sub=str(identity.get("sub") or ""),
        )
        self.account_registry[key] = meta
        self._save_account_registry()
        if account.get("password"):
            self.store.set_user_password(str(account["id"]), "")

    def _mint_google_account_slug(self, email: str) -> str:
        """First free `<local part>[_N]` slug for a new Google account."""
        base = re.sub(r"[^a-z0-9_]", "_", email.split("@")[0].lower()).strip("_")
        base = base or "google_user"
        taken = {str(u.get("id") or "").lower() for u in self.store.list_users()}
        for attempt in range(1, MAX_SLUG_ATTEMPTS + 1):
            slug = base if attempt == 1 else f"{base}_{attempt}"
            user_id = f"user_{slug}"
            if user_id in taken or user_id in engine_registration.RESERVED_ACCOUNT_IDS:
                continue
            agent = self.store.get_user_agent(f"agent_user_{slug}")
            if agent and agent.get("owner_user_id") != user_id:
                continue
            return slug
        raise ValueError("Couldn't pick a username for this account. Try again.")

    def register_google_account(
        self, identity: dict[str, str], **profile: Any
    ) -> dict[str, Any]:
        """Creates a Google-only private account; returns the new state.

        `profile` takes `register_user_account`'s profile keywords (name, role,
        department, team_agent_id, personal_agent_name, initial_files,
        start_empty, ...). Email, password and environment are fixed here.

        Raises:
          ValueError: demo email, or the email already has an account.
        """
        email = str(identity.get("email") or "").strip().lower()
        self._reject_demo_google_email(email)
        if "@" not in email:
            raise ValueError("Google didn't share an email address for this account.")
        if any(str(u.get("ldap") or "").strip().lower() == email for u in self.store.list_users()):
            raise ValueError(f"'{email}' already has a Murph account. Use Sign in with Google.")
        for fixed in ("ldap", "password", "environment", "account_slug"):
            profile.pop(fixed, None)
        state = self.register_user_account(
            ldap=email,
            password="",
            environment="",
            account_slug=self._mint_google_account_slug(email),
            **profile,
        )
        meta = self.account_registry.get(email)
        if meta is not None:
            meta.update(auth_provider=GOOGLE_PROVIDER, google_sub=str(identity.get("sub") or ""))
            self._save_account_registry()
        return state
