"""Tests for Sign in with Google, per-visitor sessions, and the identity guard."""

from __future__ import annotations

import io
import json
import os
from typing import Any, TYPE_CHECKING
import unittest
from unittest import mock
from urllib.parse import quote

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine
    from google3.experimental.users.efch.murph.backend.seed import seed_data
    from google3.experimental.users.efch.murph.backend.server import google_identity, server_assets, server_identity, server_routes_accounts, server_sessions
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine
        from google3.experimental.users.efch.murph.backend.seed import seed_data
        from google3.experimental.users.efch.murph.backend.server import google_identity, server_assets, server_identity, server_routes_accounts, server_sessions
    except ImportError:
        from backend.engine import engine  # type: ignore
        from backend.seed import seed_data  # type: ignore
        from backend.server import google_identity, server_assets, server_identity, server_routes_accounts, server_sessions  # type: ignore

CLIENT_ID = "1234-murph.apps.googleusercontent.com"
EFCH = "efch@google.com"
SAM = "sam.chen@google.com"
SAM_ID = "user_sam_chen"
PASSWORD = "s3cret-pass"
CLOUD = "cloud_demo@google.com"
SID = server_sessions.SESSION_COOKIE
PENDING = server_sessions.PENDING_COOKIE


class FakeGoogle:
    """A `google_identity` fetcher that answers like Google for one account."""

    def __init__(self, email: str, sub: str, name: str = "") -> None:
        self.tokeninfo: dict[str, Any] = {
            "aud": CLIENT_ID, "azp": CLIENT_ID, "sub": sub, "email": email,
            "email_verified": "true", "expires_in": "3599",
        }
        self.userinfo: dict[str, Any] = {"sub": sub, "name": name, "picture": "https://example.com/p.png"}
        self.token_status = 200
        self.userinfo_status = 200
        self.offline: tuple[str, ...] = ()
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
        self.calls.append((url, dict(headers)))
        if self.offline and url.startswith(self.offline):
            raise OSError("network unreachable")
        if url.startswith(google_identity.TOKENINFO_URL):
            return self.token_status, dict(self.tokeninfo)
        return self.userinfo_status, dict(self.userinfo)


class _FakeHandler(server_assets.ServerAssetsAndExportMixin, server_routes_accounts.ServerAccountRoutesMixin):
    """Just enough of `BaseHTTPRequestHandler` to drive the account routes."""

    def __init__(self, eng: Any, sessions: Any, headers: dict[str, str], google: Any) -> None:
        self.engine_instance = eng
        self.session_store = sessions
        self.google_fetch = google
        self.headers = headers
        self.wfile = io.BytesIO()
        self.status = 0
        self.sent_headers: list[tuple[str, str]] = []

    def send_response(self, code: int, message: str | None = None) -> None:
        del message
        self.status = int(code)

    def send_header(self, keyword: str, value: str) -> None: self.sent_headers.append((keyword, value))
    def end_headers(self) -> None: pass

    def raw_body(self) -> str: return self.wfile.getvalue().decode("utf-8")
    def body(self) -> dict[str, Any]: return json.loads(self.raw_body())
    def set_cookies(self) -> list[str]: return [v for k, v in self.sent_headers if k == "Set-Cookie"]


class _Browser:
    """One visitor: a cookie jar that keeps whatever the server sets."""

    def __init__(self, eng: Any, sessions: Any, https: bool = False) -> None:
        self.eng, self.sessions, self.https = eng, sessions, https
        self.cookies: dict[str, str] = {}

    def _handler(self, google: Any = None) -> _FakeHandler:
        headers = {"Cookie": "; ".join(f"{k}={v}" for k, v in self.cookies.items())}
        if self.https:
            headers["X-Forwarded-Proto"] = "https"
        return _FakeHandler(self.eng, self.sessions, headers, google)

    def _keep(self, handler: _FakeHandler) -> _FakeHandler:
        for header in handler.set_cookies():
            name, _, rest = header.partition("=")
            value = rest.split(";")[0]
            if value and "Max-Age=0" not in header:
                self.cookies[name] = value
            else:
                self.cookies.pop(name, None)
        return handler

    def post(self, path: str, body: dict[str, Any] | None = None, google: Any = None) -> _FakeHandler:
        handler = self._handler(google)
        assert handler._dispatch_account_post(path, body or {}), f"{path} is not an account route"
        return self._keep(handler)

    def get(self, path: str) -> _FakeHandler:
        handler = self._handler()
        assert handler._dispatch_account_get(path), f"{path} is not an account route"
        return self._keep(handler)

    def guard(self, path: str, body: dict[str, Any]) -> tuple[_FakeHandler, dict[str, Any] | None]:
        handler = self._handler()
        return handler, handler._session_identity_guard(path, body)

    def session(self) -> dict[str, Any]: return self.get("/api/auth/session").body()["viewer_session"]


