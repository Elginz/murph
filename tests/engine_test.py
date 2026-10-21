"""Unit tests for Murph core SQLite persistence, Project/Claim/Policy/RateCard CRUD, and Gemini role agents."""

from __future__ import annotations
from typing import TYPE_CHECKING

import os
import tempfile
import unittest
from unittest import mock

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine
    except ImportError:
        from backend.engine import engine  # type: ignore


class PreFlightEngineTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        self.eng = engine.PreFlightEngine(db_path=":memory:")

    def tearDown(self) -> None:
        self.eng.close()
        super().tearDown()

    def test_initial_hybrid_scenario_state(self) -> None:
        state = self.eng.get_state()
        self.assertEqual(state["active_scenario_id"], "cloud_launch_hybrid")
        self.assertEqual(state["readiness"]["hard_stops"], 2)
        self.assertEqual(state["readiness"]["auto_fixes_pending"], 3)
        self.assertEqual(state["feasibility"]["budget_status"], "overrun")
        self.assertEqual(state["feasibility"]["projected_spend"], 82000)
        self.assertGreaterEqual(len(state["feasibility"]["rate_card"]), 4)

    def test_autofix_all_stage1_drift(self) -> None:
        state = self.eng.apply_autofix()
        self.assertEqual(state["readiness"]["auto_fixes_pending"], 0)
        self.assertEqual(state["readiness"]["hard_stops"], 2)
        self.assertIn(
            "Vertex AI Agent Builder on Google Cloud", state["document_text"]
        )
        self.assertIn("up to 3.2x lower p99 latency", state["document_text"])

    def test_resolve_escalations_updates_feasibility_and_memory(self) -> None:
        self.eng.apply_autofix()
        self.eng.resolve_escalation(
            claim_id="CLM-104",
            action="approve_compromise",
            promote_to_rule=True,
        )
        state = self.eng.resolve_escalation(
            claim_id="CLM-105",
            action="approve_compromise",
            promote_to_rule=True,
        )
        self.assertEqual(state["readiness"]["hard_stops"], 0)
        self.assertEqual(state["readiness"]["score"], 100)
        self.assertEqual(state["feasibility"]["projected_spend"], 54000)
        self.assertEqual(state["feasibility"]["budget_status"], "healthy")
        self.assertEqual(state["feasibility"]["schedule_status"], "on_track")
        self.assertTrue(state["derivatives"]["is_clean"])

    def test_whatif_simulation_and_custom_analysis(self) -> None:
        state = self.eng.run_whatif(preset_id="whatif_phase_mainframe")
        self.assertEqual(state["feasibility"]["projected_spend"], 54000)

        custom_state = self.eng.analyze_custom_document(
            "Launch on GCP with 10x faster latency for Apex Global Bank ($95,000 budget; requires 6.0 PSO FTEs over 25 business days)."
        )
        self.assertEqual(len(custom_state["claims"]), 4)
        self.assertEqual(custom_state["feasibility"]["projected_spend"], 95000)
        self.assertEqual(custom_state["feasibility"]["required_fte"], 6.0)
        self.assertEqual(custom_state["feasibility"]["projected_days"], 25)

    def test_add_custom_policy_rule_flags_document_immediately(self) -> None:
        state = self.eng.add_custom_policy_rule(
            agent_id="brand_agent",
            summary="Avoid 'trading copilot' in financial comms",
            constraint="Replace 'trading copilot' with 'regulated financial assistant'",
            forbidden_term="trading copilot",
            replacement_term="regulated financial assistant",
            severity="auto_fix",
        )
        custom_claims = [
            c for c in state["claims"] if c["rule_id"].startswith("RULE-CUST-")
        ]
        self.assertEqual(len(custom_claims), 1)
        self.assertEqual(custom_claims[0]["excerpt"], "trading copilot")

    def test_live_parallel_gemini_role_agents_and_mediator(self) -> None:
        self.eng.configure_llm(
            api_key="test-gemini-key", model="gemini-3.8-flash"
        )
        self.assertTrue(self.eng.llm_client.is_live_enabled())
        self.assertEqual(self.eng.llm_client.model, "gemini-3.8-flash")

        def fake_generate_structured_json(
            prompt: str,
            schema: dict,
            system_instruction: str = "",
            timeout_sec: float = 18.0,
        ) -> dict:
            if "negotiation_turns" in schema.get("properties", {}):
                return {
                    "negotiation_turns": [
                        {
                            "agent_id": "pm_agent",
                            "agent_name": "Cloud PM Agent",
                            "badge": "PM",
                            "message": "Confirmed with Commercial Agent that pre-certified SAP connector meets Oct 18 scope.",
                        }
                    ],
                    "blog_post_content": "Verified Live Gemini Launch Blog Content",
                    "sales_faq_content": "Verified Live Gemini Sales FAQ Content",
                }
            if "Brand & Comms Agent" in system_instruction:
                return {
                    "war_room_statement": "Brand Agent audited product lockups.",
                    "claims": [
                        {
                            "category": "Brand & Naming",
                            "rule_id": "RULE-BR-01",
                            "severity": "auto_fix",
                            "excerpt": "GCP",
                            "replacement": "Google Cloud",
                            "issue": "Deprecated acronym GCP.",
                            "evidence": "Brand Guide §2.1",
                            "impact_summary": "1-click fix.",
                            "blocking_workstream": "External Copy",
                        }
                    ],
                }
            return {"war_room_statement": "Cleared domain checks.", "claims": []}

        with mock.patch.object(
            self.eng.llm_client,
            "generate_structured_json",
            side_effect=fake_generate_structured_json,
        ):
            state = self.eng.analyze_custom_document(
                "Announcing Vertex AI on GCP for enterprise customers."
            )
            self.assertEqual(len(state["claims"]), 1)
            self.assertEqual(state["claims"][0]["id"], "CLM-AI-01")
            self.assertEqual(
                state["derivatives"]["blog_post"]["content"],
                "Verified Live Gemini Launch Blog Content",
            )

    def test_login_user_personas_and_custom_sso(self) -> None:
        state = self.eng.login_user(
            persona_id="persona_legal", workspace_tier="collaborative"
        )
        self.assertIsNotNone(state["current_user"])
        self.assertEqual(state["current_user"]["ldap"], "priya.nair@google.com")
        self.assertEqual(state["current_user"]["default_lens"], "legal_agent")

        esc_state = self.eng.resolve_escalation(
            claim_id="CLM-104",
            action="approve_compromise",
            promote_to_rule=True,
        )
        self.assertIn(
            "priya.nair@ (Senior Product Counsel)",
            esc_state["memory_log"][0]["stakeholder"],
        )

        custom_state = self.eng.login_user(
            custom_ldap="cloud_demo",
            custom_role="Cloud Launch Lead",
            default_lens="pm_agent",
            workspace_tier="personal",
        )
        self.assertEqual(custom_state["workspace_tier"], "personal")
        self.assertEqual(custom_state["current_user"]["ldap"], "cloud_demo@google.com")
        self.assertEqual(custom_state["current_user"]["default_lens"], "pm_agent")

        logged_out = self.eng.logout_user()
        self.assertIsNone(logged_out["current_user"])

    def test_sqlite_file_persistence_across_engine_restarts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_file = os.path.join(tmpdir, "test_murph.db")
            eng1 = engine.PreFlightEngine(db_path=db_file)
            created = eng1.create_project(
                name="Persistent Cloud Security Launch",
                subtitle="Zero Trust Launch",
                allocated_budget=50000,
                target_launch_days=15,
                team_capacity_fte=3.0,
                document_title="Security Launch Brief",
                document_text="Deploying on GCP with 8x faster threat detection ($72,000 spend; requires 4.5 FTE over 22 days).",
            )
            proj_id = created["active_scenario_id"]
            self.assertTrue(
                proj_id.startswith("proj_persistent_cloud_security")
            )
            self.assertGreaterEqual(len(created["claims"]), 3)
            eng1.close()

            eng2 = engine.PreFlightEngine(db_path=db_file)
            state2 = eng2.get_state()
            self.assertEqual(state2["active_scenario_id"], proj_id)
            self.assertEqual(state2["scenario_meta"]["allocated_budget"], 50000)
            self.assertEqual(len(state2["claims"]), len(created["claims"]))
            eng2.close()

    def test_project_claim_policy_and_rate_card_crud(self) -> None:
        st = self.eng.update_project_settings(
            name="Updated Hybrid Launch",
            allocated_budget=90000,
            tolerance_limit=99000,
            target_launch_days=30,
            team_capacity_fte=6.0,
        )
        self.assertEqual(st["scenario_meta"]["allocated_budget"], 90000)
        self.assertEqual(st["feasibility"]["budget_status"], "healthy")

        st = self.eng.add_manual_claim(
            category="Security Review",
            agent_id="pm_agent",
            severity="auto_fix",
            excerpt="October 18",
            replacement="November 1",
            issue="Shift date to Nov 1",
        )
        manual_id = st["claims"][-1]["id"]
        st = self.eng.update_claim(
            claim_id=manual_id,
            replacement="November 15",
            severity="hard_stop",
        )
        updated_claim = next(c for c in st["claims"] if c["id"] == manual_id)
        self.assertEqual(updated_claim["replacement"], "November 15")
        self.assertEqual(updated_claim["status"], "hard_stop")

        st = self.eng.delete_claim(manual_id)
        self.assertFalse(any(c["id"] == manual_id for c in st["claims"]))

        st = self.eng.import_policy_document(
            agent_id="brand_agent",
            policy_text="keynote showcase -> executive launch keynote | Standardize event naming",
            default_severity="auto_fix",
        )
        brand_pack = next(
            p for p in st["policy_packs"] if p["agent_id"] == "brand_agent"
        )
        imported_rule = brand_pack["rules"][-1]
        self.assertEqual(imported_rule["forbidden_term"], "keynote showcase")

        st = self.eng.toggle_policy_rule(imported_rule["id"], enabled=False)
        brand_pack = next(
            p for p in st["policy_packs"] if p["agent_id"] == "brand_agent"
        )
        self.assertFalse(
            next(
                r
                for r in brand_pack["rules"]
                if r["id"] == imported_rule["id"]
            )["enabled"]
        )

        st = self.eng.upsert_rate_card_sku(
            sku="PSO-AI-AUDIT",
            name="AI Safety Red-Team Audit",
            keywords="red-team, ai safety",
            cost_usd=35000,
            fte_load=2.5,
            duration_days=10,
        )
        self.assertTrue(
            any(
                r["sku"] == "PSO-AI-AUDIT"
                for r in st["feasibility"]["rate_card"]
            )
        )
        st = self.eng.delete_rate_card_sku("PSO-AI-AUDIT")
        self.assertFalse(
            any(
                r["sku"] == "PSO-AI-AUDIT"
                for r in st["feasibility"]["rate_card"]
            )
        )

        md = self.eng.export_deliverables_markdown()
        self.assertIn("# Launch Brief & Joint Announcement", md)
        self.assertIn("Harmonized Source Document", md)

    def test_frontend_claim_aliases_whatif_and_one_click_ticket_approval(self):
        st = self.eng.apply_autofix("CLM-02")
        clm102 = next(c for c in st["claims"] if c["id"] == "CLM-102")
        self.assertEqual(clm102["status"], "resolved")

        st = self.eng.resolve_escalation("CLM-04", "sign_waiver", "VP Waiver")
        clm104 = next(c for c in st["claims"] if c["id"] == "CLM-104")
        self.assertEqual(clm104["status"], "approved_override")

        st = self.eng.run_whatif(preset_id="phase_mainframe")
        self.assertEqual(st["feasibility"]["projected_spend"], 54000)
        self.assertEqual(st["feasibility"]["projected_fte"], 3.5)
        self.assertEqual(st["feasibility"]["critical_path_days"], 14)

        st = self.eng.act_on_agent_ticket(
            ticket_id="TKT-101",
            action="approve_compromise",
            actor_user_id="persona_creator",
        )
        tkt101 = next(t for t in st["agent_tickets"] if t["id"] == "TKT-101")
        self.assertEqual(tkt101["status"], "approved")
        self.assertTrue(
            all(
                a["status"] == "approved"
                for a in tkt101["approvals"].values()
            )
        )

    def test_unapprove_claims_and_tickets_restores_state(self) -> None:
        # 1. Approve and then unapprove a single auto-fix claim (CLM-02)
        st = self.eng.apply_autofix("CLM-02")
        clm102 = next(c for c in st["claims"] if c["id"] == "CLM-102")
        self.assertEqual(clm102["status"], "resolved")
        self.assertIn(clm102["replacement"], st["document_text"])

        st = self.eng.resolve_escalation("CLM-02", "unapprove")
        clm102 = next(c for c in st["claims"] if c["id"] == "CLM-102")
        self.assertEqual(clm102["status"], "flagged")
        self.assertIn(clm102["excerpt"], st["document_text"])

        # 2. Approve all auto-fixes and then batch-unapprove ALL_AUTO_FIX
        st = self.eng.apply_autofix()
        self.assertEqual(st["readiness"]["auto_fixes_pending"], 0)
        st = self.eng.resolve_escalation("ALL_AUTO_FIX", "unapprove")
        self.assertEqual(st["readiness"]["auto_fixes_pending"], 3)

        # 3. Approve hard stops (CLM-04 & CLM-05) and then unapprove them
        self.eng.resolve_escalation("CLM-04", "approve_compromise")
        st = self.eng.resolve_escalation("CLM-05", "approve_compromise")
        self.assertEqual(st["readiness"]["hard_stops"], 0)
        self.assertEqual(st["feasibility"]["projected_spend"], 54000)

        st = self.eng.resolve_escalation("CLM-05", "unapprove")
        clm105 = next(c for c in st["claims"] if c["id"] == "CLM-105")
        self.assertEqual(clm105["status"], "hard_stop")
        self.assertEqual(st["feasibility"]["projected_spend"], 82000)

        st = self.eng.resolve_escalation("ALL_HARD_STOPS", "unapprove")
        self.assertEqual(st["readiness"]["hard_stops"], 2)

        # 4. Approve and then unapprove a bilateral ticket (TKT-101)
        st = self.eng.act_on_agent_ticket(
            ticket_id="TKT-101",
            action="approve_compromise",
            actor_user_id="persona_creator",
        )
        tkt101 = next(t for t in st["agent_tickets"] if t["id"] == "TKT-101")
        self.assertEqual(tkt101["status"], "approved")

        st = self.eng.act_on_agent_ticket(
            ticket_id="TKT-101",
            action="unapprove_compromise",
            actor_user_id="persona_creator",
        )
        tkt101 = next(t for t in st["agent_tickets"] if t["id"] == "TKT-101")
        self.assertEqual(tkt101["status"], "compromise_reached")
        self.assertTrue(
            all(
                a["status"] == "pending"
                for a in tkt101["approvals"].values()
            )
        )


if __name__ == "__main__":
    unittest.main()
