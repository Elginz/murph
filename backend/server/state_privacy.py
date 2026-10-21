"""Per-visitor privacy filter for workspace-state JSON responses.

Every visitor shares one SQLite workspace. Only the two demo accounts (Cloud
`persona_creator`, Marketing `persona_brand`) and the seeded role personas are
shared. Each self-registered `user_*` account is private to whoever signs in
as it (with its password, or with Google).

`redact_state_for_viewer` hides every other private account from a viewer:

- its persona, agents, agent-mesh nodes and edges, and files;
- its terminal Q&A (`a2a_messages`);
- workflows and tickets that involve it but not the viewer;
- debate and memory log lines that name it.

Stored `password` fields are always dropped, whoever the viewer is. The viewer
is the account behind the request's server session (`server_sessions`), which
the browser cannot forge.
"""

from __future__ import annotations

from collections.abc import Callable
import json
import re
from typing import Any

CLOUD_VIEWER_IDS = ("persona_creator", "user_owner")
DM_VIEWER_IDS = ("persona_brand", "user_brand")
# Legacy frontend ids of the two demo accounts; never real (private) DB rows.
SHARED_PSEUDO_USER_IDS = ("user_owner", "user_brand")
# A JSON response is workspace state (and gets filtered) if it has any of these.
STATE_KEYS = (
    "personas",
    "current_user",
    "user_agents",
    "agent_mesh",
    "user_files",
    "all_user_files",
    "a2a_messages",
    "agent_tickets",
    "custom_workflows",
)
WORKFLOW_REF_KEYS = (
    "creator_user_id",
    "creator_ldap",
    "environment",
    "creator_env",
    "tagged_users",
    "tagged_user_ldaps",
    "explicit_tagged_ldaps",
    "approvals",
    "tagged_people_updates",
)
TICKET_REF_KEYS = (
    "requester_user_id",
    "requester_ldap",
    "requester_personal_agent_id",
    "participating_users",
    "participating_agents",
    "approvals",
    "shared_files",
    "compromise_proposal",
)
LOG_KEYS = ("debate_log", "memory_log")


def _low(value: Any) -> str:
    return str(value or "").strip().lower()


def is_private_user_id(user_id: Any) -> bool:
    """True for self-registered `user_*` account ids (not the demo pseudo-ids)."""
    uid = _low(user_id)
    return uid.startswith("user_") and uid not in SHARED_PSEUDO_USER_IDS


def normalize_viewer_key(raw: Any) -> str:
    """Maps an account key, user id or `user:<id>` env to `cloud`, `dm`, `user_*` or ''."""
    key = _low(raw)
    if key.startswith("user:"):
        key = key[len("user:") :]
    if key == "cloud" or key in CLOUD_VIEWER_IDS:
        return "cloud"
    if key == "dm" or key in DM_VIEWER_IDS:
        return "dm"
    return key if is_private_user_id(key) else ""


def looks_like_state(payload: Any) -> bool:
    return isinstance(payload, dict) and any(k in payload for k in STATE_KEYS)


def without_passwords(value: Any) -> Any:
    """Copy of `value` minus every `password` key; unchanged parts are shared."""
    if isinstance(value, dict):
        changed = "password" in value
        cleaned: dict[Any, Any] = {}
        for key, item in value.items():
            if key == "password":
                continue
            new_item = without_passwords(item)
            changed = changed or new_item is not item
            cleaned[key] = new_item
        return cleaned if changed else value
    if isinstance(value, list):
        cleaned_list = [without_passwords(item) for item in value]
        if any(new is not old for new, old in zip(cleaned_list, value)):
            return cleaned_list
    return value


def _collect_refs(value: Any, out: set[str]) -> None:
    """Adds every string and dict key inside `value` to `out`, lower-cased."""
    if isinstance(value, str):
        text = _low(value)
        out.add(text)
        if text.startswith("user:"):
            out.add(text[len("user:") :])
    elif isinstance(value, dict):
        for key, item in value.items():
            _collect_refs(str(key), out)
            _collect_refs(item, out)
    elif isinstance(value, list):
        for item in value:
            _collect_refs(item, out)


def _mention_pattern(tokens: set[str]) -> re.Pattern[str] | None:
    words = sorted((t for t in tokens if len(t) >= 3), key=len, reverse=True)
    if not words:
        return None
    alternatives = "|".join(re.escape(w) for w in words)
    return re.compile(rf"(?<![\w.-])(?:{alternatives})(?![\w-])", re.IGNORECASE)


