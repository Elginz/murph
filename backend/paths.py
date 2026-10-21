"""Filesystem layout of the Murph project, resolved in one place.

    <project root>/
      main.py      launcher (`python3 main.py`)
      backend/     Python packages (this module lives here)
      frontend/    static UI, served under `/static/` (and `/` for index.html)
      data/        runtime SQLite database (git-ignored, created on demand)
"""

from __future__ import annotations

import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DOTENV_PATH = os.path.join(PROJECT_ROOT, ".env")

DB_FILENAME = "murph_workspace.db"
# Where the database lived before the backend/frontend split (project root).
LEGACY_DB_PATH = os.path.join(PROJECT_ROOT, DB_FILENAME)


def resolve_db_path() -> str:
    """Returns `$MURPH_DB_PATH`, else `data/murph_workspace.db` (or a legacy root-level DB)."""
    override = os.environ.get("MURPH_DB_PATH", "").strip()
    if override:
        if override == ":memory:":
            return override
        return os.path.abspath(os.path.expanduser(override))
    preferred = os.path.join(DATA_DIR, DB_FILENAME)
    if not os.path.exists(preferred) and os.path.isfile(LEGACY_DB_PATH):
        return LEGACY_DB_PATH
    return preferred
