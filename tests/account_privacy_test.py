"""Tests for private Sign-Up accounts, per-visitor sessions and state redaction.

Only the Cloud and Marketing demo accounts are shared. Every other account is
private to whoever signed in to it, so no other visitor may see it in the state
JSON, tickets or A2A. What a response shows comes only from the visitor's
server session (`murph_sid`), never from a cookie the browser writes itself.
Google sign-in and the identity guard are covered in `google_signin_test.py`.
"""

from __future__ import annotations

import copy
import io
import json
from typing import Any, TYPE_CHECKING
import unittest
from urllib.parse import quote

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine
    from google3.experimental.users.efch.murph.backend.engine import engine_registration
    from google3.experimental.users.efch.murph.backend.server import server_assets
    from google3.experimental.users.efch.murph.backend.server import server_routes_accounts
    from google3.experimental.users.efch.murph.backend.server import server_sessions
    from google3.experimental.users.efch.murph.backend.server import state_privacy
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine
        from google3.experimental.users.efch.murph.backend.engine import engine_registration
        from google3.experimental.users.efch.murph.backend.server import server_assets
        from google3.experimental.users.efch.murph.backend.server import server_routes_accounts
        from google3.experimental.users.efch.murph.backend.server import server_sessions
        from google3.experimental.users.efch.murph.backend.server import state_privacy
    except ImportError:
        from backend.engine import engine  # type: ignore
        from backend.engine import engine_registration  # type: ignore
        from backend.server import server_assets  # type: ignore
        from backend.server import server_routes_accounts  # type: ignore
        from backend.server import server_sessions  # type: ignore
        from backend.server import state_privacy  # type: ignore

SAM = "sam.chen@google.com"
SAM_ID = "user_sam_chen"
SAM_FILE = "sam_brand_playbook.md"
PASSWORD = "s3cret-pass"


def _forged_hint_cookie(account_key: str, email: str) -> str:
    """A `murph_auth_session` cookie in the frontend's own format (a UI hint)."""
    value = quote(json.dumps({"accountKey": account_key, "email": email, "name": "x", "ts": 1}))
    return f"murph_auth_session={value}"


class _FakeHandler(
    server_assets.ServerAssetsAndExportMixin,
    server_routes_accounts.ServerAccountRoutesMixin,
):
    """Just enough of `BaseHTTPRequestHandler` to drive the JSON helpers and routes."""

    def __init__(self, eng: Any, sessions: Any, cookie: str = "") -> None:
        self.engine_instance = eng
        self.session_store = sessions
        self.headers = {"Cookie": cookie} if cookie else {}
        self.wfile = io.BytesIO()
        self.status = 0
        self.sent_headers: list[tuple[str, str]] = []

    def send_response(self, code: int, message: str | None = None) -> None:
        del message
        self.status = int(code)

    def send_header(self, keyword: str, value: str) -> None:
        self.sent_headers.append((keyword, value))

    def end_headers(self) -> None:
        pass

    def raw_body(self) -> str:
        return self.wfile.getvalue().decode("utf-8")

    def body(self) -> dict[str, Any]:
        return json.loads(self.raw_body())

    def set_cookies(self) -> list[str]:
        return [v for k, v in self.sent_headers if k == "Set-Cookie"]


class AccountPrivacyTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        self.eng = engine.PreFlightEngine(db_path=":memory:")
        self.sessions = server_sessions.VisitorSessionStore(self.eng.store)

    def tearDown(self) -> None:
        self.eng.close()
        super().tearDown()

    def _register_sam(self) -> None:
        self.eng.register_user_account(
            ldap=SAM,
            name="Sam Chen",
            role="Product Marketing Manager",
            org="Cloud Marketing",
            team_agent_id="brand_agent",
            personal_agent_name="Sam Chen's Launch Agent",
            initial_files=[
                {
                    "filename": SAM_FILE,
                    "content": "Embargoed brand naming lockup, keynote headline and blog copy for the GCP launch.",
                }
            ],
            password=PASSWORD,
        )

    def _sam_file_id(self) -> str:
        return next(
            f["id"] for f in self.eng.store.list_user_files() if f["user_id"] == SAM_ID
        )

    def _redact(self, state: dict[str, Any], viewer: str) -> dict[str, Any]:
        return state_privacy.redact_state_for_viewer(
            state, viewer, self.eng.store.list_users()
        )

    def _assert_no_sam(self, payload: Any) -> None:
        text = json.dumps(payload).lower()
        for needle in ("sam.chen", SAM_ID, "sam chen", "embargoed", '"password":', PASSWORD):
            self.assertNotIn(needle, text)

    def test_sign_up_rejects_duplicates_demo_emails_and_agent_hijacks(self) -> None:
        self._register_sam()
        rejected = (
            (SAM, "already has an account"),
            ("SAM.CHEN@google.com", "already has an account"),
            ("sam.chen@gmail.com", "username 'sam_chen' is already taken"),
            ("efch@google.com", "reserved for the demo accounts"),
            ("alex.rivera@google.com", "reserved for the demo accounts"),
            ("marketing_demo@google.com", "reserved for the demo accounts"),
            ("owner@example.com", "reserved for the demo accounts"),
            ("efch@example.com", "username 'efch' is reserved"),
            ("alex.rivera@example.com", "username 'alex_rivera' is reserved"),
            ("@@", "valid work email"),
        )
        before = self.eng.store.list_users()
        for email, message in rejected:
            with self.assertRaisesRegex(ValueError, message):
                self.eng.register_user_account(ldap=email, name="Imposter", password="pw")
        with self.assertRaisesRegex(ValueError, "Choose a different password"):
            self.eng.register_user_account(
                ldap="new.person@google.com",
                password=engine_registration.RETIRED_GOOGLE_OAUTH_PASSWORD,
            )
        self.assertEqual(self.eng.store.list_users(), before)
        self.assertEqual(self.eng.store.get_user_agent("agent_user_efch")["owner_user_id"], "persona_creator")
        self.assertEqual(
            self.eng.store.get_user_agent("agent_user_alex_rivera")["owner_user_id"], "persona_brand"
        )

    def test_retired_google_auto_accounts_cannot_sign_in(self) -> None:
        self.eng.store.upsert_user(
            {
                "id": "user_legacy_person",
                "ldap": "legacy.person@google.com",
                "name": "Legacy Person",
                "role": "Stakeholder",
                "department": "Google Cloud",
                "default_lens": "pm_agent",
                "default_stage": "1",
                "nda_clearance": "Tier-2 Cleared",
                "badge": "USER",
                "description": "Auto-created by the old Google sign-in.",
                "password": engine_registration.RETIRED_GOOGLE_OAUTH_PASSWORD,
            }
        )
        with self.assertRaisesRegex(ValueError, "can no longer sign in"):
            self.eng.login_user(
                custom_ldap="legacy.person@google.com",
                password=engine_registration.RETIRED_GOOGLE_OAUTH_PASSWORD,
                require_password=True,
            )
        with self.assertRaisesRegex(ValueError, "can no longer sign in"):
            self.eng.login_user(persona_id="user_legacy_person")
        self._register_sam()
        state = self.eng.login_user(custom_ldap=SAM, password=PASSWORD, require_password=True)
        self.assertEqual(state["current_user"]["id"], SAM_ID)

    def test_other_browsers_never_see_a_private_account(self) -> None:
        self._register_sam()
        self.eng.ask_user_agent(
            question="What is in my brand playbook?",
            user_id=SAM_ID,
            ldap=SAM,
            environment=f"user:{SAM_ID}",
        )
        self.eng.create_agent_ticket(
            title="Sam keynote clearance",
            request_summary="Need a legal clearance review of the keynote wording",
            target_user_ids=["persona_legal"],
            user_id=SAM_ID,
        )
        self.eng.create_custom_workflow(
            folder_name="Sam Launch Workflow",
            description="Private launch plan",
            prompt_text="Check my playbook",
            selected_files=[SAM_FILE],
            creator_user_id=SAM_ID,
            environment=f"user:{SAM_ID}",
        )
        state = self.eng.get_state()
        self.assertEqual(state["current_user"]["id"], SAM_ID)
        snapshot = copy.deepcopy(state)

        for viewer, persona in (
            ("", "persona_creator"),
            ("cloud", "persona_creator"),
            ("dm", "persona_brand"),
            ("user_someone_else", "persona_creator"),
            ("marketing_demo@google.com", "persona_brand"),
        ):
            out = self._redact(state, viewer)
            self._assert_no_sam(out)
            self.assertEqual(out["current_user"]["id"], persona)
            self.assertFalse(str(out["active_environment"]).startswith("user:"))
            mesh = out["agent_mesh"]
            self.assertEqual(mesh["total_nodes"], len(mesh["nodes"]))
            self.assertEqual(mesh["total_edges"], len(mesh["edges"]))
            self.assertTrue(any(n["id"] == "agent_user_efch" for n in mesh["nodes"]))
        self.assertEqual(state, snapshot)

        for viewer in (SAM_ID, SAM):
            out = self._redact(state, viewer)
            self.assertNotIn('"password"', json.dumps(out))
            self.assertEqual(out["current_user"]["id"], SAM_ID)
            self.assertIn(SAM_ID, {p["id"] for p in out["personas"]})
            self.assertIn("agent_user_sam_chen", {a["id"] for a in out["user_agents"]})
            self.assertIn(SAM_FILE, {f["filename"] for f in out["all_user_files"]})
            self.assertTrue(any(m["user_id"] == SAM_ID for m in out["a2a_messages"]))
            self.assertTrue(any(t["requester_user_id"] == SAM_ID for t in out["agent_tickets"]))

        # Items that explicitly tag a demo account stay visible to that account only.
        self.eng.create_custom_workflow(
            folder_name="Sam Shared Workflow",
            prompt_text="Please review my launch copy",
            tagged_users=["cloud_demo@google.com"],
            creator_user_id=SAM_ID,
            environment=f"user:{SAM_ID}",
        )
        shared = self.eng.get_state()
        cloud_view = self._redact(shared, "cloud")
        cloud_folders = {w["folder_name"] for w in cloud_view["custom_workflows"]}
        self.assertIn("SAM SHARED WORKFLOW", cloud_folders)
        self.assertNotIn("SAM LAUNCH WORKFLOW", cloud_folders)
        self.assertNotIn(SAM_ID, {p["id"] for p in cloud_view["personas"]})
        dm_view = self._redact(shared, "dm")
        self.assertNotIn("SAM SHARED WORKFLOW", {w["folder_name"] for w in dm_view["custom_workflows"]})

    def test_state_follows_the_server_session_not_browser_cookies(self) -> None:
        self._register_sam()
        self.eng.logout_user()
        state = self.eng.get_state()
        token = self.sessions.create(SAM_ID, SAM, "Sam Chen", "password")

        owner = _FakeHandler(self.eng, self.sessions, cookie=f"theme=light; murph_sid={token}")
        owner._send_json(state)
        body = owner.body()
        self.assertIn(SAM_ID, {p["id"] for p in body["personas"]})
        self.assertEqual(body["current_user"]["id"], SAM_ID)
        self.assertEqual(body["active_environment"], f"user:{SAM_ID}")
        self.assertEqual(
            {k: body["viewer_session"][k] for k in ("signed_in", "account_key", "email", "provider")},
            {"signed_in": True, "account_key": SAM_ID, "email": SAM, "provider": "password"},
        )
        self.assertNotIn('"password":', owner.raw_body())
        self.assertNotIn(PASSWORD, owner.raw_body())

        # The readable hint cookie and unknown tokens name nobody.
        for cookie in (_forged_hint_cookie(SAM_ID, SAM), "murph_sid=not-a-real-token", ""):
            stranger = _FakeHandler(self.eng, self.sessions, cookie=cookie)
            stranger._send_json(state)
            self._assert_no_sam(stranger.body())
            self.assertEqual(stranger.body()["viewer_session"], {"signed_in": False})
        export = _FakeHandler(self.eng, self.sessions, cookie=_forged_hint_cookie(SAM_ID, SAM))
        export._serve_project_json_export()
        self._assert_no_sam(export.body())

        # Signing out ends the session for good, and its reply is already redacted.
        signing_out = _FakeHandler(self.eng, self.sessions, cookie=f"murph_sid={token}")
        self.assertTrue(signing_out._dispatch_account_post("/api/auth/logout", {}))
        self._assert_no_sam(signing_out.body())
        cookies = signing_out.set_cookies()
        self.assertIn("murph_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax", cookies)
        self.assertIn("murph_auth_session=; Path=/; Max-Age=0; SameSite=Lax", cookies)
        self.assertIsNone(self.sessions.get(token))
        after = _FakeHandler(self.eng, self.sessions, cookie=f"murph_sid={token}")
        after._send_json(state)
        self._assert_no_sam(after.body())

        plain = _FakeHandler(self.eng, self.sessions)
        plain._send_json({"ok": True, "note": SAM})
        self.assertEqual(plain.body(), {"ok": True, "note": SAM})

    def test_removed_routes_are_not_handled(self) -> None:
        for path in ("/api/auth/google_adc_login", "/api/accounts/known", "/api/other"):
            handler = _FakeHandler(self.eng, self.sessions)
            self.assertFalse(handler._dispatch_account_post(path, {"email": "cloud_demo@google.com"}))
            self.assertEqual(handler.set_cookies(), [])

    def test_tickets_and_a2a_never_route_to_another_private_account(self) -> None:
        self._register_sam()
        sam_file_id = self._sam_file_id()
        self.eng.register_user_account(
            ldap="kai.wong@google.com", name="Kai Wong", team_agent_id="brand_agent", password=PASSWORD
        )

        def kai_ticket(summary: str) -> dict[str, Any]:
            state = self.eng.create_agent_ticket(
                title="Brand naming review",
                request_summary=summary,
                reference_file_ids=[SAM_FILE, sam_file_id],
                user_id="user_kai_wong",
            )
            return next(t for t in state["agent_tickets"] if t["request_summary"] == summary)

        for summary in (
            "Need help with the brand naming lockup, keynote headline and blog copy",
            "@sam please review the brand naming lockup",
        ):
            ticket = kai_ticket(summary)
            self.assertNotIn(SAM_ID, {p["user_id"] for p in ticket["participating_users"]})
            self.assertNotIn(sam_file_id, {sf["id"] for sf in ticket["shared_files"]})
            self.assertNotIn("embargoed", json.dumps(ticket).lower())

        tagged = kai_ticket("@sam.chen please review the brand naming lockup")
        sam_rows = [p for p in tagged["participating_users"] if p["user_id"] == SAM_ID]
        self.assertEqual([p["routing_mode"] for p in sam_rows], ["tagged"])

        self.eng.ask_user_agent(
            question="brand naming lockup keynote headline blog copy",
            user_id="persona_creator",
            ldap="cloud_demo@google.com",
            environment="cloud",
        )
        cloud_msg = [m for m in self.eng.a2a_messages if m["user_id"] == "persona_creator"][-1]
        msg_text = json.dumps(cloud_msg).lower()
        for needle in ("sam.chen", "sam chen", SAM_FILE, sam_file_id.lower(), "embargoed"):
            self.assertNotIn(needle, msg_text)


if __name__ == "__main__":
    unittest.main()