def _keep(items: Any, hides: Callable[[dict[str, Any]], bool]) -> list[Any]:
    return [i for i in items or [] if not (isinstance(i, dict) and hides(i))]


def _clean_name(user: dict[str, Any]) -> str:
    return _low(str(user.get("name") or "").split("(")[0])


class _Scope:
    """The private accounts hidden from one viewer, and record tests for them."""

    def __init__(
        self,
        viewer: str,
        hidden: list[dict[str, Any]],
        users: list[dict[str, Any]],
        agents: list[dict[str, Any]],
    ) -> None:
        self.viewer = viewer
        self.hidden_ids = {_low(u.get("id")) for u in hidden}
        self.hidden_ldaps = {_low(u.get("ldap")) for u in hidden} - {""}
        hidden_agents = [a for a in agents if self.owns(a)]
        self.hidden_agent_ids = {_low(a.get("id")) for a in hidden_agents}
        self.hidden_agent_ids |= {_low(u.get("personal_agent_id")) for u in hidden}
        self.hidden_agent_ids.discard("")
        self.hidden_refs = self.hidden_ids | self.hidden_ldaps | self.hidden_agent_ids

        if viewer == "cloud":
            viewer_ids = set(CLOUD_VIEWER_IDS)
        elif viewer == "dm":
            viewer_ids = set(DM_VIEWER_IDS)
        else:
            viewer_ids = {viewer} - {""}
        viewer_users = [u for u in users if _low(u.get("id")) in viewer_ids]
        default_id = DM_VIEWER_IDS[0] if viewer == "dm" else CLOUD_VIEWER_IDS[0]
        self.viewer_user = next(iter(viewer_users), None) or next(
            (u for u in users if u.get("id") == default_id), None
        )
        self.viewer_refs = set(viewer_ids)
        for u in viewer_users:
            self.viewer_refs |= {_low(u.get("ldap")), _low(u.get("personal_agent_id"))}
        self.viewer_refs.discard("")

        tokens = set(self.hidden_refs)
        for u in hidden:
            local = _low(u.get("ldap")).split("@")[0]
            if len(local) >= 4 and re.search(r"[._\d]", local):
                tokens.add(local)
            if " " in _clean_name(u):
                tokens.add(_clean_name(u))
        for a in hidden_agents:
            if a.get("agent_type") == "personal" and " " in _low(a.get("name")):
                tokens.add(_low(a.get("name")))
        shown = [u for u in users if _low(u.get("id")) not in self.hidden_ids]
        tokens -= self.viewer_refs | {_clean_name(u) for u in shown}
        tokens -= {_low(a.get("name")) for a in agents if not self.owns(a)}
        self.mention = _mention_pattern(tokens)

    def owns(
        self,
        record: dict[str, Any],
        id_key: str = "owner_user_id",
        ldap_key: str = "owner_ldap",
    ) -> bool:
        return (
            _low(record.get(id_key)) in self.hidden_ids
            or _low(record.get(ldap_key)) in self.hidden_ldaps
        )

    def mentions(self, record: Any) -> bool:
        if self.mention is None:
            return False
        text = json.dumps(record, ensure_ascii=False, default=str)
        return bool(self.mention.search(text))

    def hides_user(self, user: dict[str, Any]) -> bool:
        return self.owns(user, "id", "ldap")

    def hides_agent(self, agent: dict[str, Any]) -> bool:
        return self.owns(agent) or _low(agent.get("id")) in self.hidden_agent_ids

    def hides_file(self, f: dict[str, Any]) -> bool:
        env = _low(f.get("environment"))
        return (
            self.owns(f, "user_id", "user_ldap")
            or _low(f.get("personal_agent_id")) in self.hidden_agent_ids
            or (env.startswith("user:") and env[len("user:") :] in self.hidden_ids)
        )

    def hides_record(self, record: dict[str, Any], keys: tuple[str, ...]) -> bool:
        """Workflows/tickets: hidden if they involve a hidden account, not the viewer."""
        refs: set[str] = set()
        for key in keys:
            _collect_refs(record.get(key), refs)
        return bool(refs & self.hidden_refs) and not refs & self.viewer_refs

    def hides_message(self, msg: dict[str, Any]) -> bool:
        if {_low(msg.get("user_id")), _low(msg.get("user_ldap"))} & self.viewer_refs:
            return False
        return self.owns(msg, "user_id", "user_ldap") or self.mentions(msg)

    def viewer_profile(self) -> dict[str, Any] | None:
        return without_passwords(self.viewer_user) if self.viewer_user else None

    def fallback_environment(self) -> str:
        if self.viewer in ("cloud", "dm"):
            return self.viewer
        return f"user:{self.viewer}" if self.viewer else "all"


