"""Storage Seeding & Reset Mixin for Murph SQLite Store.

Populates initial personas, agents, files, tickets, policy packs, rate cards,
projects, and debate logs (`seed_defaults`) and provides full workspace reset
(`reset_all`).
"""

from __future__ import annotations

import copy
import json
import threading
from typing import Any


class StorageSeedMixin:
    """Mixin for initial database seeding and full workspace reset."""

    _lock: threading.RLock
    _use_sqlite: bool
    _conn: Any
    _doc_store: dict[str, Any]
    _save_json_fallback: Any
    is_seeded: Any
    _are_agents_seeded: Any
    _are_tickets_seeded: Any
    upsert_ticket: Any
    set_setting: Any

    def seed_defaults(
        self,
        personas: list[dict[str, Any]],
        policy_packs: list[dict[str, Any]],
        rate_card: list[dict[str, Any]],
        scenarios: dict[str, dict[str, Any]],
        initial_memory: list[dict[str, Any]],
        initial_debates: dict[str, list[dict[str, Any]]],
        initial_agents: list[dict[str, Any]] | None = None,
        initial_files: list[dict[str, Any]] | None = None,
        initial_a2a: list[dict[str, Any]] | None = None,
        initial_tickets: list[dict[str, Any]] | None = None,
    ) -> None:
        """Populates initial projects, policies, rate cards, agents, files, and tickets if not yet seeded."""
        with self._lock:
            already_seeded = self.is_seeded()
            agents_seeded = self._are_agents_seeded()
            tickets_seeded = self._are_tickets_seeded()
            if already_seeded and agents_seeded and tickets_seeded:
                self._refresh_plain_english_seed_copy(
                    initial_files=initial_files,
                    initial_tickets=initial_tickets,
                )
                return

            if not self._use_sqlite:
                self._doc_store["users"] = copy.deepcopy(personas)
                self._doc_store["user_agents"] = copy.deepcopy(
                    initial_agents or []
                )
                if not agents_seeded:
                    self._doc_store["user_files"] = copy.deepcopy(
                        initial_files or []
                    )
                    self._doc_store["a2a_messages"] = copy.deepcopy(
                        initial_a2a or []
                    )
                if not tickets_seeded:
                    self._doc_store["agent_tickets"] = copy.deepcopy(
                        initial_tickets or []
                    )
                if not already_seeded:
                    self._doc_store["policy_packs"] = []
                    self._doc_store["policy_rules"] = []
                    for pack in policy_packs:
                        self._doc_store["policy_packs"].append(
                            {
                                "id": pack["id"],
                                "agent_id": pack["agent_id"],
                                "title": pack["title"],
                                "source_doc": pack["source_doc"],
                            }
                        )
                        for r in pack.get("rules", []):
                            self._doc_store["policy_rules"].append(
                                {
                                    "id": r["id"],
                                    "pack_id": pack["id"],
                                    "agent_id": pack["agent_id"],
                                    "summary": r["summary"],
                                    "constraint_text": r["constraint"],
                                    "forbidden_term": r.get(
                                        "forbidden_term", ""
                                    ),
                                    "replacement_term": r.get(
                                        "replacement_term", ""
                                    ),
                                    "severity": r.get("severity", "auto_fix"),
                                    "enabled": bool(r.get("enabled", True)),
                                    "source_memory": r.get("source_memory", ""),
                                }
                            )
                    self._doc_store["rate_card"] = copy.deepcopy(rate_card)
                    self._doc_store["memory_logs"] = copy.deepcopy(
                        initial_memory
                    )
                    self._doc_store["projects"] = {}
                    self._doc_store["claims"] = {}
                    self._doc_store["debate_logs"] = {}
                    for sc_id, sc in scenarios.items():
                        self._doc_store["projects"][sc_id] = {
                            "id": sc_id,
                            "name": sc["name"],
                            "subtitle": sc["subtitle"],
                            "workspace_mode": sc["workspace_mode"],
                            "allocated_budget": int(sc["allocated_budget"]),
                            "tolerance_limit": int(sc["tolerance_limit"]),
                            "target_launch_days": int(sc["target_launch_days"]),
                            "team_capacity_fte": float(sc["team_capacity_fte"]),
                            "document_title": sc["document_title"],
                            "document_text": sc["document_text"],
                            "custom_whatif_note": None,
                            "live_derivatives_override": None,
                            "updated_at": "2026-09-28 02:30 UTC",
                        }
                        self._doc_store["claims"][sc_id] = copy.deepcopy(
                            sc.get("claims", [])
                        )
                        self._doc_store["debate_logs"][sc_id] = copy.deepcopy(
                            initial_debates.get(sc_id, [])
                        )
                    self._doc_store["app_settings"][
                        "active_project_id"
                    ] = "cloud_launch_hybrid"
                    self._doc_store["app_settings"][
                        "workspace_tier"
                    ] = "collaborative"
                self._save_json_fallback()
                return

            cur = self._conn.cursor()

            for p in personas:
                cur.execute(
                    """
                    INSERT OR REPLACE INTO users
                    (id, ldap, name, role, department, default_lens, default_stage,
                     nda_clearance, badge, description, personal_agent_id, team_agent_id, password)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        p["id"],
                        p["ldap"],
                        p["name"],
                        p["role"],
                        p["department"],
                        p["default_lens"],
                        p["default_stage"],
                        p["nda_clearance"],
                        p["badge"],
                        p["description"],
                        p.get("personal_agent_id", ""),
                        p.get("team_agent_id", "pm_agent"),
                        p.get("password", ""),
                    ),
                )

            for ag in initial_agents or []:
                cur.execute(
                    """
                    INSERT OR REPLACE INTO user_agents
                    (id, agent_type, name, owner_user_id, owner_ldap, team_id, team_name,
                     parent_team_agent_id, specialty, badge, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ag["id"],
                        ag["agent_type"],
                        ag["name"],
                        ag["owner_user_id"],
                        ag["owner_ldap"],
                        ag["team_id"],
                        ag["team_name"],
                        ag["parent_team_agent_id"],
                        ag["specialty"],
                        ag["badge"],
                        ag["created_at"],
                    ),
                )

            if not agents_seeded:
                for f_obj in initial_files or []:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO user_files
                        (id, user_id, user_ldap, personal_agent_id, team_agent_id, team_name,
                         filename, content, visibility, uploaded_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f_obj["id"],
                            f_obj["user_id"],
                            f_obj["user_ldap"],
                            f_obj["personal_agent_id"],
                            f_obj["team_agent_id"],
                            f_obj["team_name"],
                            f_obj["filename"],
                            f_obj["content"],
                            f_obj.get("visibility", "federated"),
                            f_obj["uploaded_at"],
                        ),
                    )
                for a2a in initial_a2a or []:
                    cur.execute(
                        """
                        INSERT INTO a2a_messages
                        (id, timestamp, user_id, user_name, personal_agent_id, personal_agent_name,
                         team_agent_id, team_agent_name, question, hops_json, final_answer)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            a2a["id"],
                            a2a["timestamp"],
                            a2a["user_id"],
                            a2a["user_name"],
                            a2a["personal_agent_id"],
                            a2a["personal_agent_name"],
                            a2a["team_agent_id"],
                            a2a["team_agent_name"],
                            a2a["question"],
                            json.dumps(a2a["hops"]),
                            a2a["final_answer"],
                        ),
                    )

            if not tickets_seeded and initial_tickets:
                for t in initial_tickets:
                    self.upsert_ticket(t)

            if not already_seeded:
                for pack in policy_packs:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO policy_packs (id, agent_id, title, source_doc)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            pack["id"],
                            pack["agent_id"],
                            pack["title"],
                            pack["source_doc"],
                        ),
                    )
                    for r in pack.get("rules", []):
                        cur.execute(
                            """
                            INSERT OR REPLACE INTO policy_rules
                            (id, pack_id, agent_id, summary, constraint_text, forbidden_term, replacement_term, severity, enabled, source_memory)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                r["id"],
                                pack["id"],
                                pack["agent_id"],
                                r["summary"],
                                r["constraint"],
                                r.get("forbidden_term", ""),
                                r.get("replacement_term", ""),
                                r.get("severity", "auto_fix"),
                                1 if r.get("enabled", True) else 0,
                                r.get("source_memory", ""),
                            ),
                        )

                for item in rate_card:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO rate_card
                        (sku, name, keywords_json, cost_usd, fte_load, duration_days)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["sku"],
                            item["name"],
                            json.dumps(item["keywords"]),
                            int(item["cost_usd"]),
                            float(item["fte_load"]),
                            int(item["duration_days"]),
                        ),
                    )

                for mem in initial_memory:
                    cur.execute(
                        """
                        INSERT INTO memory_logs (id, timestamp, stakeholder, decision, promoted_to_rule, rule_id)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            mem["id"],
                            mem["timestamp"],
                            mem["stakeholder"],
                            mem["decision"],
                            1 if mem.get("promoted_to_rule") else 0,
                            mem["rule_id"],
                        ),
                    )

                for sc_id, sc in scenarios.items():
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO projects
                        (id, name, subtitle, workspace_mode, allocated_budget, tolerance_limit,
                         target_launch_days, team_capacity_fte, document_title, document_text,
                         custom_whatif_note, live_derivatives_json, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sc_id,
                            sc["name"],
                            sc["subtitle"],
                            sc["workspace_mode"],
                            int(sc["allocated_budget"]),
                            int(sc["tolerance_limit"]),
                            int(sc["target_launch_days"]),
                            float(sc["team_capacity_fte"]),
                            sc["document_title"],
                            sc["document_text"],
                            None,
                            None,
                            "2026-09-28 02:30 UTC",
                        ),
                    )
                    for idx, c in enumerate(sc.get("claims", [])):
                        cur.execute(
                            """
                            INSERT OR REPLACE INTO claims
                            (id, project_id, category, agent_id, rule_id, severity, status,
                             excerpt, replacement, issue, evidence, impact_summary,
                             blocking_workstream, compromise_title, resolution_method, sort_order)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                c["id"],
                                sc_id,
                                c["category"],
                                c["agent_id"],
                                c["rule_id"],
                                c["severity"],
                                c["status"],
                                c["excerpt"],
                                c["replacement"],
                                c["issue"],
                                c["evidence"],
                                c["impact_summary"],
                                c["blocking_workstream"],
                                c.get("compromise_title"),
                                c.get("resolution_method"),
                                idx,
                            ),
                        )
                    for turn in initial_debates.get(sc_id, []):
                        cur.execute(
                            """
                            INSERT INTO debate_logs (id, project_id, agent_id, agent_name, badge, type, message)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                turn["id"],
                                sc_id,
                                turn["agent_id"],
                                turn["agent_name"],
                                turn["badge"],
                                turn["type"],
                                turn["message"],
                            ),
                        )

                self.set_setting("active_project_id", "cloud_launch_hybrid")
                self.set_setting("workspace_tier", "collaborative")

            self.set_setting("plain_english_seed_v3", "done")
            self._conn.commit()
            if hasattr(self, "_ensure_demo_account_passwords"):
                self._ensure_demo_account_passwords()  # type: ignore[attr-defined]

    def _refresh_plain_english_seed_copy(
        self,
        initial_files: list[dict[str, Any]] | None = None,
        initial_tickets: list[dict[str, Any]] | None = None,
    ) -> None:
        """One-shot refresh of seeded FILE-* and TKT-101/TKT-102 plain-English copy on existing SQLite DBs."""
        if not self._use_sqlite or self._conn is None:
            return
        cur = self._conn.cursor()
        done = cur.execute(
            "SELECT value FROM app_settings WHERE key = 'plain_english_seed_v3'"
        ).fetchone()
        if done and done["value"] == "done":
            return
        for f_obj in initial_files or []:
            cur.execute(
                """
                INSERT OR REPLACE INTO user_files
                (id, user_id, user_ldap, personal_agent_id, team_agent_id, team_name,
                 filename, content, visibility, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f_obj["id"],
                    f_obj["user_id"],
                    f_obj["user_ldap"],
                    f_obj["personal_agent_id"],
                    f_obj["team_agent_id"],
                    f_obj["team_name"],
                    f_obj["filename"],
                    f_obj["content"],
                    f_obj.get("visibility", "federated"),
                    f_obj["uploaded_at"],
                ),
            )
        for t in initial_tickets or []:
            updated = copy.deepcopy(t)
            if hasattr(self, "get_ticket"):
                existing = self.get_ticket(t["id"])  # type: ignore[attr-defined]
                if existing:
                    updated["status"] = existing.get("status", t["status"])
                    updated["approvals"] = existing.get(
                        "approvals", t["approvals"]
                    )
                    updated["h2h_thread"] = existing.get(
                        "h2h_thread", t["h2h_thread"]
                    )
            self.upsert_ticket(updated)
        self.set_setting("plain_english_seed_v3", "done")
        self._conn.commit()

    def reset_all(
        self,
        personas: list[dict[str, Any]],
        policy_packs: list[dict[str, Any]],
        rate_card: list[dict[str, Any]],
        scenarios: dict[str, dict[str, Any]],
        initial_memory: list[dict[str, Any]],
        initial_debates: dict[str, list[dict[str, Any]]],
        initial_agents: list[dict[str, Any]] | None = None,
        initial_files: list[dict[str, Any]] | None = None,
        initial_a2a: list[dict[str, Any]] | None = None,
        initial_tickets: list[dict[str, Any]] | None = None,
    ) -> None:
        """Clears all tables and re-seeds default projects, policy packs, rate cards, agents, files, and tickets."""
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["projects"] = {}
                self._doc_store["user_agents"] = []
                self._doc_store["user_files"] = []
                self._doc_store["a2a_messages"] = []
                self._doc_store["agent_tickets"] = []
                self.seed_defaults(
                    personas=personas,
                    policy_packs=policy_packs,
                    rate_card=rate_card,
                    scenarios=scenarios,
                    initial_memory=initial_memory,
                    initial_debates=initial_debates,
                    initial_agents=initial_agents,
                    initial_files=initial_files,
                    initial_a2a=initial_a2a,
                    initial_tickets=initial_tickets,
                )
                return
            cur = self._conn.cursor()
            for tbl in (
                "projects",
                "claims",
                "policy_packs",
                "policy_rules",
                "rate_card",
                "debate_logs",
                "memory_logs",
                "users",
                "user_agents",
                "user_files",
                "a2a_messages",
                "agent_tickets",
            ):
                cur.execute(f"DELETE FROM {tbl}")
            self._conn.commit()
            self.seed_defaults(
                personas=personas,
                policy_packs=policy_packs,
                rate_card=rate_card,
                scenarios=scenarios,
                initial_memory=initial_memory,
                initial_debates=initial_debates,
                initial_agents=initial_agents,
                initial_files=initial_files,
                initial_a2a=initial_a2a,
                initial_tickets=initial_tickets,
            )
