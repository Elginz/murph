"""Account Routes Mixin: sign-in, sign-up, sign-out and per-visitor sessions.

Every sign-in starts a server-side session for this browser only
(`server_sessions`, HttpOnly `murph_sid` cookie). Who a request acts as and
what the state JSON shows both come from that session (`server_identity`),
never from anything the browser sends:

- `GET  /api/auth/config`: `{google_client_id, google_enabled}`.
- `GET  /api/auth/session`: `{viewer_session}` for this browser.
- `POST /api/auth/google {access_token}`: "Sign in with Google". Google checks
  the token (`google_identity`); a registered email signs straight in, any
  other gets `{status: "needs_signup", email, name}` plus a 15-minute pending
  sign-up cookie for the Sign-Up page.
- `POST /api/auth/login`: demo or password sign-in; a password is always
  required (`require_password` from the client is ignored).
- `POST /api/auth/register`: password Sign-Up, or `google_signup: true` to
  finish a pending Google sign-up (email from Google, no password).
- `POST /api/auth/logout`, `POST /api/accounts/reset_registered`: end the session.

`auth_cookie_header` builds the readable `murph_auth_session` cookie, a hint
for the UI only; the server never trusts it.
"""

from __future__ import annotations

from http import HTTPStatus
import json
from typing import Any, TYPE_CHECKING
from urllib.parse import quote

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.server import google_identity
    from google3.experimental.users.efch.murph.backend.server import server_identity
    from google3.experimental.users.efch.murph.backend.server import server_sessions
else:
    try:
        from google3.experimental.users.efch.murph.backend.server import google_identity
        from google3.experimental.users.efch.murph.backend.server import server_identity
        from google3.experimental.users.efch.murph.backend.server import server_sessions
    except ImportError:
        from backend.server import google_identity  # type: ignore
        from backend.server import server_identity  # type: ignore
        from backend.server import server_sessions  # type: ignore

MIN_PASSWORD_LENGTH = 6
SIGNED_OUT = (None, "")
LOCK_SCREEN_COOKIE = "murph_active_screen=lock; Path=/; Max-Age=86400; SameSite=Lax"
CLEAR_HINT_COOKIE = "murph_auth_session=; Path=/; Max-Age=0; SameSite=Lax"


def auth_cookie_header(user: dict[str, Any], account_key: str = "") -> str:
    """Readable `murph_auth_session` cookie naming the account (UI hint only)."""
    payload = quote(
        json.dumps(
            {
                "accountKey": str(account_key or user.get("id") or ""),
                "email": str(user.get("email") or user.get("ldap") or ""),
                "name": str(user.get("name") or ""),
            }
        )
    )
    return f"murph_auth_session={payload}; Path=/; Max-Age=86400; SameSite=Lax"


