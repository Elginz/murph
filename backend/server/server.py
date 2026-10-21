"""HTTP Server & Request Handler Facade for Murph (`backend/server/server.py`).

Started by the project-root `main.py`. Composes:
- `server_assets.py` (`ServerAssetsAndExportMixin`): Static asset serving, HTML fragment assembly & `.zip`/`.md`/`.json` exports.
- `server_routes.py` (`ServerRoutesMixin`): `do_GET` and `do_POST` REST API route dispatch.
- `server_sessions.py` (`VisitorSessionStore`): one sign-in session per browser (HttpOnly `murph_sid`).
"""

from __future__ import annotations
from typing import TYPE_CHECKING

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
import socket
import threading

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine
    from google3.experimental.users.efch.murph.backend.server import server_assets
    from google3.experimental.users.efch.murph.backend.server import server_routes
    from google3.experimental.users.efch.murph.backend.server import server_sessions
    from google3.experimental.users.efch.murph.backend.storage import storage
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine
        from google3.experimental.users.efch.murph.backend.server import server_assets
        from google3.experimental.users.efch.murph.backend.server import server_routes
        from google3.experimental.users.efch.murph.backend.server import server_sessions
        from google3.experimental.users.efch.murph.backend.storage import storage
    except ImportError:
        from backend.engine import engine  # type: ignore
        from backend.server import server_assets  # type: ignore
        from backend.server import server_routes  # type: ignore
        from backend.server import server_sessions  # type: ignore
        from backend.storage import storage  # type: ignore


GLOBAL_ENGINE = engine.PreFlightEngine(db_path=storage.DEFAULT_DB_PATH)
GLOBAL_SESSIONS = server_sessions.VisitorSessionStore(GLOBAL_ENGINE.store)
# Extra local listeners so browser tabs already open on any of these ports keep working.
MIRROR_PORTS = (8088, 8080, 8788)


class PreFlightRequestHandler(
    server_assets.ServerAssetsAndExportMixin,
    server_routes.ServerRoutesMixin,
    BaseHTTPRequestHandler,
):
    """Serves static frontend assets and JSON/Export API endpoints for Murph."""

    engine_instance = GLOBAL_ENGINE
    session_store = GLOBAL_SESSIONS


class DualStackThreadingHTTPServer(ThreadingHTTPServer):
    """Dual-stack HTTP server accepting both IPv6 ([::]) and IPv4 (0.0.0.0) connections."""

    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128

    def server_bind(self) -> None:
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except OSError:
            pass
        super().server_bind()


def _create_http_server(host: str, port: int) -> ThreadingHTTPServer:
    ThreadingHTTPServer.allow_reuse_address = True
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer.request_queue_size = 128
    if host in ("0.0.0.0", "::", ""):
        try:
            return DualStackThreadingHTTPServer(("::", port), PreFlightRequestHandler)
        except OSError:
            pass
    return ThreadingHTTPServer((host, port), PreFlightRequestHandler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Murph Full-Stack Web Server")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8080")),
        help="Port to listen on (default: $PORT or 8080)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="::",
        help="Host interface to bind (default: :: dual-stack IPv6/IPv4)",
    )
    parser.add_argument(
        "--no-mirrors",
        action="store_true",
        help="Only listen on --port (implied when $PORT is set, e.g. on Cloud Run)",
    )
    args = parser.parse_args()

    httpd = _create_http_server(args.host, args.port)
    print(f"Murph server listening on http://[::]:{args.port} (dual-stack IPv4+IPv6)", flush=True)
    print(f"Murph database: {storage.DEFAULT_DB_PATH}", flush=True)

    # Locally, also serve the mirror ports in background threads. Containers expose only
    # $PORT, so mirrors are skipped there (and whenever --no-mirrors is passed).
    mirrors_enabled = not args.no_mirrors and not os.environ.get("PORT")
    for mirror_port in MIRROR_PORTS if mirrors_enabled else ():
        if mirror_port == args.port:
            continue
        try:
            secondary_httpd = _create_http_server(args.host, mirror_port)
            threading.Thread(target=secondary_httpd.serve_forever, daemon=True).start()
            print(f"Murph mirror listener also active on http://[::]:{mirror_port}", flush=True)
        except OSError:
            pass

    httpd.serve_forever()


if __name__ == "__main__":
    main()