class GoogleTokenCheckTest(unittest.TestCase):

    def check(self, google: FakeGoogle, token: str = "tok", client_id: str = CLIENT_ID) -> dict[str, str]:
        return google_identity.verify_access_token(token, client_id, fetch=google)

    def test_valid_token_returns_the_google_identity(self) -> None:
        google = FakeGoogle("Eunice.Chua@Gmail.com", "g-111", "Eunice Chua")
        self.assertEqual(
            self.check(google),
            {"sub": "g-111", "email": "eunice.chua@gmail.com", "name": "Eunice Chua",
             "picture": "https://example.com/p.png"},
        )
        (token_url, _), (user_url, user_headers) = google.calls
        self.assertEqual(token_url, f"{google_identity.TOKENINFO_URL}?access_token=tok")
        self.assertEqual((user_url, user_headers), (google_identity.USERINFO_URL, {"Authorization": "Bearer tok"}))
        google.tokeninfo["aud"] = "another-client-of-the-project"
        self.assertEqual(self.check(google)["sub"], "g-111")
        with mock.patch.dict(os.environ, {google_identity.CLIENT_ID_ENV: f"  {CLIENT_ID} "}):
            self.assertEqual(google_identity.configured_client_id(), CLIENT_ID)

    def test_refuses_tokens_murph_must_not_trust(self) -> None:
        for changes, message in (
            ({"aud": "evil-app", "azp": "evil-app"}, "different app"),
            ({"email_verified": "false"}, "isn't verified"),
            ({"email_verified": None}, "isn't verified"),
            ({"expires_in": "0"}, "expired"),
            ({"expires_in": "soon"}, "expired"),
            ({"email": ""}, "didn't share an email"),
            ({"sub": ""}, "didn't share an email"),
        ):
            google = FakeGoogle(EFCH, "g-111")
            google.tokeninfo.update(changes)
            with self.assertRaisesRegex(google_identity.GoogleIdentityError, message):
                self.check(google)
        rejected, swapped, offline = (FakeGoogle(EFCH, "g-111") for _ in range(3))
        rejected.token_status = 400
        swapped.userinfo["sub"] = "g-222"
        offline.offline = (google_identity.TOKENINFO_URL,)
        for google, message in ((rejected, "rejected"), (swapped, "different account"),
                                (offline, "Couldn't reach Google")):
            with self.assertRaisesRegex(google_identity.GoogleIdentityError, message):
                self.check(google)
        for token, client_id, message in (("tok", "", "isn't set up"), ("  ", CLIENT_ID, "didn't return"),
                                          ("x" * 5000, CLIENT_ID, "didn't return")):
            with self.assertRaisesRegex(google_identity.GoogleIdentityError, message):
                self.check(FakeGoogle(EFCH, "g-111"), token=token, client_id=client_id)

    def test_name_falls_back_to_the_email_when_userinfo_is_unavailable(self) -> None:
        down = FakeGoogle("kai.wong@google.com", "g-333", "K. Wong")
        down.offline = (google_identity.USERINFO_URL,)
        failing = FakeGoogle("kai.wong@google.com", "g-333", "K. Wong")
        failing.userinfo_status = 500
        for google in (down, failing):
            self.assertEqual(self.check(google)["name"], "Kai Wong")


class VisitorSessionStoreTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        self.now = 1_000_000.0
        self.eng = engine.PreFlightEngine(db_path=":memory:")
        self.addCleanup(self.eng.close)

    def store(self) -> Any:
        return server_sessions.VisitorSessionStore(self.eng.store, clock=lambda: self.now)

    def test_sessions_last_24_hours_and_survive_a_restart(self) -> None:
        sessions = self.store()
        token = sessions.create("persona_creator", "Cloud_Demo@google.com", "Cloud User", "demo")
        record = sessions.get(token)
        assert record is not None
        self.assertEqual(
            (record["account_id"], record["email"], record["provider"]), ("persona_creator", CLOUD, "demo")
        )
        saved = self.eng.store.get_setting(server_sessions.SETTINGS_KEY, "")
        self.assertIn("persona_creator", saved)
        self.assertNotIn(token, saved)
        reloaded = self.store().get(token)
        assert reloaded is not None
        self.assertEqual(reloaded["account_id"], "persona_creator")
        self.now += server_sessions.SESSION_TTL_SECONDS - 1
        self.assertIsNotNone(sessions.get(token))
        self.now += 2
        self.assertIsNone(sessions.get(token))
        self.assertIsNone(self.store().get(token))
        for bad in ("", "not-a-token"):
            self.assertIsNone(sessions.get(bad))
        odd = sessions.create(SAM_ID, SAM, provider="carrier-pigeon")
        odd_rec = sessions.get(odd)
        assert odd_rec is not None
        self.assertEqual(odd_rec["provider"], "password")
        sessions.delete(odd)
        self.assertIsNone(sessions.get(odd))

    def test_pending_google_sign_ups_live_15_minutes_in_memory(self) -> None:
        sessions = self.store()
        identity = {"sub": "g-111", "email": EFCH, "name": "Eunice", "picture": ""}
        pending = sessions.create_pending(identity)
        self.assertEqual(sessions.get_pending(pending), identity)
        self.assertIsNone(self.store().get_pending(pending))
        self.now += server_sessions.PENDING_TTL_SECONDS
        self.assertIsNone(sessions.get_pending(pending))
        again = sessions.create_pending(identity)
        sessions.delete_pending(again)
        self.assertIsNone(sessions.get_pending(again))

    def test_cookies_are_http_only(self) -> None:
        self.assertEqual(
            server_sessions.session_cookie("abc"), "murph_sid=abc; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax"
        )
        self.assertTrue(server_sessions.session_cookie("abc", secure=True).endswith("; SameSite=Lax; Secure"))
        self.assertIn("Max-Age=0", server_sessions.clear_session_cookie())
        self.assertIn("Max-Age=900; HttpOnly", server_sessions.pending_cookie("p"))
        self.assertEqual(
            server_sessions.parse_cookie_header("a=1; murph_sid=x-y; a=2; junk"), {"a": "1", "murph_sid": "x-y"}
        )


