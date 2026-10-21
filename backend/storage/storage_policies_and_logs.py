"""SQLite CRUD Mixin for Policy Packs, PSO Rate Cards, Debate Logs & Precedent Memory.

Provides thread-safe SQLite (and JSON fallback) operations for:
- Policy Packs & Rules (`get_policy_packs`, `add_policy_rule`, `toggle_policy_rule`, `delete_policy_rule`)
- PSO Rate Card (`get_rate_card`, `upsert_rate_card_item`, `delete_rate_card_item`)
- Debate Logs & Precedent Memory (`get_debate_log`, `append_debate_turn`, `get_memory_log`, `insert_memory_entry`, `mark_memory_promoted`)
"""

from __future__ import annotations

import copy
import json
import threading
from typing import Any


class StoragePoliciesAndLogsMixin:
    """Mixin for Policy Packs, PSO Rate Cards, Debate Logs, and Memory Logs persistence."""

    _lock: threading.RLock
    _use_sqlite: bool
    _conn: Any
    _doc_store: dict[str, Any]
    _save_json_fallback: Any

    def get_policy_packs(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                packs = copy.deepcopy(self._doc_store["policy_packs"])
                rules = self._doc_store["policy_rules"]
            else:
                packs = [
                    dict(r)
                    for r in self._conn.execute(
                        "SELECT * FROM policy_packs ORDER BY rowid ASC"
                    ).fetchall()
                ]
                rules = [
                    dict(r)
                    for r in self._conn.execute(
                        "SELECT * FROM policy_rules ORDER BY rowid ASC"
                    ).fetchall()
                ]
            for p in packs:
                p_rules: list[dict[str, Any]] = []
                for r in rules:
                    if r["pack_id"] == p["id"]:
                        rule_dict: dict[str, Any] = {
                            "id": r["id"],
                            "agent_id": r["agent_id"],
                            "summary": r["summary"],
                            "constraint": r["constraint_text"],
                            "forbidden_term": r["forbidden_term"],
                            "replacement_term": r["replacement_term"],
                            "severity": r["severity"],
                            "enabled": bool(r["enabled"]),
                        }
                        if r["source_memory"]:
                            rule_dict["source_memory"] = r["source_memory"]
                        p_rules.append(rule_dict)
                p["rules"] = p_rules
            return copy.deepcopy(packs)

    def add_policy_rule(self, pack_id: str, rule: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["policy_rules"].append(
                    {
                        "id": rule["id"],
                        "pack_id": pack_id,
                        "agent_id": rule["agent_id"],
                        "summary": rule["summary"],
                        "constraint_text": rule["constraint"],
                        "forbidden_term": rule.get("forbidden_term", ""),
                        "replacement_term": rule.get("replacement_term", ""),
                        "severity": rule.get("severity", "auto_fix"),
                        "enabled": bool(rule.get("enabled", True)),
                        "source_memory": rule.get("source_memory", ""),
                    }
                )
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT OR REPLACE INTO policy_rules
                (id, pack_id, agent_id, summary, constraint_text, forbidden_term, replacement_term, severity, enabled, source_memory)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rule["id"],
                    pack_id,
                    rule["agent_id"],
                    rule["summary"],
                    rule["constraint"],
                    rule.get("forbidden_term", ""),
                    rule.get("replacement_term", ""),
                    rule.get("severity", "auto_fix"),
                    1 if rule.get("enabled", True) else 0,
                    rule.get("source_memory", ""),
                ),
            )
            self._conn.commit()

    def toggle_policy_rule(self, rule_id: str, enabled: bool) -> None:
        with self._lock:
            if not self._use_sqlite:
                for r in self._doc_store["policy_rules"]:
                    if r["id"] == rule_id:
                        r["enabled"] = bool(enabled)
                self._save_json_fallback()
                return
            self._conn.execute(
                "UPDATE policy_rules SET enabled = ? WHERE id = ?",
                (1 if enabled else 0, rule_id),
            )
            self._conn.commit()

    def delete_policy_rule(self, rule_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["policy_rules"] = [
                    r
                    for r in self._doc_store["policy_rules"]
                    if r["id"] != rule_id
                ]
                self._save_json_fallback()
                return
            self._conn.execute(
                "DELETE FROM policy_rules WHERE id = ?", (rule_id,)
            )
            self._conn.commit()

    def get_rate_card(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(self._doc_store["rate_card"])
            rows = self._conn.execute(
                "SELECT * FROM rate_card ORDER BY rowid ASC"
            ).fetchall()
            items: list[dict[str, Any]] = []
            for r in rows:
                items.append(
                    {
                        "sku": r["sku"],
                        "name": r["name"],
                        "keywords": json.loads(r["keywords_json"]),
                        "cost_usd": int(r["cost_usd"]),
                        "fte_load": float(r["fte_load"]),
                        "duration_days": int(r["duration_days"]),
                    }
                )
            return items

    def upsert_rate_card_item(self, item: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                rc = [
                    x
                    for x in self._doc_store["rate_card"]
                    if x["sku"] != item["sku"]
                ]
                rc.append(copy.deepcopy(item))
                self._doc_store["rate_card"] = rc
                self._save_json_fallback()
                return
            self._conn.execute(
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
            self._conn.commit()

    def delete_rate_card_item(self, sku: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["rate_card"] = [
                    x for x in self._doc_store["rate_card"] if x["sku"] != sku
                ]
                self._save_json_fallback()
                return
            self._conn.execute("DELETE FROM rate_card WHERE sku = ?", (sku,))
            self._conn.commit()

    def get_debate_log(self, project_id: str) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return copy.deepcopy(
                    self._doc_store["debate_logs"].get(project_id, [])
                )
            rows = self._conn.execute(
                "SELECT id, agent_id, agent_name, badge, type, message FROM debate_logs WHERE project_id = ? ORDER BY seq ASC",
                (project_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def append_debate_turn(self, project_id: str, turn: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["debate_logs"].setdefault(
                    project_id, []
                ).append(copy.deepcopy(turn))
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT INTO debate_logs (id, project_id, agent_id, agent_name, badge, type, message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    turn["id"],
                    project_id,
                    turn["agent_id"],
                    turn["agent_name"],
                    turn["badge"],
                    turn["type"],
                    turn["message"],
                ),
            )
            self._conn.commit()

    def get_memory_log(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self._use_sqlite:
                return list(
                    reversed(copy.deepcopy(self._doc_store["memory_logs"]))
                )
            rows = self._conn.execute(
                "SELECT id, timestamp, stakeholder, decision, promoted_to_rule, rule_id FROM memory_logs ORDER BY seq DESC"
            ).fetchall()
            res: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d["promoted_to_rule"] = bool(d["promoted_to_rule"])
                res.append(d)
            return res

    def insert_memory_entry(self, entry: dict[str, Any]) -> None:
        with self._lock:
            if not self._use_sqlite:
                self._doc_store["memory_logs"].append(copy.deepcopy(entry))
                self._save_json_fallback()
                return
            self._conn.execute(
                """
                INSERT INTO memory_logs (id, timestamp, stakeholder, decision, promoted_to_rule, rule_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    entry["id"],
                    entry["timestamp"],
                    entry["stakeholder"],
                    entry["decision"],
                    1 if entry.get("promoted_to_rule") else 0,
                    entry["rule_id"],
                ),
            )
            self._conn.commit()

    def mark_memory_promoted(self, memory_id: str) -> None:
        with self._lock:
            if not self._use_sqlite:
                for m in self._doc_store["memory_logs"]:
                    if m["id"] == memory_id:
                        m["promoted_to_rule"] = True
                self._save_json_fallback()
                return
            self._conn.execute(
                "UPDATE memory_logs SET promoted_to_rule = 1 WHERE id = ?",
                (memory_id,),
            )
            self._conn.commit()
