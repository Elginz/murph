"""Murph launcher: starts the web UI + REST API server.

    python3 main.py                  # http://localhost:8080 (+ mirror ports 8088 and 8788)
    python3 main.py --port 8088      # choose the main port
    python3 main.py --no-mirrors     # listen on --port only

Containers (Cloud Run) set $PORT; the server then listens on that port only.
Optional environment: GEMINI_API_KEY (live Gemini), MURPH_DB_PATH (SQLite file).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.server import server
else:
    try:
        from google3.experimental.users.efch.murph.backend.server import server
    except ImportError:
        from backend.server import server  # type: ignore


if __name__ == "__main__":
    server.main()
