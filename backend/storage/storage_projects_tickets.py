"""SQLite CRUD Mixin for Projects, Atomic Claims & Bilateral Tickets.

Provides thread-safe SQLite (and JSON fallback) operations for:
- Projects & Atomic Claims (`list_projects_summary`, `get_project`, `save_project`, `delete_project`, `get_claims`, `replace_claims`)
- Bilateral Shared-File Tickets (`list_tickets`, `get_ticket`, `upsert_ticket`, `delete_ticket`)
- Policy Packs, Rate Cards, Debate Logs & Memory Logs (via `StoragePoliciesAndLogsMixin`)
"""

from __future__ import annotations

import copy
import json
import threading
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.storage import storage_policies_and_logs
else:
    try:
        from google3.experimental.users.efch.murph.backend.storage import storage_policies_and_logs
    except ImportError:
        from backend.storage import storage_policies_and_logs  # type: ignore


class StorageProjectsAndTicketsMixin(
    storage_policies_and_logs.StoragePoliciesAndLogsMixin
):
    """Mixin for Projects, Claims, Policies, Rate Card, Logs, and Tickets persistence."""

    _lock: threading.RLock
    _use_sqlite: bool
    _conn: Any
    _doc_store: dict[str, Any]
    _save_json_fallback: Any

    def list_projects_summary(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "subtitle": p["subtitle"],
                        "allocated_budget": p["allocated_budget"],
                        "target_launch_days": p["target_launch_days"],
                        "team_capacity_fte": p["team_capacity_fte"],
                        "document_title": p["document_title"],
                        "updated_at": p["updated_at"],
                    }
                    for p in self._doc_store["projects"].values()
                ]
            rows = self._conn.execute(
                "SELECT id, name, subtitle, allocated_budget, target_launch_days, team_capacity_fte, document_title, updated_at FROM projects ORDER BY rowid ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            if not self._use_sqlite:
                p = self._doc_store["projects"].get(project_id)
                return copy.deepcopy(p) if p else None
            row = self._conn.execute(
                "SELECT * FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
            if not row:
                return None
            proj = dict(row)
            if proj.get("live_derivatives_json"):
                try:
                    proj["live_derivatives_override"] = json.loads(
                        proj["live_derivatives_json"]
                    )
                except json.JSONDecodeError:
                    proj["live_derivatives_override"] = None
            else:
                proj["live_derivatives_override"] = None
            return proj

    def save_project(self, proj: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["projects"][proj["id"]] = copy.deepcopy(proj)
                self._save_json_fallback()
                return
            live_json = (
                json.dumps(proj["live_derivatives_override"])
                if proj.get("live_derivatives_override")
                else None
            )
            self._conn.execute(
                """
                INSERT OR REPLACE INTO projects
                (id, name, subtitle, workspace_mode, allocated_budget, tolerance_limit,
                 target_launch_days, team_capacity_fte, document_title, document_text,
                 custom_whatif_note, live_derivatives_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    proj["id"],
                    proj["name"],
                    proj["subtitle"],
                    proj["workspace_mode"],
                    int(proj["allocated_budget"]),
                    int(proj["tolerance_limit"]),
                    int(proj["target_launch_days"]),
                    float(proj["team_capacity_fte"]),
                    proj["document_title"],
                    proj["document_text"],
                    proj.get("custom_whatif_note"),
                    live_json,
                    proj.get("updated_at", "2026-09-28 UTC"),
                ),
            )
            self._conn.commit()

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            if not self._use_sqlite:
                if len(self._doc_store["projects"]) <= 1:
                    return False
                self._doc_store["projects"].pop(project_id, None)
                self._doc_store["claims"].pop(project_id, None)
                self._doc_store["debate_logs"].pop(project_id, None)
                self._save_json_fallback()
                return True
            cnt_row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM projects"
            ).fetchone()
            if not cnt_row or cnt_row["cnt"] <= 1:
                return False
            self._conn.execute(
                "DELETE FROM projects WHERE id = ?", (project_id,)
            )
            self._conn.execute(
                "DELETE FROM claims WHERE project_id = ?", (project_id,)
            )
            self._conn.execute(
                "DELETE FROM debate_logs WHERE project_id = ?", (project_id,)
            )
            self._conn.commit()
            return True

    def get_claims(self, project_id: str) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(
                    self._doc_store["claims"].get(project_id, [])
                )
            rows = self._conn.execute(
                "SELECT * FROM claims WHERE project_id = ? ORDER BY sort_order ASC, rowid ASC",
                (project_id,),
            ).fetchall()
            result: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d.pop("project_id", None)
                d.pop("sort_order", None)
                if d.get("compromise_title") is None:
                    d.pop("compromise_title", None)
                if d.get("resolution_method") is None:
                    d.pop("resolution_method", None)
                result.append(d)
            return result

    def replace_claims(
        self, project_id: str, claims: list[dict[str, Any]]
    ) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["claims"][project_id] = copy.deepcopy(claims)
                self._save_json_fallback()
                return
            cur = self._conn.cursor()
            cur.execute("DELETE FROM claims WHERE project_id = ?", (project_id,))
            for idx, c in enumerate(claims):
                cur.execute(
                    """
                    INSERT INTO claims
                    (id, project_id, category, agent_id, rule_id, severity, status,
                     excerpt, replacement, issue, evidence, impact_summary,
                     blocking_workstream, compromise_title, resolution_method, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        c["id"],
                        project_id,
                        c["category"],
                        c["agent_id"],
                        c["rule_id"],
                        c["severity"],
                        c["status"],
                        c["excerpt"],
                        c["replacement"],
                        c["issue"],
                        c["evidence"],
                        c.get("impact_summary", ""),
                        c.get("blocking_workstream", "General Review"),
                        c.get("compromise_title"),
                        c.get("resolution_method"),
                        idx,
                    ),
                )
            self._conn.commit()

    def _row_to_ticket(self, row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "status": row["status"],
            "title": row["title"],
            "request_summary": row["request_summary"],
            "requester_user_id": row["requester_user_id"],
            "requester_user_name": row["requester_user_name"],
            "requester_ldap": row["requester_ldap"],
            "requester_personal_agent_id": row["requester_personal_agent_id"],
            "requester_personal_agent_name": row["requester_personal_agent_name"],
            "requester_team_agent_id": row["requester_team_agent_id"],
            "requester_team_name": row["requester_team_name"],
            "workspace_agent_id": row["workspace_agent_id"],
            "workspace_agent_name": row["workspace_agent_name"],
            "participating_users": json.loads(row["participating_users_json"]),
            "participating_agents": json.loads(
                row["participating_agents_json"]
            ),
            "shared_files": json.loads(row["shared_files_json"]),
            "workspace_routing_log": json.loads(
                row["workspace_routing_log_json"]
            ),
            "agent_debate_turns": json.loads(row["agent_debate_turns_json"]),
            "compromise_proposal": json.loads(row["compromise_proposal_json"]),
            "approvals": json.loads(row["approvals_json"]),
            "adjustments_log": json.loads(row["adjustments_log_json"]),
            "h2h_thread": json.loads(row["h2h_thread_json"]),
        }

    def list_tickets(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(self._doc_store.get("agent_tickets", []))
            rows = self._conn.execute(
                "SELECT * FROM agent_tickets ORDER BY updated_at DESC, id DESC"
            ).fetchall()
            return [self._row_to_ticket(r) for r in rows]

    def get_ticket(self, ticket_id: str) -> dict[str, Any] | None:
        with self._lock:
            if not self._use_sqlite:
                for t in self._doc_store.get("agent_tickets", []):
                    if t["id"] == ticket_id:
                        return copy.deepcopy(t)
                return None
            row = self._conn.execute(
                "SELECT * FROM agent_tickets WHERE id = ?", (ticket_id,)
            ).fetchone()
            return self._row_to_ticket(row) if row else None

    def upsert_ticket(self, ticket: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                tickets = self._doc_store.setdefault("agent_tickets", [])
                for idx, existing in enumerate(tickets):
                    if existing["id"] == ticket["id"]:
                        tickets[idx] = copy.deepcopy(ticket)
                        self._save_json_fallback()
                        return
                tickets.insert(0, copy.deepcopy(ticket))
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT OR REPLACE INTO agent_tickets
                (id, created_at, updated_at, status, title, request_summary,
                 requester_user_id, requester_user_name, requester_ldap,
                 requester_personal_agent_id, requester_personal_agent_name,
                 requester_team_agent_id, requester_team_name,
                 workspace_agent_id, workspace_agent_name,
                 participating_users_json, participating_agents_json,
                 shared_files_json, workspace_routing_log_json,
                 agent_debate_turns_json, compromise_proposal_json,
                 approvals_json, adjustments_log_json, h2h_thread_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ticket["id"],
                    ticket["created_at"],
                    ticket["updated_at"],
                    ticket["status"],
                    ticket["title"],
                    ticket["request_summary"],
                    ticket["requester_user_id"],
                    ticket["requester_user_name"],
                    ticket["requester_ldap"],
                    ticket["requester_personal_agent_id"],
                    ticket["requester_personal_agent_name"],
                    ticket["requester_team_agent_id"],
                    ticket["requester_team_name"],
                    ticket.get("workspace_agent_id", "workspace_agent"),
                    ticket.get(
                        "workspace_agent_name", "Central Workspace Agent"
                    ),
                    json.dumps(ticket.get("participating_users", [])),
                    json.dumps(ticket.get("participating_agents", [])),
                    json.dumps(ticket.get("shared_files", [])),
                    json.dumps(ticket.get("workspace_routing_log", [])),
                    json.dumps(ticket.get("agent_debate_turns", [])),
                    json.dumps(ticket.get("compromise_proposal", {})),
                    json.dumps(ticket.get("approvals", {})),
                    json.dumps(ticket.get("adjustments_log", [])),
                    json.dumps(ticket.get("h2h_thread", [])),
                ),
            )
            self._conn.commit()

    def delete_ticket(self, ticket_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["agent_tickets"] = [
                    t
                    for t in self._doc_store.get("agent_tickets", [])
                    if t["id"] != ticket_id
                ]
                self._save_json_fallback()
                return
            self._conn.execute(
                "DELETE FROM agent_tickets WHERE id = ?", (ticket_id,)
            )
            self._conn.commit()
