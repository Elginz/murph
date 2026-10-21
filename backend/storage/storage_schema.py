"""SQLite Schema DDL & Seed Check Mixin for MurphStorage.

Separates the 12-table SQLite schema creation (`_init_schema`) and seed
checks (`is_seeded`, `_are_agents_seeded`, `_are_tickets_seeded`) from
`storage_seed.py` and the day-to-day table CRUD methods in `storage.py`.
"""

from __future__ import annotations

import json
import threading
from typing import Any, TYPE_CHECKING

try:
    import sqlite3 as _sqlite3
except ImportError:
    _sqlite3 = None  # type: ignore

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.storage import storage_seed
else:
    try:
        from google3.experimental.users.efch.murph.backend.storage import storage_seed
    except ImportError:
        from backend.storage import storage_seed  # type: ignore


# Built-in demo account rename (2026-10-03), see `seed_agents_and_files.LEGACY_ACCOUNT_LDAP_MAP`.
# Replacing the `<handle>@` prefix also rewrites the full `<handle>@google.com` ldap.
LEGACY_ACCOUNT_HANDLE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("efch@", "cloud_demo@"),
    ("alex.rivera@", "marketing_demo@"),
)
IDENTITY_MIGRATION_SETTING_KEY = "legacy_account_identity_migration_v1"
DEMO_ACCOUNT_PASSWORD = "P@ssword_123"


