"""Per-visitor sign-in sessions for Murph (the HttpOnly `murph_sid` cookie).

Every browser that signs in (a demo account, a password account or Google)
gets its own random session token. The server keeps only the token's SHA-256
digest, mapped to the signed-in account, so the account a request acts as
always comes from the server and never from anything the browser claims:

- `VisitorSessionStore.create(...)` mints a token for a sign-in;
- `get(token)` returns the live session (expired ones are dropped);
- `delete(token)` ends it (sign-out, or switching to another account).

Sessions last 24 h and are written through to `app_settings`
(`visitor_sessions_v1`), so a local restart keeps people signed in. Only
digests are stored, never usable tokens.

A Google sign-in whose email has no Murph account yet parks the verified
identity as a short-lived pending sign-up (15 min, memory only) behind the
`murph_google_signup` cookie; the Sign-Up page then completes it.
"""

from __future__ import annotations

from collections.abc import Callable
import hashlib
import json
import secrets
import threading
import time
from typing import Any

SESSION_COOKIE = "murph_sid"
PENDING_COOKIE = "murph_google_signup"
SESSION_TTL_SECONDS = 24 * 60 * 60
PENDING_TTL_SECONDS = 15 * 60
SETTINGS_KEY = "visitor_sessions_v1"
MAX_SESSIONS = 2000
MAX_PENDING = 500
PROVIDERS = ("demo", "password", "google")


def _digest(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def parse_cookie_header(header: str) -> dict[str, str]:
    """Maps cookie names to raw values from a request `Cookie:` header."""
    cookies: dict[str, str] = {}
    for part in str(header or "").split(";"):
        name, sep, value = part.strip().partition("=")
        name = name.strip()
        if sep and name and name not in cookies:
            cookies[name] = value.strip()
    return cookies


def _cookie(name: str, value: str, max_age: int, secure: bool) -> str:
    parts = [f"{name}={value}", "Path=/", f"Max-Age={max_age}", "HttpOnly", "SameSite=Lax"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def session_cookie(token: str, secure: bool = False) -> str:
    """`Set-Cookie` value carrying a new session token (24 h, HttpOnly)."""
    return _cookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS, secure)


def clear_session_cookie(secure: bool = False) -> str:
    return _cookie(SESSION_COOKIE, "", 0, secure)


def pending_cookie(token: str, secure: bool = False) -> str:
    """`Set-Cookie` value for a pending Google sign-up (15 min, HttpOnly)."""
    return _cookie(PENDING_COOKIE, token, PENDING_TTL_SECONDS, secure)


def clear_pending_cookie(secure: bool = False) -> str:
    return _cookie(PENDING_COOKIE, "", 0, secure)


class VisitorSessionStore:
    """Thread-safe map of session-token digests to signed-in accounts."""

    def __init__(self, store: Any = None, clock: Callable[[], float] = time.time) -> None:
        self._store = store
        self._clock = clock
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, Any]] = {}
        self._pending: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self._store is None:
            return
        try:
            data = json.loads(self._store.get_setting(SETTINGS_KEY, "") or "{}")
        except (AttributeError, TypeError, ValueError):
            data = {}
        now = self._clock()
        if isinstance(data, dict):
            self._sessions = {
                str(key): dict(rec)
                for key, rec in data.items()
                if isinstance(rec, dict) and float(rec.get("expires_at") or 0) > now
            }

    def _persist_locked(self) -> None:
        if self._store is None:
            return
        try:
            self._store.set_setting(SETTINGS_KEY, json.dumps(self._sessions))
        except Exception:  # pylint: disable=broad-except
            pass  # Sessions still work from memory; persistence is a convenience.

    def _purge_locked(self, now: float) -> None:
        expired = [k for k, rec in self._sessions.items() if float(rec.get("expires_at") or 0) <= now]
        for key in expired:
            del self._sessions[key]
        if len(self._sessions) >= MAX_SESSIONS:
            oldest = sorted(self._sessions, key=lambda k: float(self._sessions[k].get("created_at") or 0))
            for key in oldest[: len(self._sessions) - MAX_SESSIONS + 1]:
                del self._sessions[key]

    def create(self, account_id: str, email: str, name: str = "", provider: str = "password") -> str:
        """Starts a 24 h session for `account_id` and returns its token."""
        token = secrets.token_urlsafe(32)
        now = self._clock()
        record = {
            "account_id": str(account_id),
            "email": str(email or "").strip().lower(),
            "name": str(name or ""),
            "provider": provider if provider in PROVIDERS else "password",
            "created_at": now,
            "expires_at": now + SESSION_TTL_SECONDS,
        }
        with self._lock:
            self._purge_locked(now)
            self._sessions[_digest(token)] = record
            self._persist_locked()
        return token

    def get(self, token: str) -> dict[str, Any] | None:
        """The live session behind `token`, or None (unknown or expired)."""
        if not token:
            return None
        key = _digest(token)
        with self._lock:
            record = self._sessions.get(key)
            if record is None:
                return None
            if float(record.get("expires_at") or 0) <= self._clock():
                del self._sessions[key]
                self._persist_locked()
                return None
            return dict(record)

    def delete(self, token: str) -> None:
        if not token:
            return
        with self._lock:
            if self._sessions.pop(_digest(token), None) is not None:
                self._persist_locked()

    def create_pending(self, identity: dict[str, Any]) -> str:
        """Parks a verified Google identity for the Sign-Up page (15 min)."""
        token = secrets.token_urlsafe(32)
        now = self._clock()
        with self._lock:
            for key in [k for k, rec in self._pending.items() if rec["expires_at"] <= now]:
                del self._pending[key]
            if len(self._pending) >= MAX_PENDING:
                oldest = sorted(self._pending, key=lambda k: self._pending[k]["expires_at"])
                for key in oldest[: len(self._pending) - MAX_PENDING + 1]:
                    del self._pending[key]
            self._pending[_digest(token)] = {
                **{k: str(v) for k, v in identity.items()},
                "expires_at": now + PENDING_TTL_SECONDS,
            }
        return token

    def get_pending(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        with self._lock:
            record = self._pending.get(_digest(token))
            if record is None or record["expires_at"] <= self._clock():
                self._pending.pop(_digest(token), None)
                return None
            return {k: v for k, v in record.items() if k != "expires_at"}

    def delete_pending(self, token: str) -> None:
        if token:
            with self._lock:
                self._pending.pop(_digest(token), None)
