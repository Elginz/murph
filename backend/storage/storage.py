"""Thread-Safe SQLite Persistence Facade for Murph (`storage.py`).

Composes:
- `storage_schema.py` (`StorageSchemaAndSeedMixin`): DDL schema creation & seed initialization.
- `storage_users_files.py` (`StorageUsersAndFilesMixin`): App settings, users, personal/team agents, files & A2A logs.
- `storage_projects_tickets.py` (`StorageProjectsAndTicketsMixin`): Projects, claims, policy packs, PSO rate card, debate/memory logs & tickets.
"""

from __future__ import annotations

import json
import os
try:
    import sqlite3 as _sqlite3
except ImportError:
    _sqlite3 = None  # type: ignore
import threading
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend import paths
    from google3.experimental.users.efch.murph.backend.storage import storage_projects_tickets
    from google3.experimental.users.efch.murph.backend.storage import storage_schema
    from google3.experimental.users.efch.murph.backend.storage import storage_users_files
else:
    try:
        from google3.experimental.users.efch.murph.backend import paths
        from google3.experimental.users.efch.murph.backend.storage import storage_projects_tickets
        from google3.experimental.users.efch.murph.backend.storage import storage_schema
        from google3.experimental.users.efch.murph.backend.storage import storage_users_files
    except ImportError:
        from backend import paths  # type: ignore
        from backend.storage import storage_projects_tickets  # type: ignore
        from backend.storage import storage_schema  # type: ignore
        from backend.storage import storage_users_files  # type: ignore

# $MURPH_DB_PATH, else data/murph_workspace.db (or a legacy root-level file); see paths.py.
DEFAULT_DB_PATH = paths.resolve_db_path()


class MurphStorage(
    storage_schema.StorageSchemaAndSeedMixin,
    storage_users_files.StorageUsersAndFilesMixin,
    storage_projects_tickets.StorageProjectsAndTicketsMixin,
):
    """Thread-safe SQLite storage manager for Murph workspaces, projects, policies, and rate cards."""

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path if db_path is not None else DEFAULT_DB_PATH
        self._lock = threading.RLock()
        self._use_sqlite = _sqlite3 is not None
        self._conn: Any = None
        self._doc_store: dict[str, Any] = {
            "app_settings": {},
            "users": [],
            "user_agents": [],
            "user_files": [],
            "a2a_messages": [],
            "agent_tickets": [],
            "projects": {},
            "claims": {},
            "policy_packs": [],
            "policy_rules": [],
            "rate_card": [],
            "debate_logs": {},
            "memory_logs": [],
        }
        if self.db_path != ":memory:":
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
            except OSError:
                pass
        if self._use_sqlite and _sqlite3 is not None:
            try:
                self._conn = _sqlite3.connect(
                    self.db_path, check_same_thread=False
                )
                self._conn.row_factory = _sqlite3.Row
                self._init_schema()
            except Exception:  # pylint: disable=broad-except
                self._use_sqlite = False
                self._conn = None
        if not self._use_sqlite and self.db_path != ":memory:":
            self._load_json_fallback()

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def _load_json_fallback(self) -> None:
        if self.db_path != ":memory:" and os.path.isfile(self.db_path):
            try:
                with open(self.db_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                for k, v in loaded.items():
                    self._doc_store[k] = v
            except Exception:  # pylint: disable=broad-except
                pass
        self._migrate_legacy_account_identities_json()

    def _migrate_legacy_account_identities_json(self) -> None:
        """JSON-store twin of `StorageSchemaAndSeedMixin._migrate_legacy_account_identities`."""
        settings = self._doc_store.setdefault("app_settings", {})
        if settings.get(storage_schema.IDENTITY_MIGRATION_SETTING_KEY):
            return
        serialized = json.dumps(self._doc_store)
        for old, new in storage_schema.LEGACY_ACCOUNT_HANDLE_REPLACEMENTS:
            serialized = serialized.replace(old, new)
        self._doc_store = json.loads(serialized)
        self._doc_store.setdefault("app_settings", {})[
            storage_schema.IDENTITY_MIGRATION_SETTING_KEY
        ] = "done"
        self._save_json_fallback()

    def _save_json_fallback(self) -> None:
        if not self._use_sqlite and self.db_path != ":memory:":
            with open(self.db_path, "w", encoding="utf-8") as f:
                json.dump(self._doc_store, f, indent=2)