class StorageSchemaAndSeedMixin(storage_seed.StorageSeedMixin):
    """Provides SQLite DDL schema creation and initial seed population for MurphStorage."""

    _lock: threading.RLock
    _use_sqlite: bool
    _conn: Any
    _mem: dict[str, Any]
    _doc_store: dict[str, Any]
    _save_json_fallback: Any
    upsert_user_agent: Any
    upsert_ticket: Any
    set_setting: Any

    def _init_schema(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    ldap TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    department TEXT NOT NULL,
                    default_lens TEXT NOT NULL,
                    default_stage TEXT NOT NULL,
                    nda_clearance TEXT NOT NULL,
                    badge TEXT NOT NULL,
                    description TEXT NOT NULL,
                    personal_agent_id TEXT NOT NULL DEFAULT '',
                    team_agent_id TEXT NOT NULL DEFAULT 'pm_agent',
                    password TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS user_agents (
                    id TEXT PRIMARY KEY,
                    agent_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    owner_user_id TEXT NOT NULL,
                    owner_ldap TEXT NOT NULL,
                    team_id TEXT NOT NULL,
                    team_name TEXT NOT NULL,
                    parent_team_agent_id TEXT NOT NULL,
                    specialty TEXT NOT NULL,
                    badge TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_files (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_ldap TEXT NOT NULL,
                    personal_agent_id TEXT NOT NULL,
                    team_agent_id TEXT NOT NULL,
                    team_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    content TEXT NOT NULL,
                    visibility TEXT NOT NULL DEFAULT 'federated',
                    uploaded_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS a2a_messages (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    personal_agent_id TEXT NOT NULL,
                    personal_agent_name TEXT NOT NULL,
                    team_agent_id TEXT NOT NULL,
                    team_agent_name TEXT NOT NULL,
                    question TEXT NOT NULL,
                    hops_json TEXT NOT NULL,
                    final_answer TEXT NOT NULL,
                    meta_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS agent_tickets (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    title TEXT NOT NULL,
                    request_summary TEXT NOT NULL,
                    requester_user_id TEXT NOT NULL,
                    requester_user_name TEXT NOT NULL,
                    requester_ldap TEXT NOT NULL,
                    requester_personal_agent_id TEXT NOT NULL,
                    requester_personal_agent_name TEXT NOT NULL,
                    requester_team_agent_id TEXT NOT NULL,
                    requester_team_name TEXT NOT NULL,
                    workspace_agent_id TEXT NOT NULL,
                    workspace_agent_name TEXT NOT NULL,
                    participating_users_json TEXT NOT NULL,
                    participating_agents_json TEXT NOT NULL,
                    shared_files_json TEXT NOT NULL,
                    workspace_routing_log_json TEXT NOT NULL,
                    agent_debate_turns_json TEXT NOT NULL,
                    compromise_proposal_json TEXT NOT NULL,
                    approvals_json TEXT NOT NULL,
                    adjustments_log_json TEXT NOT NULL,
                    h2h_thread_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    subtitle TEXT NOT NULL,
                    workspace_mode TEXT NOT NULL,
                    allocated_budget INTEGER NOT NULL,
                    tolerance_limit INTEGER NOT NULL,
                    target_launch_days INTEGER NOT NULL,
                    team_capacity_fte REAL NOT NULL,
                    document_title TEXT NOT NULL,
                    document_text TEXT NOT NULL,
                    custom_whatif_note TEXT,
                    live_derivatives_json TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS claims (
                    id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    rule_id TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    excerpt TEXT NOT NULL,
                    replacement TEXT NOT NULL,
                    issue TEXT NOT NULL,
                    evidence TEXT NOT NULL,
                    impact_summary TEXT NOT NULL,
                    blocking_workstream TEXT NOT NULL,
                    compromise_title TEXT,
                    resolution_method TEXT,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (project_id, id)
                );

                CREATE TABLE IF NOT EXISTS policy_packs (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source_doc TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS policy_rules (
                    id TEXT PRIMARY KEY,
                    pack_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    constraint_text TEXT NOT NULL,
                    forbidden_term TEXT NOT NULL DEFAULT '',
                    replacement_term TEXT NOT NULL DEFAULT '',
                    severity TEXT NOT NULL DEFAULT 'auto_fix',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    source_memory TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS rate_card (
                    sku TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    keywords_json TEXT NOT NULL,
                    cost_usd INTEGER NOT NULL,
                    fte_load REAL NOT NULL,
                    duration_days INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS debate_logs (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    badge TEXT NOT NULL,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memory_logs (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    stakeholder TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    promoted_to_rule INTEGER NOT NULL DEFAULT 0,
                    rule_id TEXT NOT NULL
                );
                """
            )
            existing_cols = {
                r["name"]
                for r in cur.execute("PRAGMA table_info(users)").fetchall()
            }
            if "personal_agent_id" not in existing_cols:
                cur.execute(
                    "ALTER TABLE users ADD COLUMN personal_agent_id TEXT NOT NULL DEFAULT ''"
                )
            if "team_agent_id" not in existing_cols:
                cur.execute(
                    "ALTER TABLE users ADD COLUMN team_agent_id TEXT NOT NULL DEFAULT 'pm_agent'"
                )
            if "password" not in existing_cols:
                cur.execute(
                    "ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ''"
                )
            a2a_cols = {
                r["name"]
                for r in cur.execute("PRAGMA table_info(a2a_messages)").fetchall()
            }
            if "meta_json" not in a2a_cols:
                cur.execute(
                    "ALTER TABLE a2a_messages ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}'"
                )
            self._conn.commit()
            self._migrate_legacy_account_identities()
            self._ensure_demo_account_passwords()

    def _ensure_demo_account_passwords(self) -> None:
        """Ensures the 2 demo accounts have `P@ssword_123` persisted in SQLite (`users` and `account_registry`)."""
        with self._lock:
            if not self._use_sqlite or self._conn is None:
                return
            cur = self._conn.cursor()
            cur.execute(
                """
                UPDATE users
                SET password = ?
                WHERE LOWER(ldap) IN ('cloud_demo@google.com', 'marketing_demo@google.com')
                  AND (password IS NULL OR password = '')
                """,
                (DEMO_ACCOUNT_PASSWORD,),
            )
            row = cur.execute(
                "SELECT value FROM app_settings WHERE key = 'account_registry'"
            ).fetchone()
            try:
                reg = json.loads(row["value"]) if row and row["value"] else {}
                if not isinstance(reg, dict):
                    reg = {}
            except Exception:
                reg = {}
            demo_defaults = (
                (
                    "cloud_demo@google.com",
                    {
                        "user_id": "persona_creator",
                        "ldap": "cloud_demo@google.com",
                        "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
                        "role": "Workspace Owner & Launch Orchestrator",
                        "department": "Google Cloud Marketing & GTM",
                        "team_agent_id": "brand_agent",
                        "personal_agent_id": "agent_user_efch",
                        "password": DEMO_ACCOUNT_PASSWORD,
                        "environment": "cloud",
                        "is_new_account": False,
                    },
                ),
                (
                    "marketing_demo@google.com",
                    {
                        "user_id": "persona_brand",
                        "ldap": "marketing_demo@google.com",
                        "name": "marketing_demo@ (Cloud Brand Lead)",
                        "role": "Brand & Naming Governance Lead",
                        "department": "Google Cloud Brand Studio",
                        "team_agent_id": "brand_agent",
                        "personal_agent_id": "agent_user_alex_rivera",
                        "password": DEMO_ACCOUNT_PASSWORD,
                        "environment": "dm",
                        "is_new_account": False,
                    },
                ),
            )
            changed = False
            for email_key, meta in demo_defaults:
                existing = reg.get(email_key)
                if not isinstance(existing, dict) or not existing.get("password"):
                    merged = dict(meta)
                    if isinstance(existing, dict):
                        merged.update({k: v for k, v in existing.items() if v})
                    merged["password"] = DEMO_ACCOUNT_PASSWORD
                    reg[email_key] = merged
                    changed = True
            if changed:
                cur.execute(
                    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('account_registry', ?)",
                    (json.dumps(reg),),
                )
            self._conn.commit()

    def _migrate_legacy_account_identities(self) -> None:
        """One-shot rewrite of the pre-rename built-in account ldaps/handles in an existing SQLite workspace.

        Seeds are only applied to empty tables, so a workspace created before the
        rename still carries `efch@google.com` / `alex.rivera@google.com` (and the
        `efch@'s Personal Agent`-style handles) in users, agents, files, tickets,
        A2A logs and JSON-encoded app settings. Every TEXT column of every table is
        rewritten once; agent/user ids (`agent_user_efch`) contain no `@` and stay.
        """
        with self._lock:
            cur = self._conn.cursor()
            done = cur.execute(
                "SELECT value FROM app_settings WHERE key = ?",
                (IDENTITY_MIGRATION_SETTING_KEY,),
            ).fetchone()
            if done:
                return
            tables = [
                r["name"]
                for r in cur.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                ).fetchall()
            ]
            like_clause = " OR ".join(
                f'"{{col}}" LIKE \'%{old}%\'' for old, _ in LEGACY_ACCOUNT_HANDLE_REPLACEMENTS
            )
            for table in tables:
                text_cols = [
                    r["name"]
                    for r in cur.execute(f'PRAGMA table_info("{table}")').fetchall()
                    if not str(r["type"] or "").upper().startswith(("INT", "REAL", "NUM"))
                ]
                for col in text_cols:
                    expr = f'"{col}"'
                    for old, new in LEGACY_ACCOUNT_HANDLE_REPLACEMENTS:
                        expr = f"REPLACE({expr}, '{old}', '{new}')"
                    where = like_clause.format(col=col)
                    cur.execute(f'UPDATE "{table}" SET "{col}" = {expr} WHERE {where}')
            cur.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
                (IDENTITY_MIGRATION_SETTING_KEY, "done"),
            )
            self._conn.commit()

    def is_seeded(self) -> bool:
        with self._lock:
            if not self._use_sqlite:
                return bool(self._doc_store.get("projects"))
            row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM projects"
            ).fetchone()
            return bool(row and row["cnt"] > 0)

    def _are_agents_seeded(self) -> bool:
        with self._lock:
            if not self._use_sqlite:
                return bool(self._doc_store.get("user_agents"))
            row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM user_agents"
            ).fetchone()
            return bool(row and row["cnt"] > 0)

    def _are_tickets_seeded(self) -> bool:
        with self._lock:
            if not self._use_sqlite:
                return bool(self._doc_store.get("agent_tickets"))
            row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM agent_tickets"
            ).fetchone()
            return bool(row and row["cnt"] > 0)
