"""SQLite CRUD Mixin for Settings, Users, Personal/Team Agents, Files & A2A Logs.

Provides thread-safe SQLite (and JSON fallback) operations for:
- Application settings (`get_setting`, `set_setting`)
- Users & Role Personas (`list_users`, `upsert_user`, `delete_user`)
- Personal & Team Agents (`list_user_agents`, `get_user_agent`, `upsert_user_agent`, `delete_user_agent`)
- Federated User Files (`list_user_files`, `add_user_file`, `delete_user_file`)
- Cross-Team A2A Outreach Logs (`get_a2a_messages`, `insert_a2a_message`)
"""

from __future__ import annotations

import copy
import json
import threading
from typing import Any


# Keys stored in dedicated a2a_messages columns; everything else goes to meta_json.
_A2A_COLUMN_KEYS = frozenset(
    {
        "seq",
        "id",
        "timestamp",
        "user_id",
        "user_name",
        "personal_agent_id",
        "personal_agent_name",
        "team_agent_id",
        "team_agent_name",
        "question",
        "hops",
        "hops_json",
        "final_answer",
        "meta_json",
    }
)


class StorageUsersAndFilesMixin:
    """Mixin for Settings, Users, Agents, Files, and A2A Logs persistence."""

    _lock: threading.RLock
    _use_sqlite: bool
    _conn: Any
    _doc_store: dict[str, Any]
    _save_json_fallback: Any

    def get_setting(self, key: str, default: str = "") -> str:
        with self._lock:
            if not self._use_sqlite:
                return str(self._doc_store["app_settings"].get(key, default))
            row = self._conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (key,)
            ).fetchone()
            return str(row["value"]) if row else default

    def set_setting(self, key: str, value: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["app_settings"][key] = value
                self._save_json_fallback()
                return
            self._conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
                (key, value),
            )
            self._conn.commit()

    def list_users(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(self._doc_store["users"])
            rows = self._conn.execute(
                "SELECT * FROM users ORDER BY rowid ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def upsert_user(self, user: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                existing_u = next(
                    (u for u in self._doc_store["users"] if u["id"] == user["id"]),
                    None,
                )
                u_copy = copy.deepcopy(user)
                if not u_copy.get("password") and existing_u and existing_u.get("password"):
                    u_copy["password"] = existing_u["password"]
                users = [
                    u for u in self._doc_store["users"] if u["id"] != user["id"]
                ]
                users.append(u_copy)
                self._doc_store["users"] = users
                self._save_json_fallback()
                return
            existing_row = self._conn.execute(
                "SELECT password FROM users WHERE id = ?", (user["id"],)
            ).fetchone()
            resolved_pwd = str(
                user.get("password")
                or (existing_row["password"] if existing_row else "")
                or ""
            )
            self._conn.execute(
                """
                INSERT OR REPLACE INTO users
                (id, ldap, name, role, department, default_lens, default_stage,
                 nda_clearance, badge, description, personal_agent_id, team_agent_id, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    user["ldap"],
                    user["name"],
                    user["role"],
                    user["department"],
                    user["default_lens"],
                    user["default_stage"],
                    user["nda_clearance"],
                    user["badge"],
                    user["description"],
                    user.get("personal_agent_id", ""),
                    user.get("team_agent_id", "pm_agent"),
                    resolved_pwd,
                ),
            )
            self._conn.commit()

    def delete_user(self, user_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["users"] = [
                    u for u in self._doc_store["users"] if u["id"] != user_id
                ]
                self._save_json_fallback()
                return
            self._conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            self._conn.commit()

    def set_user_password(self, user_id: str, password: str) -> None:
        """Overwrites one user's stored password; '' retires it.

        `upsert_user` keeps the existing password when given an empty one, so
        an account that switches to Google sign-in clears it here.
        """
        with self._lock:
            if not self._use_sqlite:
                for u in self._doc_store["users"]:
                    if u["id"] == user_id:
                        u["password"] = password
                self._save_json_fallback()
                return
            self._conn.execute(
                "UPDATE users SET password = ? WHERE id = ?", (password, user_id)
            )
            self._conn.commit()

    def list_user_agents(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(self._doc_store["user_agents"])
            rows = self._conn.execute(
                "SELECT * FROM user_agents ORDER BY rowid ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_user_agent(self, agent_id: str) -> dict[str, Any] | None:
        with self._lock:
            if not self._use_sqlite:
                ag = next(
                    (
                        a
                        for a in self._doc_store["user_agents"]
                        if a["id"] == agent_id
                    ),
                    None,
                )
                return copy.deepcopy(ag) if ag else None
            row = self._conn.execute(
                "SELECT * FROM user_agents WHERE id = ?", (agent_id,)
            ).fetchone()
            return dict(row) if row else None

    def upsert_user_agent(self, agent: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                agents = [
                    a
                    for a in self._doc_store["user_agents"]
                    if a["id"] != agent["id"]
                ]
                agents.append(copy.deepcopy(agent))
                self._doc_store["user_agents"] = agents
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT OR REPLACE INTO user_agents
                (id, agent_type, name, owner_user_id, owner_ldap, team_id, team_name,
                 parent_team_agent_id, specialty, badge, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent["id"],
                    agent["agent_type"],
                    agent["name"],
                    agent["owner_user_id"],
                    agent["owner_ldap"],
                    agent["team_id"],
                    agent["team_name"],
                    agent["parent_team_agent_id"],
                    agent["specialty"],
                    agent["badge"],
                    agent["created_at"],
                ),
            )
            self._conn.commit()

    def delete_user_agent(self, agent_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["user_agents"] = [
                    a for a in self._doc_store["user_agents"] if a["id"] != agent_id
                ]
                self._save_json_fallback()
                return
            self._conn.execute(
                "DELETE FROM user_agents WHERE id = ?", (agent_id,)
            )
            self._conn.commit()

    def list_user_files(
        self,
        user_id: str | None = None,
        team_agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                files = copy.deepcopy(self._doc_store["user_files"])
                if user_id:
                    files = [f for f in files if f["user_id"] == user_id]
                if team_agent_id:
                    files = [
                        f for f in files if f["team_agent_id"] == team_agent_id
                    ]
                return files
            query = "SELECT * FROM user_files WHERE 1=1"
            params: list[Any] = []
            if user_id:
                query += " AND user_id = ?"
                params.append(user_id)
            if team_agent_id:
                query += " AND team_agent_id = ?"
                params.append(team_agent_id)
            query += " ORDER BY rowid DESC"
            rows = self._conn.execute(query, tuple(params)).fetchall()
            return [dict(r) for r in rows]

    def add_user_file(self, file_obj: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                files = [
                    f
                    for f in self._doc_store["user_files"]
                    if f["id"] != file_obj["id"]
                ]
                files.append(copy.deepcopy(file_obj))
                self._doc_store["user_files"] = files
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT OR REPLACE INTO user_files
                (id, user_id, user_ldap, personal_agent_id, team_agent_id, team_name,
                 filename, content, visibility, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    file_obj["id"],
                    file_obj["user_id"],
                    file_obj["user_ldap"],
                    file_obj["personal_agent_id"],
                    file_obj["team_agent_id"],
                    file_obj["team_name"],
                    file_obj["filename"],
                    file_obj["content"],
                    file_obj.get("visibility", "federated"),
                    file_obj["uploaded_at"],
                ),
            )
            self._conn.commit()

    def delete_user_file(self, file_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["user_files"] = [
                    f
                    for f in self._doc_store["user_files"]
                    if f["id"] != file_id
                ]
                self._save_json_fallback()
                return
            self._conn.execute("DELETE FROM user_files WHERE id = ?", (file_id,))
            self._conn.commit()

    def get_a2a_messages(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return list(
                    reversed(copy.deepcopy(self._doc_store["a2a_messages"]))
                )
            rows = self._conn.execute(
                "SELECT * FROM a2a_messages ORDER BY seq DESC"
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                try:
                    d["hops"] = json.loads(d.pop("hops_json", "[]"))
                except json.JSONDecodeError:
                    d["hops"] = []
                # Grounding metadata (grounding_mode, sources, environment, …)
                # lives in a JSON blob so the record shape matches the
                # in-memory fallback without a schema change per key.
                try:
                    meta = json.loads(d.pop("meta_json", None) or "{}")
                except json.JSONDecodeError:
                    meta = {}
                if isinstance(meta, dict):
                    for key, value in meta.items():
                        d.setdefault(key, value)
                out.append(d)
            return out

    def insert_a2a_message(self, msg: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["a2a_messages"].append(copy.deepcopy(msg))
                self._save_json_fallback()
                return
            meta = {
                k: v for k, v in msg.items() if k not in _A2A_COLUMN_KEYS
            }
            self._conn.execute(
                """
                INSERT INTO a2a_messages
                (id, timestamp, user_id, user_name, personal_agent_id, personal_agent_name,
                 team_agent_id, team_agent_name, question, hops_json, final_answer, meta_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    msg["id"],
                    msg["timestamp"],
                    msg["user_id"],
                    msg["user_name"],
                    msg["personal_agent_id"],
                    msg["personal_agent_name"],
                    msg["team_agent_id"],
                    msg["team_agent_name"],
                    msg["question"],
                    json.dumps(msg.get("hops", [])),
                    msg["final_answer"],
                    json.dumps(meta, default=str),
                ),
            )
            self._conn.commit()