class ServerAccountRoutesMixin:
    """Mixin for the auth routes and the per-visitor session plumbing."""

    engine_instance: Any
    headers: Any
    session_store: Any = None
    google_fetch: Any = None  # Test hook: fake Google HTTP fetcher.
    _send_json: Any

    # --- Session plumbing ---------------------------------------------------

    def _cookie_secure(self) -> bool:
        proto = str(self.headers.get("X-Forwarded-Proto", "") or "")
        return proto.split(",")[0].strip().lower() == "https"

    def _request_cookies(self) -> dict[str, str]:
        return server_sessions.parse_cookie_header(str(self.headers.get("Cookie", "") or ""))

    def _account_row(self, account_id: str) -> dict[str, Any] | None:
        return next(
            (
                u
                for u in self.engine_instance.store.list_users()
                if account_id and str(u.get("id")) == str(account_id)
            ),
            None,
        )

    def _current_visitor(self) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """(session token, session record, account row) behind this request.

        A session whose account no longer exists (e.g. after a reset) is
        deleted and the visitor counts as signed out.
        """
        cached = self.__dict__.get("_visitor_cache")
        if cached is not None:
            return cached
        token = self._request_cookies().get(server_sessions.SESSION_COOKIE, "")
        store = self.session_store
        record = store.get(token) if store is not None and token else None
        account = self._account_row(str(record["account_id"])) if record else None
        if record and account is None:
            store.delete(token)
            record = None
        visitor = (token, record, account)
        self.__dict__["_visitor_cache"] = visitor
        return visitor

    def _visitor_view(self) -> tuple[dict[str, Any] | None, str]:
        """(account row or None, sign-in provider) of this request's visitor."""
        _, record, account = self._current_visitor()
        return account, str((record or {}).get("provider") or "")

    def _start_session(self, res: dict[str, Any], account_id: str, provider: str) -> None:
        """Signs this browser in as `account_id` and sends `res` with fresh cookies."""
        account = self._account_row(account_id)
        if account is None or self.session_store is None:
            self._send_json(
                {"error": "Sign-in failed. Try again."},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return
        old_token, _, _ = self._current_visitor()
        self.session_store.delete(old_token)
        token = self.session_store.create(
            account_id, str(account.get("ldap") or ""), str(account.get("name") or ""), provider
        )
        self.__dict__.pop("_visitor_cache", None)
        key = server_identity.account_key_for(account_id)
        secure = self._cookie_secure()
        out = dict(res)
        out.update(account_key=key, account_id=str(account_id))
        self._send_json(
            out,
            cookies=[
                server_sessions.session_cookie(token, secure),
                server_sessions.clear_pending_cookie(secure),
                auth_cookie_header(account, key),
            ],
            visitor=(account, provider),
        )

    def _end_session(self, res: dict[str, Any]) -> None:
        token, _, _ = self._current_visitor()
        if self.session_store is not None:
            self.session_store.delete(token)
        self.__dict__.pop("_visitor_cache", None)
        secure = self._cookie_secure()
        self._send_json(
            res,
            cookies=[
                server_sessions.clear_session_cookie(secure),
                server_sessions.clear_pending_cookie(secure),
                CLEAR_HINT_COOKIE,
                LOCK_SCREEN_COOKIE,
            ],
            visitor=SIGNED_OUT,
        )

    def _bad_request(self, message: str) -> None:
        self._send_json({"error": message}, status=HTTPStatus.BAD_REQUEST)

    # --- Identity guard for every POST ----------------------------------------

    def _session_identity_guard(self, path: str, body: dict[str, Any]) -> dict[str, Any] | None:
        """Body with identity fields from the session, or None after an error reply."""
        if path not in server_identity.IDENTITY_ROUTES:
            return body
        account, _ = self._visitor_view()
        if account is None and path in server_identity.CLOUD_DEMO_WHEN_SIGNED_OUT:
            account = self._account_row(server_identity.CLOUD_ACCOUNT_ID)
        if account is None:
            self._send_json({"error": "Sign in first."}, status=HTTPStatus.UNAUTHORIZED)
            return None
        denied = server_identity.deletion_error(
            path,
            body,
            account,
            self.engine_instance.store.list_user_files(),
            list(self.engine_instance.custom_workflows),
        )
        if denied:
            self._send_json({"error": denied}, status=HTTPStatus.FORBIDDEN)
            return None
        return server_identity.apply_session_identity(path, body, account)

    # --- Routes ----------------------------------------------------------------

    def _dispatch_account_get(self, path: str) -> bool:
        if path == "/api/auth/config":
            client_id = google_identity.configured_client_id()
            self._send_json({"google_client_id": client_id, "google_enabled": bool(client_id)})
            return True
        if path == "/api/auth/session":
            account, provider = self._visitor_view()
            self._send_json(
                {"viewer_session": server_identity.viewer_session_payload(account, provider)}
            )
            return True
        return False

    def _dispatch_account_post(self, path: str, body: dict[str, Any]) -> bool:
        """Handles the auth routes; returns False for any other path."""
        if path == "/api/auth/google":
            self._handle_google_sign_in(body)
        elif path == "/api/auth/login":
            self._handle_password_login(body)
        elif path == "/api/auth/register":
            self._handle_register(body)
        elif path == "/api/auth/logout":
            self._end_session(self.engine_instance.logout_user())
        elif path == "/api/accounts/reset_registered":
            self._end_session(self.engine_instance.reset_registered_accounts())
        else:
            return False
        return True

    def _handle_google_sign_in(self, body: dict[str, Any]) -> None:
        res: dict[str, Any] = {}
        outcome: dict[str, Any] = {}
        try:
            identity = google_identity.verify_access_token(
                str(body.get("access_token") or ""),
                google_identity.configured_client_id(),
                fetch=self.google_fetch,
            )
            outcome = self.engine_instance.resolve_google_sign_in(identity)
            if outcome.get("status") == "signed_in":
                res = self.engine_instance.login_user(persona_id=str(outcome["account_id"]))
        except ValueError as exc:
            self._bad_request(str(exc))
            return
        if outcome.get("status") == "signed_in":
            res["status"] = "signed_in"
            self._start_session(res, str(outcome["account_id"]), "google")
            return
        pending = self.session_store.create_pending(identity)
        self._send_json(
            {
                "status": "needs_signup",
                "email": identity["email"],
                "name": identity["name"],
                "picture": identity["picture"],
            },
            cookies=[server_sessions.pending_cookie(pending, self._cookie_secure())],
        )

    def _handle_password_login(self, body: dict[str, Any]) -> None:
        try:
            res = self.engine_instance.login_user(
                persona_id=str(body.get("persona_id") or ""),
                custom_ldap=str(
                    body.get("custom_ldap") or body.get("email") or body.get("ldap") or ""
                ),
                workspace_tier=str(body.get("workspace_tier") or "collaborative"),
                password=str(body.get("password") or ""),
                environment=str(body.get("environment") or ""),
                require_password=True,
            )
        except ValueError as exc:
            self._bad_request(str(exc))
            return
        account_id = str(res.get("account_id") or "")
        provider = "password" if server_identity.is_private_account(account_id) else "demo"
        self._start_session(res, account_id, provider)

    def _handle_register(self, body: dict[str, Any]) -> None:
        raw_files = body.get("initial_files")
        profile = {
            "name": str(body.get("name") or ""),
            "role": str(body.get("role") or "Team Member"),
            "org": str(body.get("org") or "Google Cloud"),
            "team_agent_id": str(body.get("team_agent_id") or "pm_agent"),
            "personal_agent_name": str(body.get("personal_agent_name") or ""),
            "personal_agent_specialty": str(body.get("personal_agent_specialty") or ""),
            "workspace_tier": str(body.get("workspace_tier") or "collaborative"),
            "initial_files": raw_files if isinstance(raw_files, list) else [],
            "require_initial_file": bool(body.get("require_initial_file", False)),
            "start_empty": bool(body.get("start_empty", False)),
        }
        if body.get("google_signup"):
            self._finish_google_signup(profile)
            return
        password = str(body.get("password") or "")
        if len(password) < MIN_PASSWORD_LENGTH:
            self._bad_request(f"Password needs at least {MIN_PASSWORD_LENGTH} characters.")
            return
        try:
            res = self.engine_instance.register_user_account(
                ldap=str(body.get("ldap") or ""),
                password=password,
                environment=str(body.get("environment") or ""),
                **profile,
            )
        except ValueError as exc:
            self._bad_request(str(exc))
            return
        self._start_session(res, str(res.get("account_id") or ""), "password")

    def _finish_google_signup(self, profile: dict[str, Any]) -> None:
        token = self._request_cookies().get(server_sessions.PENDING_COOKIE, "")
        store = self.session_store
        identity = store.get_pending(token) if store is not None else None
        if not identity:
            self._bad_request(
                "Your Google sign-in expired. Click Sign up with Google again."
            )
            return
        try:
            res = self.engine_instance.register_google_account(identity, **profile)
        except ValueError as exc:
            self._bad_request(str(exc))
            return
        store.delete_pending(token)
        self._start_session(res, str(res.get("account_id") or ""), "google")
