"""Unit tests for the terminal agent's A2A grounding: own files first, policy rules from Team Agents, no cross-account leaks."""

from __future__ import annotations
from typing import TYPE_CHECKING

import unittest

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine
    except ImportError:
        from backend.engine import engine  # type: ignore


class MurphAgentA2AGroundingTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        self.eng = engine.PreFlightEngine(db_path=":memory:")

    def tearDown(self) -> None:
        self.eng.close()
        super().tearDown()

    @staticmethod
    def _cited_filenames(a2a: dict) -> set[str]:
        return {
            cf["filename"]
            for h in a2a["hops"]
            for cf in h.get("cited_files", [])
        }

    def test_isolated_account_agent_answers_from_own_files_and_policy_rules_only(
        self,
    ) -> None:
        self.eng.register_user_account(
            ldap="sam.chen@google.com",
            name="Sam Chen",
            role="Product Marketing Manager",
            org="Cloud Marketing",
            team_agent_id="brand_agent",
            initial_files=[
                {
                    "filename": "Keynote_Draft_Questions.md",
                    "content": "Need confirmation from Legal and Commercial on Apex Global Bank logo and $82,000 SAP mainframe scope.",
                }
            ],
        )

        state = self.eng.ask_user_agent(
            question="Can we use the Apex Global Bank logo, is Singapore GA or Preview, and why is the $82,000 SAP mainframe scope blocked?"
        )
        latest_a2a = state["a2a_messages"][0]
        self.assertEqual(
            latest_a2a["personal_agent_id"], "agent_user_sam_chen"
        )
        self.assertEqual(latest_a2a["team_agent_id"], "brand_agent")
        self.assertEqual(latest_a2a["grounding_mode"], "own_files")
        self.assertFalse(latest_a2a["llm_live"])

        contacted_team_ids = {h["to_agent_id"] for h in latest_a2a["hops"]}
        self.assertIn("legal_agent", contacted_team_ids)
        self.assertIn("pm_agent", contacted_team_ids)
        self.assertIn("commercial_agent", contacted_team_ids)

        # Own file is the primary (and only) file source; nothing from Cloud / DM leaks in.
        self.assertEqual(
            self._cited_filenames(latest_a2a), {"Keynote_Draft_Questions.md"}
        )
        self.assertEqual(
            latest_a2a["sources"]["files"], ["Keynote_Draft_Questions.md"]
        )
        self.assertTrue(latest_a2a["sources"]["rules"])
        self.assertTrue(
            all(h["cited_rules"] for h in latest_a2a["hops"][1:]),
            "Team Agents must still contribute Policy Pack rules",
        )
        self.assertIn("Keynote_Draft_Questions.md", latest_a2a["final_answer"])
        self.assertIn("Apex Global Bank", latest_a2a["final_answer"])
        self.assertNotIn(
            "customer_nda_clearance_vault_2026.md", latest_a2a["final_answer"]
        )

    def test_cloud_persona_agent_keeps_federated_mesh_files(self) -> None:
        self.eng.login_user(persona_id="persona_creator", environment="cloud")
        state = self.eng.ask_user_agent(
            question="Can we use the Apex Global Bank logo, is Singapore GA or Preview, and what fits the $60k PSO budget?",
            user_id="persona_creator",
            environment="cloud",
        )
        latest_a2a = state["a2a_messages"][0]
        self.assertEqual(latest_a2a["grounding_mode"], "federated_mesh")
        cited = self._cited_filenames(latest_a2a)
        self.assertIn("customer_nda_clearance_vault_2026.md", cited)
        self.assertIn("q4_pso_rate_card_and_bench_capacity.md", cited)
        self.assertIn("vertex_v24_prd_and_regional_roadmap.md", cited)

    def test_terminal_identity_overrides_server_side_session(self) -> None:
        """The browser's account (user_id/ldap/environment) wins over whoever logged in last on the server."""
        self.eng.register_user_account(
            ldap="jane.doe@google.com",
            name="Jane Doe",
            role="PMM",
            department="Security",
            team_agent_id="pm_agent",
            environment="",
            start_empty=False,
            password="pw",
            initial_files=[
                {
                    "filename": "starter_reference.md",
                    "content": "# Launch tone\nAlways lead with customer outcomes.\nNever quote unreleased pricing.\nBudget guardrail: $40k for Q4 pilots.",
                }
            ],
        )
        # Another account signs in afterwards: the server-side session is now the Cloud persona.
        self.eng.login_user(persona_id="persona_creator", environment="cloud")

        state = self.eng.ask_user_agent(
            question="What budget guardrail applies to Q4 pilots?",
            user_id="user_jane_doe",
            ldap="jane.doe@google.com",
            environment="user_jane_doe",
        )
        latest_a2a = state["a2a_messages"][0]
        self.assertEqual(latest_a2a["user_id"], "user_jane_doe")
        self.assertEqual(latest_a2a["environment"], "user_jane_doe")
        self.assertEqual(latest_a2a["grounding_mode"], "own_files")
        self.assertEqual(latest_a2a["sources"]["files"], ["starter_reference.md"])
        self.assertIn("$40k for Q4 pilots", latest_a2a["final_answer"])
        self.assertNotIn("uploaded by priya.nair", latest_a2a["final_answer"])

    def test_a2a_grounding_metadata_survives_sqlite_round_trip(self) -> None:
        """`grounding_mode` / `sources` live in `meta_json`, so a fresh storage read must still return them."""
        self.eng.register_user_account(
            ldap="kai.wong@google.com",
            name="Kai Wong",
            role="PMM",
            org="Cloud Marketing",
            team_agent_id="brand_agent",
            initial_files=[
                {"filename": "notes.md", "content": "Pilot budget is $12k."}
            ],
        )
        self.eng.ask_user_agent(question="What is the pilot budget?")
        reloaded = self.eng.store.get_a2a_messages()[0]
        self.assertEqual(reloaded["grounding_mode"], "own_files")
        self.assertEqual(reloaded["sources"]["files"], ["notes.md"])
        self.assertIn("llm_live", reloaded)
        self.assertIn("environment", reloaded)
        # Seeded demo records predate meta_json and must still load cleanly.
        seeded = self.eng.store.get_a2a_messages()[-1]
        self.assertTrue(seeded["id"].startswith("A2A-"))
        self.assertIsInstance(seeded["hops"], list)

    def test_private_blue_file_from_isolated_account_stays_with_that_account(
        self,
    ) -> None:
        """Right-click → New Blue File on a self-registered desktop: owner/env follow the browser identity, not the server session."""
        self.eng.register_user_account(
            ldap="jane.doe@google.com",
            name="Jane Doe",
            role="PMM",
            department="Security",
            team_agent_id="pm_agent",
            start_empty=True,
            password="pw",
        )
        # Server-side session moves on to the Cloud persona (another tab / demo account).
        self.eng.login_user(persona_id="persona_creator", environment="cloud")

        state = self.eng.upload_user_file(
            filename="Launch_Checklist.md",
            content="Pilot budget guardrail: $40k for Q4 pilots.",
            visibility="private",
            user_id="user_jane_doe",
            ldap="jane.doe@google.com",
            environment="user_jane_doe",  # frontend account key form
        )
        self.assertEqual(state["active_environment"], "cloud")
        record = next(
            f for f in state["user_files"] if f["filename"] == "Launch_Checklist.md"
        )
        self.assertEqual(record["user_id"], "user_jane_doe")
        self.assertEqual(record["user_ldap"], "jane.doe@google.com")
        self.assertEqual(record["environment"], "user:user_jane_doe")
        self.assertEqual(record["visibility"], "private")

        question = "What budget guardrail applies to Q4 pilots?"
        cloud_state = self.eng.ask_user_agent(
            question=question, user_id="persona_creator", environment="cloud"
        )
        self.assertNotIn(
            "Launch_Checklist.md",
            self._cited_filenames(cloud_state["a2a_messages"][0]),
            "a private blue file must never ground another account's agent",
        )
        jane_state = self.eng.ask_user_agent(
            question=question,
            user_id="user_jane_doe",
            ldap="jane.doe@google.com",
            environment="user_jane_doe",
        )
        self.assertEqual(
            jane_state["a2a_messages"][0]["sources"]["files"],
            ["Launch_Checklist.md"],
        )

    def test_upload_without_identity_falls_back_to_server_session(self) -> None:
        """Built-in Cloud/DM accounts keep today's behaviour: federated, owned by the logged-in persona."""
        self.eng.login_user(persona_id="persona_brand", environment="dm")
        state = self.eng.upload_user_file(
            filename="DM_Brief.md", content="Brand brief for Q4."
        )
        record = next(
            f for f in state["user_files"] if f["filename"] == "DM_Brief.md"
        )
        self.assertEqual(record["user_id"], "persona_brand")
        self.assertEqual(record["environment"], "dm")
        self.assertEqual(record["visibility"], "federated")

    def test_workspace_context_forwarded_to_live_llm_and_ignored_by_fallback(
        self,
    ) -> None:
        captured: dict[str, str] = {}
        orig_fn = self.eng.llm_client.run_federated_a2a_consultation

        def spy_a2a(**kwargs):  # type: ignore[no-untyped-def]
            captured["workspace_context"] = kwargs.get("workspace_context", "")
            return orig_fn(**kwargs)

        self.eng.llm_client.run_federated_a2a_consultation = spy_a2a  # type: ignore[method-assign]
        long_ctx = "Active workflows: DEMO CLAIM FIX (5 open) | " + ("x" * 1600)
        state = self.eng.ask_user_agent(
            question="Can we use the Apex Global Bank logo?",
            user_id="persona_creator",
            environment="cloud",
            workspace_context=long_ctx,
        )
        self.assertEqual(len(captured["workspace_context"]), 1500)
        self.assertTrue(
            captured["workspace_context"].startswith(
                "Active workflows: DEMO CLAIM FIX"
            )
        )
        # Deterministic fallback must not echo the workspace_context blob into final_answer
        self.assertNotIn(
            "xxxx", state["a2a_messages"][0]["final_answer"]
        )

    def test_ticket_routing_mode_tagged_vs_auto_routed(self) -> None:
        """Explicitly @tagged users get routing_mode='tagged', while Central Workspace Agent matches get 'auto_routed'."""
        # 1. Explicit @tagged user via target_user_ids / @mention
        state_tagged = self.eng.create_agent_ticket(
            title="NDA clearance check with @priya.nair",
            request_summary="Verify #REF-2091 anonymized attribution with @priya.nair",
            user_id="persona_creator",
            target_user_ids=["priya.nair@google.com"],
        )
        t_tagged = state_tagged["agent_tickets"][0]
        p_tagged = t_tagged["participating_users"]
        self.assertEqual(p_tagged[0]["routing_mode"], "requester")
        priya_entry = next(u for u in p_tagged if u["ldap"] == "priya.nair@google.com")
        self.assertEqual(priya_entry["routing_mode"], "tagged")

        # 2. Auto-routed peers when no target_user_ids or @mentions are supplied
        state_auto = self.eng.create_agent_ticket(
            title="Regional GA and PSO budget alignment",
            request_summary="Check Singapore Preview timeline and $60,000 PSO rate card.",
            user_id="persona_creator",
        )
        t_auto = state_auto["agent_tickets"][0]
        p_auto = t_auto["participating_users"]
        self.assertEqual(p_auto[0]["routing_mode"], "requester")
        for peer in p_auto[1:]:
            self.assertEqual(peer["routing_mode"], "auto_routed")

    def test_unmatched_greeting_or_chitchat_does_not_dump_unrelated_files(
        self,
    ) -> None:
        self.eng.login_user(persona_id="persona_creator", environment="cloud")
        state = self.eng.ask_user_agent(
            question="hey there",
            user_id="persona_creator",
            environment="cloud",
        )
        latest_a2a = state["a2a_messages"][0]
        self.assertEqual(latest_a2a["hops"], [])
        self.assertNotIn(
            "Apex Global Bank", latest_a2a["final_answer"]
        )
        self.assertNotIn(
            "vertex_v24_prd_and_regional_roadmap.md", latest_a2a["final_answer"]
        )
        self.assertIn("Agent Help Desk", latest_a2a["final_answer"])

    def test_multi_turn_conversational_agent_with_ui_action_and_clean_sources(self) -> None:
        captured: dict = {}

        def fake_live_agent(**kwargs):  # type: ignore[no-untyped-def]
            captured["conversation_history"] = kwargs.get("conversation_history")
            captured["question"] = kwargs.get("question")
            return {
                "final_answer": "Doing great! I opened DEMO CLAIM FIX for you so you can inspect the 5 open claims.",
                "sources": [],
                "suggested_chips": ["What is blocking launch?", "Open tickets", "Explain Claim Fixes"],
                "ui_action": {"action": "open_popup", "popup_id": "136:468", "target_title": "DEMO CLAIM FIX"},
                "hop_Overrides": [],
            }

        self.eng.llm_client.run_federated_a2a_consultation = fake_live_agent  # type: ignore[method-assign]
        history = [{"role": "user", "text": "hey there"}, {"role": "model", "text": "Hey! How can I help with your workflows today?"}]
        state = self.eng.ask_user_agent(
            question="how are u? also open my cloud claim fix workflow",
            user_id="persona_creator",
            environment="cloud",
            workspace_context="Visible Desktop Workflows: DEMO CLAIM FIX [popup_id=136:468]",
            conversation_history=history,
        )
        latest_a2a = state["a2a_messages"][0]
        self.assertTrue(latest_a2a["llm_live"])
        self.assertEqual(captured["conversation_history"], history)
        self.assertEqual(latest_a2a["sources"], {"files": [], "rules": []})
        self.assertEqual(latest_a2a["hops"], [])
        self.assertEqual(latest_a2a["ui_action"], {"action": "open_popup", "popup_id": "136:468", "target_title": "DEMO CLAIM FIX"})
        self.assertEqual(latest_a2a["suggested_chips"], ["What is blocking launch?", "Open tickets", "Explain Claim Fixes"])

    def test_change_file_sharing_scope_federated_to_private_updates_in_place(self) -> None:
        """Uploading folder.pdf as federated and changing it to private updates the same file row in place."""
        self.eng.login_user(persona_id="persona_creator", environment="cloud")
        state1 = self.eng.upload_user_file(
            filename="folder.pdf", content="Confidential architecture roadmap for Q4.", visibility="federated",
            user_id="persona_creator", ldap="cloud_demo@google.com", environment="cloud",
        )
        matches1 = [f for f in state1["user_files"] if f["filename"] == "folder.pdf"]
        self.assertEqual((len(matches1), matches1[0]["visibility"]), (1, "federated"))
        orig_id = matches1[0]["id"]
        state2 = self.eng.upload_user_file(
            filename="folder.pdf", content="Confidential architecture roadmap for Q4.", visibility="private",
            user_id="persona_creator", ldap="cloud_demo@google.com", environment="cloud",
        )
        matches2 = [f for f in state2["user_files"] if f["filename"] == "folder.pdf"]
        self.assertEqual((len(matches2), matches2[0]["id"], matches2[0]["visibility"]), (1, orig_id, "private"))

    def test_terminal_model_sync_and_legacy_gemini_migration(self) -> None:
        """Default model is gemini-3.8-flash, legacy 2.5/2.0 models auto-migrate, and ask_user_agent syncs the terminal model."""
        self.assertEqual(self.eng.llm_client.model, "gemini-3.8-flash")
        self.eng.configure_llm(model="gemini-2.5-pro")
        self.assertEqual(self.eng.llm_client.model, "gemini-3.1-pro-preview")
        self.eng.configure_llm(model="gemini-2.5-flash-lite")
        self.assertEqual(self.eng.llm_client.model, "gemini-3.5-flash-lite")
        state = self.eng.ask_user_agent(question="hey there", user_id="persona_creator", environment="cloud", model="gemini-3.1-pro-preview")
        self.assertEqual((self.eng.llm_client.model, state["llm_status"]["model"], state["a2a_messages"][0]["model"]), ("gemini-3.1-pro-preview",) * 3)

    def test_bottom_dock_workflow_sync_assets_and_wiring(self) -> None:
        """Bottom Dock icons (99:300) and all 5 popups are dynamically synced to active user workflows and files."""
        import pathlib

        root = pathlib.Path(__file__).absolute().parents[1]
        dock_js = (root / "frontend/js/03e-dock-workflow-sync.js").read_text(encoding="utf-8")
        dock_css = (root / "frontend/css/03c-dock-workflow-sync.css").read_text(encoding="utf-8")
        for fn_tok in ("function syncBottomDockAndPopups(", "function getActiveUserDesktopSetup(", "function setDockLoginSessionActive(", "function handleDockWorkflowAction(", "dock-launch-workflow-type", "setPopupNodeVisible('183:453'", "136:730", "155:1214", "136:836", "136:890", "136:942"):
            self.assertIn(fn_tok, dock_js)
        for css_tok in (".dock-empty-state-panel", ".dock-workflow-context-banner", ".dock-app-empty", ".dock-app-active", 'body:not(.dock-theme-dark) [data-node-id="99:300"]', 'body.dock-theme-dark [data-node-id="99:300"]'):
            self.assertIn(css_tok, dock_css)
        for html_rel in ("frontend/index.html",):
            for js_rel in ("/static/js/03e-dock-workflow-sync.js", "/static/js/04d-topology-svg-builder.js"):
                self.assertIn(js_rel, (root / html_rel).read_text(encoding="utf-8"))
        for css_rel in ("frontend/styles.css",):
            css_text = (root / css_rel).read_text(encoding="utf-8")
            for css_mod in ("03c-dock-workflow-sync", "10-popup-light-mode", "11-popup-interactive-cards", "12-light-mode-legibility", "13-font-size-floor"):
                self.assertIn(f"/static/css/{css_mod}.css", css_text)
        popup_light_css = (root / "frontend/css/10-popup-light-mode.css").read_text(encoding="utf-8")
        for css_tok in ("body:not(.dock-theme-dark) .os-floating-window", "--_fill-7JJJA6: #0F172A", "--_fill-7JJJA6: #F8FAFC", "--_fill-4J7WBC: #FFFFFF", 'body:not(.dock-theme-dark) #popup-155-1214 [data-node-id="155:1289"]', 'body.dock-theme-dark #popup-155-1214 [data-node-id="155:1289"]', "#FEF2F2 !important", "#ECFDF5 !important", ".doc-format-banner", ".doc-format-pill"):
            self.assertIn(css_tok, popup_light_css)
        overlay_html = "".join((root / "frontend/fragments" / name).read_text(encoding="utf-8") for name in ("06-overlay-popups.html", "06-overlay-part2.html", "06-overlay-part3.html"))
        for legacy_footer in ('data-node-id="183:475"', 'data-node-id="183:482"', 'id="ticket-quick-tag-bar"', 'data-node-id="183:267"', 'data-node-id="136:937"', 'data-node-id="183:130"', 'data-node-id="155:1326"'):
            self.assertNotIn(legacy_footer, overlay_html)
        self.assertIn('[data-node-id="155:1326"] {\n  display: none !important;', dock_css)
        topo_js = (root / "frontend/js/04c-workload-route-topology.js").read_text(encoding="utf-8")
        self.assertIn("getDockThemeMode() === 'light'", topo_js)
        svg_js = (root / "frontend/js/04d-topology-svg-builder.js").read_text(encoding="utf-8")
        self.assertNotIn("function buildRouteSvgHtml(", topo_js)
        for tok in ("function buildRouteSvgHtml(", "measureText", "function topoWrap(", "getDockThemeMode() === 'light'"):
            self.assertIn(tok, svg_js)
        legibility_css = (root / "frontend/css/12-light-mode-legibility.css").read_text(encoding="utf-8")
        self.assertNotIn("body.dock-theme-dark", legibility_css)
        for tok in ("body:not(.dock-theme-dark) :is(#popup-136-341", "#0369A1", "#B45309", '.dock-app-empty > [data-node-name="Dock icon"]', "--pop-cta-grad"):
            self.assertIn(tok, legibility_css)
        floor_css = (root / "frontend/css/13-font-size-floor.css").read_text(encoding="utf-8")
        for tok in ('[data-node-name="Dock app"] [data-node-name="Label"]', '[data-node-name="Detail"]', ".wf-tag-pill", ".gemini-model-opt-badge", ".settled-update-banner"):
            self.assertIn(tok, floor_css)
        tour_js = (root / "frontend/js/09-onboarding-tour.js").read_text(encoding="utf-8")
        guide_js = (root / "frontend/js/03d-welcome-guide-app.js").read_text(encoding="utf-8")
        renderer_js = (root / "frontend/js/03b-desktop-renderer.js").read_text(encoding="utf-8")
        self.assertNotIn("Create Account", tour_js + guide_js)
        self.assertNotIn("FRESH WORKSPACE", renderer_js)
        helpdesk_js = (root / "frontend/js/06b-terminal-helpdesk.js").read_text(encoding="utf-8")
        for chip in ("makeChip('Help', 'Help')", "makeChip('My workflows', 'My workflows')", "makeChip('Models', 'Models')"):
            self.assertIn(chip, helpdesk_js)
        self.assertNotIn("makeChip('Blockers'", helpdesk_js)
        self.assertNotIn("makeChip('Files'", helpdesk_js)
        drag_js = (root / "frontend/js/05-drag-and-viewport.js").read_text(encoding="utf-8")
        core_css = (root / "frontend/css/01-figma-tokens-and-core.css").read_text(encoding="utf-8")
        for tok in ("murph_desktop_icon_positions_v2", "resetDesktopDomElementsToDefault", "clearAccountDesktopPositions", "is-unlocking-exit", "is-unlocking-enter", "Math.max(1440, Math.ceil(vw / homeScale))", "Math.max(860, Math.round(vh / homeScale))", "--dock-bottom-gap", "--dock-responsive-scale", "lock-screen-active"):
            self.assertIn(tok, drag_js)
        for css_tok in ("@keyframes murphLockCurtainExit", "@keyframes murphUnlockShipPulse", "justify-content: space-between !important;", "var(--dock-bottom-gap, 26px)", "var(--dock-responsive-scale, 1)"):
            self.assertIn(css_tok, core_css)
        config_js = (root / "frontend/js/01-config-and-state.js").read_text(encoding="utf-8")
        auth_js = (root / "frontend/js/02-auth-and-user-settings.js").read_text(encoding="utf-8")
        auth_css = (root / "frontend/css/04-auth-and-user-settings.css").read_text(encoding="utf-8")
        badges_js = (root / "frontend/js/03a-desktop-badges-and-storage.js").read_text(encoding="utf-8")
        popup_js = (root / "frontend/js/04b-workload-topology-and-deliverables.js").read_text(encoding="utf-8")
        for tok in ("TOAST_AUTO_CLOSE_MS = 5000", "Array.from(document.querySelectorAll('.os-popup-wrapper'))"):
            self.assertIn(tok, config_js)
        for tok in ("function isUserCurrentlySignedIn(", "is-signed-out", "MURPH AGENT CONSOLE / session:signed-out / auth:required"):
            self.assertIn(tok, auth_js)
        self.assertIn(".sticky-user-signed-out-icon", auth_css)
        for tok in ("function markDesktopItemSeenFromPopup(", "function bumpDesktopItemNotification("):
            self.assertIn(tok, badges_js)
        for tok in ("markDesktopItemSeenFromPopup(popupId", "Array.from(popupWrappers", "resetPopupWindowSize("):
            self.assertIn(tok, popup_js)
        self.assertIn("data-custom-wf-files", renderer_js)
        state_sync_js = (root / "frontend/js/02b-figma-state-sync.js").read_text(encoding="utf-8")
        intro_html = (root / "frontend/fragments/01-screen-intro.html").read_text(encoding="utf-8")
        home_html = (root / "frontend/fragments/04-screen-home.html").read_text(encoding="utf-8")
        self.assertNotIn("MESH 12/12", intro_html + home_html)
        self.assertIn('data-api-action="toggle-theme-mode"', intro_html)
        self.assertIn('data-api-action="toggle-theme-mode"', home_html)
        for tok in ("DOCK_THEME_STORAGE_KEY", "function toggleDockThemeMode(", "cardEl.appendChild(modelMenuEl)", "turn.speaker_agent_name", "compromise_summary", "function getScopedTicketsForActiveUser(", "my-agent-extra-tickets-list", "MURPH_AUDIO_VOLUME_SCALE = 1.5", "peakGain * MURPH_AUDIO_VOLUME_SCALE"):
            self.assertIn(tok, state_sync_js)
        self.assertNotIn("header: '183:439'", state_sync_js)
        self.assertNotIn("turn1: '183:443'", state_sync_js)
        self.assertNotIn("MESH ${peerCount}/${peerCount}", state_sync_js)
        for css_tok in ("@keyframes geminiDropdownUnfold", "@keyframes geminiOptionRunDown", ".gemini-model-menu.open .gemini-model-option:nth-child(4)"):
            self.assertIn(css_tok, auth_css)
        for dock_label in ("Cross-Team", "Claim Fixes", "Blocker Alerts", "Policy &amp; Sync", "Deliverables"):
            self.assertIn(dock_label, home_html)
        ptr_js = (root / "frontend/js/05b-pointer-drag-events.js").read_text(encoding="utf-8")
        events_js = (root / "frontend/js/08-events-and-init.js").read_text(encoding="utf-8")
        pop_css = (root / "frontend/css/02-desktop-and-popups.css").read_text(encoding="utf-8")
        asym_css = (root / "frontend/css/02c-asymmetric-popup-layouts.css").read_text(encoding="utf-8")
        for r_tok in ("function getPopupResizeEdge(", "function togglePopupMaximize(", "function resetPopupWindowSize("):
            self.assertIn(r_tok, ptr_js)
        self.assertIn("togglePopupMaximize(popupWin)", events_js)
        self.assertIn("container-type: inline-size;", pop_css)
        self.assertIn("@container (max-width: 720px)", asym_css)

    def test_google_sign_in_is_limited_to_the_two_demo_accounts(self) -> None:
        """"Sign in with Google" opens only the Cloud/Marketing demos; personal Google identities are rejected and never auto-registered."""
        for email in ("efch@google.com", "", "sam.chen@google.com"):
            with self.assertRaises(ValueError):
                self.eng.login_with_google_adc(email=email, name="Elgin Foo", auto_query_drive=False)
        self.assertFalse({"user_efch", "user_sam_chen"} & {u["id"] for u in self.eng.store.list_users()})
        res_demo = self.eng.login_with_google_adc(email="marketing_demo@google.com", name="Marketing User", auto_query_drive=False)
        self.assertEqual((res_demo["account_key"], res_demo["current_user"]["ldap"], res_demo["google_auth"]["is_new_account"]), ("dm", "marketing_demo@google.com", False))
        self.assertEqual(self.eng.login_with_google_adc(email="cloud_demo@google.com")["account_key"], "cloud")

    def test_point_c_and_d_workflow_file_grounding_private_redaction_and_bilateral_signoff(self) -> None:
        """Point C & D: Workflow Wizard resolves desktop display names + private files (redacted) and requires tagged reviewer sign-off before approved."""
        self.eng.login_user(persona_id="persona_creator", environment="cloud")
        self.eng.upload_user_file(
            filename="Secret_Internal_Runbook.md",
            content="CONFIDENTIAL_API_TOKEN=xyz987\nBudget guardrail: $54,000 Wave 1 cap.\nRequire anonymized #REF-2091 attribution.",
            visibility="private", user_id="persona_creator", ldap="cloud_demo@google.com", environment="cloud",
        )
        wf_state = self.eng.create_custom_workflow(
            folder_name="Keynote Legal & Private Runbook Vet",
            description="Vet launch brief and private runbook with Legal",
            wf_filename="KEYNOTE_VET.wf",
            workflow_type="tickets",
            prompt_text="Confirm Apex Global Bank #REF-2091 wording and Wave 1 $54,000 scope.",
            selected_files=["DEMO LAUNCH BRIEF.md", "Secret_Internal_Runbook.md"],
            tagged_users=["priya.nair@google.com"],
            environment="cloud", creator_user_id="persona_creator", creator_ldap="cloud_demo@google.com",
        )
        wf = wf_state["custom_workflows"][-1]
        tkt = next(t for t in wf_state["agent_tickets"] if t["id"] == wf["ticket_id"])
        shared_by_name = {sf["filename"]: sf for sf in tkt["shared_files"]}
        self.assertIn("cloud_next_keynote_run_of_show.md", shared_by_name)
        self.assertIn("Secret_Internal_Runbook.md", shared_by_name)
        priv_sf = shared_by_name["Secret_Internal_Runbook.md"]
        self.assertEqual((priv_sf["visibility"], priv_sf.get("raw_redacted")), ("private_vetted_summary", True))
        self.assertNotIn("CONFIDENTIAL_API_TOKEN=xyz987", priv_sf["content"])
        self.assertEqual((tkt["approvals"]["persona_creator"]["status"], tkt["approvals"]["persona_legal"]["status"]), ("approved", "pending"))
        approved_state = self.eng.act_on_agent_ticket(
            ticket_id=tkt["id"], action="approve_compromise", actor_ldap="priya.nair@google.com",
            comment="Vetted by Legal Personal Agent and approved by Priya Nair.",
        )
        tkt_after = next(t for t in approved_state["agent_tickets"] if t["id"] == tkt["id"])
        self.assertEqual((tkt_after["approvals"]["persona_legal"]["status"], tkt_after["status"]), ("approved", "approved"))
        self.assertEqual(approved_state["custom_workflows"][-1]["ticket_status"], "approved")


if __name__ == "__main__":
    unittest.main()
