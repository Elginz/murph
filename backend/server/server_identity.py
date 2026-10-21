"""Which account a request acts as: always the visitor's server session.

The browser used to name its own account in each request body (`user_id`,
`ldap`, `environment`, ...), so anyone could act as anyone. Now
`apply_session_identity` overwrites those fields with the account behind the
visitor's `murph_sid` session before a route runs:

| Route                     | Fields set from the session                        |
|---------------------------|----------------------------------------------------|
| `/api/auth/update_profile`| `user_id`, `email`/`ldap` (locked), `environment`  |
| `/api/user/files/upload`  | `user_id`, `ldap`, `email`, `environment`          |
| `/api/agent/ask`          | `user_id`, `ldap`, `email`, `environment`          |
| `/api/tickets/create`     | `user_id`                                          |
| `/api/tickets/action`     | `actor_user_id`, `actor_ldap`, `ldap`, `email`     |
| `/api/workflows/create`   | `creator_user_id`, `environment`                   |
| `/api/workflows/delete`   | `requester_ldap`, `requester_env`                  |
| `/api/auth/switch_env`    | `environment` (`cloud`, `dm` or `user:<id>`)       |

`/api/user/files/delete` and `/api/workflows/delete` also get an ownership
check (`deletion_error`). Signed-out visitors get HTTP 401 on these routes,
except `/api/agent/ask`, which answers as the shared Cloud demo account so the
public Intro console keeps working (never as another visitor).

`overlay_viewer` adds `viewer_session` to state responses and swaps in the
viewer's own `current_user` / `active_environment`.
"""

from __future__ import annotations

from typing import Any

CLOUD_ACCOUNT_ID = "persona_creator"
DM_ACCOUNT_ID = "persona_brand"
_CLOUD_IDS = (CLOUD_ACCOUNT_ID, "user_owner")
_DM_IDS = (DM_ACCOUNT_ID, "user_brand")
IDENTITY_ROUTES = frozenset(
    {
        "/api/auth/update_profile",
        "/api/user/files/upload",
        "/api/user/files/delete",
        "/api/agent/ask",
        "/api/tickets/create",
        "/api/tickets/action",
        "/api/workflows/create",
        "/api/workflows/delete",
        "/api/auth/switch_env",
    }
)
# Routes a signed-out visitor may still call, acting as the Cloud demo account.
CLOUD_DEMO_WHEN_SIGNED_OUT = frozenset({"/api/agent/ask"})
PROFILE_KEYS = (
    "name",
    "role",
    "department",
    "team_agent_id",
    "personal_agent_id",
    "personal_agent_name",
    "nda_clearance",
)


def _low(value: Any) -> str:
    return str(value or "").strip().lower()


def account_key_for(account_id: Any) -> str:
    """Frontend account key: `cloud`, `dm` or the private `user_*` id."""
    uid = _low(account_id)
    if uid in _CLOUD_IDS:
        return "cloud"
    if uid in _DM_IDS:
        return "dm"
    return uid


def is_private_account(account_id: Any) -> bool:
    return account_key_for(account_id).startswith("user_")


def scoped_environment_for(account_id: Any) -> str:
    """Engine environment: `cloud`, `dm` or `user:<id>`."""
    key = account_key_for(account_id)
    return key if key in ("cloud", "dm") else f"user:{key}"


def apply_session_identity(path: str, body: dict[str, Any], account: dict[str, Any]) -> dict[str, Any]:
    """Copy of `body` whose identity fields all name `account` (a users row)."""
    uid = str(account.get("id") or "")
    email = _low(account.get("ldap"))
    key = account_key_for(uid)
    out = dict(body)
    if path == "/api/auth/update_profile":
        out.update(user_id=uid, email=email, ldap=email, environment=key)
    elif path in ("/api/user/files/upload", "/api/agent/ask"):
        out.update(user_id=uid, ldap=email, email=email, environment=key)
    elif path == "/api/tickets/create":
        out["user_id"] = uid
    elif path == "/api/tickets/action":
        out.update(actor_user_id=uid, actor_ldap=email, ldap=email, email=email)
    elif path == "/api/workflows/create":
        out.update(creator_user_id=uid, environment=key)
    elif path == "/api/workflows/delete":
        out.update(requester_ldap=email, requester_env=key)
    elif path == "/api/auth/switch_env":
        out["environment"] = scoped_environment_for(uid)
    return out


def deletion_error(
    path: str,
    body: dict[str, Any],
    account: dict[str, Any],
    files: list[dict[str, Any]],
    workflows: list[dict[str, Any]],
) -> str:
    """Why `account` may not delete the file/workflow in `body` ('' = allowed).

    Private accounts may only delete their own items, and nobody else may
    delete a private account's items. Shared demo items keep the engine's
    existing rules.
    """
    uid = _low(account.get("id"))
    email = _low(account.get("ldap"))
    if path == "/api/user/files/delete":
        file_id = str(body.get("file_id") or "")
        record = next((f for f in files if str(f.get("id")) == file_id), None)
        if record is None:
            return ""
        owner = _low(record.get("user_id"))
        if owner != uid and (is_private_account(owner) or is_private_account(uid)):
            return "You can only delete your own files."
    elif path == "/api/workflows/delete":
        wanted = str(body.get("folder_name") or "").strip().upper()
        record = next(
            (w for w in workflows if str(w.get("folder_name") or "").strip().upper() == wanted),
            None,
        )
        if record is None:
            return ""
        creator = _low(record.get("creator_user_id"))
        creator_ldap = _low(record.get("creator_ldap"))
        is_creator = (creator and creator == uid) or (creator_ldap and creator_ldap == email)
        if not is_creator and (is_private_account(creator) or is_private_account(uid)):
            return "Only the workflow's creator can delete it."
    return ""


def viewer_session_payload(account: dict[str, Any] | None, provider: str = "") -> dict[str, Any]:
    """The `viewer_session` block the frontend uses to restore who is signed in."""
    if not account:
        return {"signed_in": False}
    uid = str(account.get("id") or "")
    return {
        "signed_in": True,
        "account_key": account_key_for(uid),
        "account_id": uid,
        "email": _low(account.get("ldap")),
        "name": str(account.get("name") or ""),
        "provider": provider,
        "user": {k: account.get(k, "") for k in PROFILE_KEYS},
    }


def overlay_viewer(
    payload: dict[str, Any], account: dict[str, Any] | None, provider: str = ""
) -> dict[str, Any]:
    """Adds `viewer_session`; a signed-in viewer also gets its own current user."""
    out = dict(payload)
    out["viewer_session"] = viewer_session_payload(account, provider)
    if account:
        uid = str(account.get("id") or "")
        profile = {k: v for k, v in account.items() if k != "password"}
        profile["environment"] = scoped_environment_for(uid)
        profile["is_new_account"] = is_private_account(uid)
        if "current_user" in out:
            out["current_user"] = profile
        if "active_environment" in out:
            out["active_environment"] = profile["environment"]
    return out