class _RoutesTestBase(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        env = mock.patch.dict(os.environ, {google_identity.CLIENT_ID_ENV: CLIENT_ID})
        env.start()
        self.addCleanup(env.stop)
        self.now = 1_000_000.0
        self.eng = engine.PreFlightEngine(db_path=":memory:")
        self.addCleanup(self.eng.close)
        self.sessions = server_sessions.VisitorSessionStore(self.eng.store, clock=lambda: self.now)

    def browser(self, https: bool = False) -> _Browser: return _Browser(self.eng, self.sessions, https)
    def ldaps(self) -> set[str]: return {str(u["ldap"]).lower() for u in self.eng.store.list_users()}
    def row(self, account_id: str) -> dict[str, Any]: return next(u for u in self.eng.store.list_users() if u["id"] == account_id)

    def sign_up_sam(self, files: list[dict[str, str]] | None = None) -> _Browser:
        sam = self.browser()
        res = sam.post("/api/auth/register", {"ldap": SAM, "password": PASSWORD, "name": "Sam Chen", "team_agent_id": "brand_agent", "initial_files": files or [], "start_empty": not files})
        self.assertEqual(res.status, 200, res.raw_body())
        return sam

    def assert_error(self, res: _FakeHandler, status: int, message: str) -> None:
        self.assertEqual(res.status, status, res.raw_body())
        self.assertIn(message, res.body()["error"])


class GoogleSignInRoutesTest(_RoutesTestBase):

    def test_new_google_account_signs_up_once_then_signs_straight_in(self) -> None:
        google = FakeGoogle(EFCH, "g-111", "Eunice Chua")
        laptop = self.browser()
        first = laptop.post("/api/auth/google", {"access_token": "tok"}, google)
        self.assertEqual(
            first.body(),
            {"status": "needs_signup", "email": EFCH, "name": "Eunice Chua", "picture": "https://example.com/p.png"},
        )
        self.assertEqual(set(laptop.cookies), {PENDING})
        self.assertNotIn(EFCH, self.ldaps())
        pending = laptop.cookies[PENDING]

        signup = laptop.post("/api/auth/register", {
            "google_signup": True, "ldap": "someone.else@google.com", "password": "not-used",
            "name": "Eunice C.", "role": "Product Manager", "team_agent_id": "pm_agent", "start_empty": True,
        })
        self.assertEqual(signup.status, 200, signup.raw_body())
        body = signup.body()
        self.assertEqual((body["account_id"], body["account_key"]), ("user_efch_2", "user_efch_2"))
        viewer = body["viewer_session"]
        self.assertEqual((viewer["signed_in"], viewer["email"], viewer["provider"]), (True, EFCH, "google"))
        self.assertTrue(viewer["name"].startswith("Eunice C."))
        self.assertEqual(body["current_user"]["id"], "user_efch_2")
        self.assertEqual(set(laptop.cookies), {SID, "murph_auth_session"})
        self.assertEqual((self.row("user_efch_2")["ldap"], self.row("user_efch_2")["password"]), (EFCH, ""))
        meta = self.eng.account_registry[EFCH]
        self.assertEqual((meta["auth_provider"], meta["google_sub"], meta["password"]), ("google", "g-111", ""))
        self.assertNotIn("someone.else@google.com", self.ldaps())

        replay = self.browser()
        replay.cookies[PENDING] = pending
        self.assert_error(replay.post("/api/auth/register", {"google_signup": True}), 400, "expired")

        phone = self.browser()
        back = phone.post("/api/auth/google", {"access_token": "tok-2"}, google)
        self.assertEqual((back.body()["status"], back.body()["account_key"]), ("signed_in", "user_efch_2"))
        self.assertNotEqual(phone.cookies[SID], laptop.cookies[SID])
        self.assertEqual(laptop.session()["account_id"], "user_efch_2")
        for attempt in ({"custom_ldap": EFCH, "password": "not-used"}, {"persona_id": "user_efch_2"},
                        {"persona_id": "user_efch_2", "require_password": False}):
            self.assert_error(self.browser().post("/api/auth/login", attempt), 400, "signs in with Google")

    def test_sign_up_needs_a_fresh_google_sign_in(self) -> None:
        browser = self.browser()
        self.assert_error(browser.post("/api/auth/register", {"google_signup": True, "name": "X"}), 400, "expired")
        browser.post("/api/auth/google", {"access_token": "tok"}, FakeGoogle(EFCH, "g-111"))
        self.now += server_sessions.PENDING_TTL_SECONDS + 1
        self.assert_error(browser.post("/api/auth/register", {"google_signup": True, "name": "X"}), 400, "expired")
        self.assertNotIn(EFCH, self.ldaps())

    def test_existing_password_account_becomes_google_only(self) -> None:
        self.assert_error(
            self.browser().post("/api/auth/register", {"ldap": SAM, "password": "short"}), 400, "at least 6"
        )
        self.sign_up_sam()
        signed = self.browser().post("/api/auth/google", {"access_token": "tok"}, FakeGoogle(SAM, "g-sam", "Sam"))
        body = signed.body()
        self.assertEqual((body["status"], body["account_key"]), ("signed_in", SAM_ID))
        self.assertEqual(body["viewer_session"]["provider"], "google")
        self.assertEqual(self.row(SAM_ID)["password"], "")
        meta = self.eng.account_registry[SAM]
        self.assertEqual((meta["password"], meta["auth_provider"], meta["google_sub"]), ("", "google", "g-sam"))
        self.assert_error(
            self.browser().post("/api/auth/login", {"custom_ldap": SAM, "password": PASSWORD}),
            400, "signs in with Google",
        )
        self.assert_error(
            self.browser().post("/api/auth/google", {"access_token": "t"}, FakeGoogle(SAM, "g-other")),
            400, "linked to a different Google account",
        )

    def test_demo_and_persona_emails_cannot_use_google(self) -> None:
        for email, message in ((CLOUD, "don't use Google sign-in"),
                               ("marketing_demo@google.com", "don't use Google sign-in"),
                               ("maya.lin@google.com", "built-in Murph persona")):
            browser = self.browser()
            self.assert_error(
                browser.post("/api/auth/google", {"access_token": "t"}, FakeGoogle(email, "g-x")), 400, message
            )
            self.assertEqual(browser.cookies, {})
        with self.assertRaisesRegex(ValueError, "already has a Murph account"):
            self.eng.register_google_account({"sub": "g", "email": "maya.lin@google.com"}, name="M")
        with self.assertRaisesRegex(ValueError, "don't use Google sign-in"):
            self.eng.register_google_account({"sub": "g", "email": CLOUD}, name="C")

    def test_minted_usernames_never_take_someone_elses_agent(self) -> None:
        self.sign_up_sam()
        for email, slug in ((EFCH, "efch_2"), ("alex.rivera@gmail.com", "alex_rivera_2"),
                            ("Sam.Chen@gmail.com", "sam_chen_2"), ("+++@example.com", "google_user"),
                            ("new.person@gmail.com", "new_person")):
            self.assertEqual(self.eng._mint_google_account_slug(email.lower()), slug)

    def test_config_and_session_endpoints(self) -> None:
        browser = self.browser()
        self.assertEqual(
            browser.get("/api/auth/config").body(), {"google_client_id": CLIENT_ID, "google_enabled": True}
        )
        self.assertEqual(browser.session(), {"signed_in": False})
        browser.post("/api/auth/login", {"custom_ldap": CLOUD, "password": seed_data.DEMO_ACCOUNT_PASSWORD})
        viewer = browser.session()
        self.assertEqual(
            {k: viewer[k] for k in ("signed_in", "account_key", "account_id", "email", "provider")},
            {"signed_in": True, "account_key": "cloud", "account_id": "persona_creator", "email": CLOUD,
             "provider": "demo"},
        )
        with mock.patch.dict(os.environ, {google_identity.CLIENT_ID_ENV: ""}):
            self.assertFalse(browser.get("/api/auth/config").body()["google_enabled"])
            self.assert_error(
                self.browser().post("/api/auth/google", {"access_token": "t"}, FakeGoogle(EFCH, "g")),
                400, "isn't set up",
            )


class SessionIdentityGuardTest(_RoutesTestBase):

    def test_identity_fields_come_from_the_session(self) -> None:
        sam = self.sign_up_sam()
        cases = {
            "/api/agent/ask": ({"question": "q", "user_id": "persona_creator", "ldap": CLOUD, "environment": "cloud"},
                               {"user_id": SAM_ID, "ldap": SAM, "email": SAM, "environment": SAM_ID, "question": "q"}),
            "/api/user/files/upload": ({"filename": "a.md", "user_id": "persona_brand", "environment": "dm"},
                                       {"user_id": SAM_ID, "ldap": SAM, "environment": SAM_ID}),
            "/api/auth/update_profile": ({"email": "evil@example.com", "user_id": "persona_creator", "name": "S"},
                                         {"user_id": SAM_ID, "email": SAM, "ldap": SAM, "name": "S"}),
            "/api/tickets/create": ({"user_id": "persona_creator"}, {"user_id": SAM_ID}),
            "/api/tickets/action": ({"actor_user_id": "persona_legal", "actor_ldap": "priya.nair@google.com"},
                                    {"actor_user_id": SAM_ID, "actor_ldap": SAM}),
            "/api/workflows/create": ({"creator_user_id": "persona_creator", "environment": "cloud"},
                                      {"creator_user_id": SAM_ID, "environment": SAM_ID}),
            "/api/auth/switch_env": ({"environment": "cloud"}, {"environment": f"user:{SAM_ID}"}),
        }
        for path, (body, expected) in cases.items():
            handler, out = sam.guard(path, body)
            assert out is not None
            self.assertEqual({k: out.get(k) for k in expected}, expected, path)
            self.assertEqual(handler.status, 0, path)
        _, untouched = sam.guard("/api/drive/query", {"user_id": "persona_creator"})
        self.assertEqual(untouched, {"user_id": "persona_creator"})

    def test_signed_out_visitors_ask_as_cloud_and_get_401_elsewhere(self) -> None:
        self.sign_up_sam()
        forger = self.browser()
        forger.cookies["murph_auth_session"] = quote(json.dumps({"accountKey": SAM_ID, "email": SAM}))
        _, out = forger.guard("/api/agent/ask", {"question": "q", "user_id": SAM_ID, "ldap": SAM})
        assert out is not None
        self.assertEqual((out["user_id"], out["ldap"], out["environment"]), ("persona_creator", CLOUD, "cloud"))
        for path in sorted(server_identity.IDENTITY_ROUTES - server_identity.CLOUD_DEMO_WHEN_SIGNED_OUT):
            handler, out = forger.guard(path, {"user_id": SAM_ID, "ldap": SAM})
            self.assertIsNone(out, path)
            self.assert_error(handler, 401, "Sign in first.")

    def test_a_password_is_always_required(self) -> None:
        self.sign_up_sam()
        for attempt in ({"custom_ldap": SAM, "require_password": False}, {"persona_id": SAM_ID},
                        {"custom_ldap": SAM, "password": "wrong-pass"}, {"custom_ldap": CLOUD},
                        {"persona_id": "persona_creator", "require_password": False}):
            browser = self.browser()
            self.assertEqual(browser.post("/api/auth/login", attempt).status, 400, attempt)
            self.assertNotIn(SID, browser.cookies)
        sam = self.browser()
        sam.post("/api/auth/login", {"custom_ldap": SAM, "password": PASSWORD})
        self.assertEqual((sam.session()["account_key"], sam.session()["provider"]), (SAM_ID, "password"))
        dm = self.browser(https=True)
        res = dm.post("/api/auth/login", {"persona_id": "persona_brand", "password": seed_data.DEMO_ACCOUNT_PASSWORD})
        self.assertEqual((res.body()["account_key"], dm.session()["provider"]), ("dm", "demo"))
        sid_cookie = next(c for c in res.set_cookies() if c.startswith(f"{SID}="))
        self.assertTrue(sid_cookie.endswith("; HttpOnly; SameSite=Lax; Secure"))

    def test_switching_accounts_or_signing_out_ends_the_old_session(self) -> None:
        browser = self.sign_up_sam()
        sam_token = browser.cookies[SID]
        browser.post("/api/auth/login", {"custom_ldap": CLOUD, "password": seed_data.DEMO_ACCOUNT_PASSWORD})
        cloud_token = browser.cookies[SID]
        self.assertNotEqual(cloud_token, sam_token)
        self.assertIsNone(self.sessions.get(sam_token))
        cloud_sess = self.sessions.get(cloud_token)
        assert cloud_sess is not None
        self.assertEqual(cloud_sess["account_id"], "persona_creator")
        bye = browser.post("/api/auth/logout")
        self.assertEqual(bye.body()["viewer_session"], {"signed_in": False})
        self.assertIn("murph_active_screen=lock; Path=/; Max-Age=86400; SameSite=Lax", bye.set_cookies())
        self.assertNotIn(SID, browser.cookies)
        self.assertIsNone(self.sessions.get(cloud_token))
        self.assertEqual(browser.session(), {"signed_in": False})

    def test_sessions_expire_and_end_with_their_account(self) -> None:
        sam = self.sign_up_sam()
        self.now += server_sessions.SESSION_TTL_SECONDS - 60
        self.assertTrue(sam.session()["signed_in"])
        self.now += 120
        self.assertEqual(sam.session(), {"signed_in": False})
        handler, out = sam.guard("/api/user/files/upload", {"filename": "a.md"})
        self.assertEqual((out, handler.status), (None, 401))
        sam.post("/api/auth/login", {"custom_ldap": SAM, "password": PASSWORD})
        token = sam.cookies[SID]
        self.eng.reset_registered_accounts()
        self.assertEqual(sam.session(), {"signed_in": False})
        self.assertIsNone(self.sessions.get(token))

    def test_private_items_can_only_be_deleted_by_their_owner(self) -> None:
        sam = self.sign_up_sam([{"filename": "sam_plan.md", "content": "Private launch plan."}])
        kai = self.browser()
        kai.post("/api/auth/register", {"ldap": "kai.wong@google.com", "password": PASSWORD, "name": "Kai"})
        cloud = self.browser()
        cloud.post("/api/auth/login", {"custom_ldap": CLOUD, "password": seed_data.DEMO_ACCOUNT_PASSWORD})
        files = self.eng.store.list_user_files()
        sam_file = next(f["id"] for f in files if f["user_id"] == SAM_ID)
        cloud_file = next(f["id"] for f in files if f["user_id"] == "persona_creator")
        self.eng.create_custom_workflow(
            folder_name="Sam Plan", prompt_text="Check my plan", creator_user_id=SAM_ID, environment=f"user:{SAM_ID}"
        )
        for intruder in (kai, cloud):
            for path, body in (("/api/user/files/delete", {"file_id": sam_file}),
                               ("/api/workflows/delete", {"folder_name": "Sam Plan"})):
                handler, out = intruder.guard(path, body)
                self.assertEqual((out, handler.status), (None, 403), path)
        handler, out = sam.guard("/api/user/files/delete", {"file_id": cloud_file})
        self.assertEqual((out, handler.status), (None, 403))
        self.assertIsNotNone(sam.guard("/api/user/files/delete", {"file_id": sam_file})[1])
        _, own = sam.guard("/api/workflows/delete", {"folder_name": "sam plan"})
        assert own is not None
        self.assertEqual((own["requester_ldap"], own["requester_env"]), (SAM, SAM_ID))
        self.assertIsNotNone(cloud.guard("/api/user/files/delete", {"file_id": cloud_file})[1])


if __name__ == "__main__":
    unittest.main()