def _resolve_viewer(viewer_key: str, users: list[dict[str, Any]]) -> str:
    key = _low(viewer_key)
    if "@" in key:
        match = next((u for u in users if _low(u.get("ldap")) == key), None)
        return normalize_viewer_key(match.get("id")) if match else ""
    key = normalize_viewer_key(key)
    if is_private_user_id(key) and not any(_low(u.get("id")) == key for u in users):
        return ""  # An unknown (e.g. reset) private account is just signed out.
    return key


def redact_state_for_viewer(
    payload: dict[str, Any],
    viewer_key: str,
    all_users: list[dict[str, Any]],
) -> dict[str, Any]:
    """Returns the part of a state payload that `viewer_key` may see.

    `viewer_key` is `cloud`, `dm`, a `user_*` id, a session email or '' (signed
    out); `all_users` is the full user table. The input is never mutated.
    """
    out = without_passwords(payload)
    out = dict(out) if out is payload else out
    if isinstance(out.get("adc_status"), dict):
        out["adc_status"] = {
            **out["adc_status"],
            "adc_path": "",
            "authenticated_email": "",
            "authenticated_name": "",
            "authenticated_ldap": "",
            "status_message": "",
        }
    users = [u for u in all_users or [] if isinstance(u, dict)]
    viewer = _resolve_viewer(viewer_key, users)
    hidden = [
        u for u in users if is_private_user_id(u.get("id")) and _low(u.get("id")) != viewer
    ]
    if not hidden:
        return out

    mesh = out.get("agent_mesh") if isinstance(out.get("agent_mesh"), dict) else {}
    agents = [
        a
        for a in list(out.get("user_agents") or []) + list(mesh.get("nodes") or [])
        if isinstance(a, dict)
    ]
    scope = _Scope(viewer, hidden, users, agents)

    if "personas" in out:
        out["personas"] = _keep(out["personas"], scope.hides_user)
    for key in ("current_user", "user"):
        if isinstance(out.get(key), dict) and scope.hides_user(out[key]):
            out[key] = scope.viewer_profile()
    env = _low(out.get("active_environment"))
    if env.startswith("user:") and env[len("user:") :] in scope.hidden_ids:
        out["active_environment"] = scope.fallback_environment()
    if isinstance(out.get("auth_sessions"), dict):
        out["auth_sessions"] = {
            name: (
                {"email": "", "name": "", "authenticated": False}
                if isinstance(sess, dict)
                and scope.owns(sess, "user_id", "email")
                else sess
            )
            for name, sess in out["auth_sessions"].items()
        }
    if "user_agents" in out:
        out["user_agents"] = _keep(out["user_agents"], scope.hides_agent)
    if mesh:
        nodes = _keep(mesh.get("nodes"), scope.hides_agent)
        kept = {_low(n.get("id")) for n in nodes if isinstance(n, dict)}
        dropped = {
            _low(n.get("id")) for n in mesh.get("nodes") or [] if isinstance(n, dict)
        } - kept
        edges = [
            e
            for e in mesh.get("edges") or []
            if not (
                isinstance(e, dict)
                and {_low(e.get("from_agent_id")), _low(e.get("to_agent_id"))} & dropped
            )
        ]
        out["agent_mesh"] = {
            **mesh,
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
    for key in ("user_files", "all_user_files"):
        if key in out:
            out[key] = _keep(out[key], scope.hides_file)
    if "custom_workflows" in out:
        out["custom_workflows"] = _keep(
            out["custom_workflows"], lambda w: scope.hides_record(w, WORKFLOW_REF_KEYS)
        )
    if "agent_tickets" in out:
        out["agent_tickets"] = _keep(
            out["agent_tickets"], lambda t: scope.hides_record(t, TICKET_REF_KEYS)
        )
    if "a2a_messages" in out:
        out["a2a_messages"] = _keep(out["a2a_messages"], scope.hides_message)
    for key in LOG_KEYS:
        if isinstance(out.get(key), list):
            out[key] = [entry for entry in out[key] if not scope.mentions(entry)]
    return out
