"""Unit tests for Murph agent mesh, bilateral tickets, dual-track login, and custom workflows.

A2A terminal-agent grounding tests live in `engine_agents_a2a_test.py`.
"""

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


class MurphWorkflowsAndAgentsTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        self.eng = engine.PreFlightEngine(db_path=":memory:")

    def tearDown(self) -> None:
        self.eng.close()
        super().tearDown()

    def test_register_user_provisions_personal_agent_binds_team_agent_and_uploads_files(
        self,
    ) -> None:
        state = self.eng.register_user_account(
            ldap="jordan.lee@google.com",
            name="Jordan Lee",
            role="Security Architecture Lead",
            org="Cloud Security & PM",
            team_agent_id="pm_agent",
            personal_agent_name="Jordan's Security Agent",
            personal_agent_specialty="CMEK & Zero-Trust Verification",
            initial_files=[
                {
                    "filename": "Zero_Trust_CMEK_Spec.md",
                    "content": "Regulated financial deployments require 30-day automated CMEK rotation in us-central1 and europe-west4.",
                    "file_type": "md",
                    "tags": ["cmek", "security", "rotation"],
                    "visibility": "federated",
                }
            ],
        )
        self.assertIsNotNone(state["current_user"])
        self.assertEqual(state["current_user"]["ldap"], "jordan.lee@google.com")
        self.assertEqual(
            state["current_user"]["personal_agent_id"], "agent_user_jordan_lee"
        )
        self.assertEqual(state["current_user"]["team_agent_id"], "pm_agent")

        personal_ag = next(
            a
            for a in state["user_agents"]
            if a["id"] == "agent_user_jordan_lee"
        )
        self.assertEqual(personal_ag["agent_type"], "personal")
        self.assertEqual(personal_ag["parent_team_agent_id"], "pm_agent")
        self.assertEqual(personal_ag["name"], "Jordan's Security Agent")

        jordan_files = [
            f
            for f in state["user_files"]
            if f["personal_agent_id"] == "agent_user_jordan_lee"
        ]
        self.assertEqual(len(jordan_files), 1)
        self.assertEqual(jordan_files[0]["filename"], "Zero_Trust_CMEK_Spec.md")
        self.assertEqual(jordan_files[0]["team_agent_id"], "pm_agent")

        state2 = self.eng.upload_user_file(
            filename="FIPS_140_3_Checklist.txt",
            content="All HSM keys must be validated under FIPS 140-3 Level 3 before GA.",
            tags="fips, hsm",
        )
        jordan_files2 = [
            f
            for f in state2["user_files"]
            if f["personal_agent_id"] == "agent_user_jordan_lee"
        ]
        self.assertEqual(len(jordan_files2), 2)

    def test_google_adc_login_and_drive_query_import(self) -> None:
        state = self.eng.login_with_google_adc(
            team_agent_id="pm_agent", email="cloud_demo@google.com",
            target_user="efch",
            auto_query_drive=True,
        )
        self.assertIsNotNone(state["current_user"])
        self.assertIn("adc_status", state)
        self.assertIn("drive_results", state)

        q_state = self.eng.query_google_drive(
            query="Vertex", mime_filter="docs"
        )
        drive_files = q_state["drive_results"].get("files", [])
        self.assertGreaterEqual(len(drive_files), 1)

        initial_file_count = len(q_state["user_files"])
        imp_state = self.eng.import_google_drive_file(
            file_id="drive-sample-vertex-prd",
            mime_type="application/vnd.google-apps.document",
            file_name="Vertex AI Agent Builder Q4 Global Launch PRD",
        )
        self.assertEqual(len(imp_state["user_files"]), initial_file_count + 1)

    def test_mandatory_file_upload_enforced_when_require_initial_file_true(
        self,
    ) -> None:
        with self.assertRaises(ValueError):
            self.eng.register_user_account(
                ldap="nofile.user@google.com",
                name="NoFile User",
                role="PM",
                org="Google Cloud",
                team_agent_id="pm_agent",
                personal_agent_name="NoFile Personal Agent",
                initial_files=[],
                require_initial_file=True,
            )

        state = self.eng.register_user_account(
            ldap="withfile.user@google.com",
            name="WithFile User",
            role="PM",
            org="Google Cloud",
            team_agent_id="pm_agent",
            personal_agent_name="WithFile Personal Agent",
            initial_files=[
                {
                    "filename": "Mandatory_Reference.md",
                    "content": "Grounded reference file for WithFile Personal Agent.",
                }
            ],
            require_initial_file=True,
        )
        self.assertEqual(
            state["current_user"]["ldap"], "withfile.user@google.com"
        )
        self.assertEqual(
            state["current_user"]["personal_agent_id"],
            "agent_user_withfile_user",
        )

    def test_central_workspace_agent_mesh_and_full_bilateral_ticket_lifecycle(
        self,
    ) -> None:
        state = self.eng.get_state()
        mesh = state["agent_mesh"]
        self.assertEqual(mesh["central_agent"]["id"], "workspace_agent")
        n_nodes = mesh["total_nodes"]
        self.assertGreaterEqual(n_nodes, 9)
        self.assertEqual(mesh["total_edges"], n_nodes * (n_nodes - 1) // 2)

        self.eng.login_user(persona_id="persona_creator")
        created_state = self.eng.create_agent_ticket(
            title="Keynote Customer Reference & Wave 1 PSO Budget Alignment",
            request_summary=(
                "Need my Personal Agent to coordinate via Central Workspace Agent with Legal and Commercial "
                "on naming Apex Global Bank and keeping Wave 1 SAP scope within $60,000."
            ),
            reference_file_ids=["FILE-EFCH-01"],
            target_team_agent_ids=["legal_agent", "commercial_agent"],
        )
        ticket = created_state["agent_tickets"][0]
        ticket_id = ticket["id"]
        self.assertEqual(ticket["workspace_agent_id"], "workspace_agent")
        self.assertEqual(
            ticket["requester_personal_agent_id"], "agent_user_efch"
        )
        self.assertIn("workspace_agent", ticket["participating_agents"])
        self.assertGreaterEqual(len(ticket["shared_files"]), 2)
        self.assertGreaterEqual(len(ticket["participating_users"]), 2)
        self.assertIn(
            ticket["status"], ("compromise_reached", "settled_by_agents")
        )
        self.assertTrue(
            ticket["compromise_proposal"].get("initial_creator_update")
        )
        self.assertTrue(
            ticket["compromise_proposal"].get("tagged_people_updates")
        )

        participating_uids = [
            pu["user_id"] for pu in ticket["participating_users"]
        ]
        self.assertIn("persona_creator", participating_uids)
        peer_uid = next(
            uid for uid in participating_uids if uid != "persona_creator"
        )

        adj_state = self.eng.act_on_agent_ticket(
            ticket_id=ticket_id,
            action="adjust_request",
            actor_user_id=peer_uid,
            updated_compromise_summary="Updated Compromise: Use anonymized Tier-1 Global Investment Bank + SKU PSO-SAP-REF ($54,000).",
            updated_shared_file_content="# Updated Shared File Content with Peer Adjustments",
            comment="Added legal & commercial adjustment clause.",
        )
        t_adj = next(
            t for t in adj_state["agent_tickets"] if t["id"] == ticket_id
        )
        self.assertEqual(len(t_adj["adjustments_log"]), 1)
        self.assertEqual(t_adj["approvals"][peer_uid]["status"], "approved")
        self.assertEqual(
            t_adj["approvals"]["persona_creator"]["status"],
            "pending",
        )

        disc_state = self.eng.act_on_agent_ticket(
            ticket_id=ticket_id,
            action="request_agent_discussion",
            actor_user_id="persona_creator",
            followup_prompt="Please also confirm the 14-day schedule buffer in the shared file.",
        )
        t_disc = next(
            t for t in disc_state["agent_tickets"] if t["id"] == ticket_id
        )
        self.assertGreaterEqual(len(t_disc["agent_debate_turns"]), 6)
        self.assertIn(
            "14-day schedule buffer",
            t_disc["compromise_proposal"]["updated_shared_file_content"],
        )

        h2h_state = self.eng.act_on_agent_ticket(
            ticket_id=ticket_id,
            action="request_h2h",
            actor_user_id="persona_creator",
            h2h_message="Let's do a quick 5-minute H2H check before final sign-off.",
        )
        t_h2h = next(
            t for t in h2h_state["agent_tickets"] if t["id"] == ticket_id
        )
        self.assertEqual(t_h2h["status"], "h2h_in_progress")
        self.assertGreaterEqual(len(t_h2h["h2h_thread"]), 1)

        final_state = h2h_state
        for uid in participating_uids:
            final_state = self.eng.act_on_agent_ticket(
                ticket_id=ticket_id,
                action="approve_compromise",
                actor_user_id=uid,
                comment=f"Signed off by {uid}",
            )
        t_final = next(
            t for t in final_state["agent_tickets"] if t["id"] == ticket_id
        )
        self.assertIn(t_final["status"], ("approved", "resolved"))
        self.assertTrue(
            all(
                ap["status"] == "approved"
                for ap in t_final["approvals"].values()
            )
        )

    def test_custom_workflow_tags_users_and_auto_settles_ticket(self) -> None:
        self.eng.login_user(persona_id="persona_creator")
        wf_state = self.eng.create_custom_workflow(
            folder_name="Legal & Deal Alignment Workflow",
            description="Automated workflow with tagged user settlement",
            wf_filename="LEGAL_DEAL_SYNC.wf",
            workflow_type="debate",
            prompt_text="Coordinate Apex Global Bank NDA and Wave 1 SAP scope",
            selected_files=["PRD_Launch_Brief.md"],
            tagged_users=["priya.nair@google.com", "marcus.vance@google.com"],
            environment="cloud",
        )
        self.assertGreaterEqual(len(wf_state["custom_workflows"]), 1)
        latest_wf = wf_state["custom_workflows"][-1]
        self.assertEqual(latest_wf.get("environment"), "cloud")
        self.assertEqual(latest_wf.get("creator_env"), "cloud")
        self.assertTrue(latest_wf.get("ticket_id"))
        self.assertTrue(latest_wf.get("settled_by_agents"))
        self.assertTrue(latest_wf.get("initial_creator_update"))
        self.assertGreaterEqual(
            len(latest_wf.get("tagged_people_updates", [])), 1
        )
        # Non-creator (DM User) cannot delete the workflow created by Cloud User
        denied_state = self.eng.delete_custom_workflow(
            folder_name="Legal & Deal Alignment Workflow",
            requester_ldap="marketing_demo@google.com",
            requester_env="dm",
        )
        self.assertEqual(len(denied_state["custom_workflows"]), 1)
        # Initial creator (Cloud User) can delete the workflow
        deleted_state = self.eng.delete_custom_workflow(
            folder_name="Legal & Deal Alignment Workflow",
            requester_ldap="cloud_demo@google.com",
            requester_env="cloud",
        )
        self.assertEqual(len(deleted_state["custom_workflows"]), 0)

    def test_dual_cloud_and_marketing_signin_and_distinct_environments(
        self,
    ) -> None:
        cloud_state = self.eng.login_user(
            custom_ldap="marketing_demo@google.com",
            environment="cloud",
        )
        self.assertEqual(cloud_state["active_environment"], "cloud")
        self.assertTrue(cloud_state["auth_sessions"]["cloud"]["authenticated"])
        self.assertFalse(cloud_state["auth_sessions"]["dm"]["authenticated"])
        self.assertFalse(cloud_state["dual_auth_complete"])
        cloud_file_ids = {f["id"] for f in cloud_state["user_files"]}
        self.assertEqual(
            cloud_file_ids, {"FILE-PM-101", "FILE-LEGAL-102", "FILE-DEAL-103"}
        )

        with self.assertRaises(ValueError):
            self.eng.login_user(
                custom_ldap="marketing_demo@google.com",
                environment="dm",
            )

        dm_state = self.eng.login_user(
            custom_ldap="maya.lin@google.com",
            environment="dm",
        )
        self.assertEqual(dm_state["active_environment"], "dm")
        self.assertTrue(dm_state["auth_sessions"]["cloud"]["authenticated"])
        self.assertTrue(dm_state["auth_sessions"]["dm"]["authenticated"])
        self.assertTrue(dm_state["dual_auth_complete"])
        dm_file_ids = {f["id"] for f in dm_state["user_files"]}
        self.assertEqual(dm_file_ids, {"FILE-BRAND-104", "FILE-OWNER-105"})

        dm_after_upload = self.eng.upload_user_file(
            filename="DM_CAMPAIGN_COPY.md",
            content="Marketing campaign copy for Q4 launch.",
            environment="dm",
        )
        self.assertEqual(len(dm_after_upload["user_files"]), 3)

        switched_cloud = self.eng.switch_environment("cloud")
        self.assertEqual(switched_cloud["active_environment"], "cloud")
        self.assertEqual(len(switched_cloud["user_files"]), 3)
        self.assertFalse(
            any(
                f["filename"] == "DM_CAMPAIGN_COPY.md"
                for f in switched_cloud["user_files"]
            )
        )

    def test_real_user_signup_starts_with_empty_file_state(self) -> None:
        reg_state = self.eng.register_user_account(
            ldap="new.builder@google.com",
            name="New Builder",
            role="Cloud Architect",
            org="Google Cloud",
            password="MySecurePassword!2026",
            initial_files=[],
            require_initial_file=False,
            start_empty=True,
        )
        self.assertEqual(
            reg_state["current_user"]["ldap"], "new.builder@google.com"
        )
        self.assertTrue(
            reg_state["active_environment"].startswith("user:user_new_builder")
        )
        self.assertEqual(len(reg_state["user_files"]), 0)
        self.assertEqual(len(reg_state["custom_workflows"]), 0)

        with self.assertRaises(ValueError):
            self.eng.login_user(
                custom_ldap="new.builder@google.com",
                password="WrongPassword",
            )

        up_state = self.eng.upload_user_file(
            filename="MY_FIRST_SPEC.md",
            content="# My First Spec\nCreated from empty account state.",
        )
        self.assertEqual(len(up_state["user_files"]), 1)
        self.assertEqual(
            up_state["user_files"][0]["filename"], "MY_FIRST_SPEC.md"
        )

    def test_update_user_settings_and_sticky_bar_dropdown(self) -> None:
        self.eng.login_user(
            custom_ldap="maya.lin@google.com",
            environment="cloud",
        )
        dm_state = self.eng.login_user(
            custom_ldap="marketing_demo@google.com",
            environment="dm",
        )
        self.assertEqual(
            dm_state["current_user"]["ldap"], "marketing_demo@google.com"
        )

        cloud_switched = self.eng.switch_environment("cloud")
        self.assertEqual(
            cloud_switched["current_user"]["ldap"], "maya.lin@google.com"
        )

        updated = self.eng.update_user_settings(
            email="maya.lin.updated@google.com",
            name="Maya Lin (Staff Lead)",
            role="Principal Cloud PM",
            department="Vertex AI Core",
            nda_clearance="TIER-3",
            team_agent_id="legal_agent",
            personal_agent_name="Maya's Custom Murph",
            workspace_tier="isolated",
        )
        self.assertEqual(
            updated["current_user"]["ldap"], "maya.lin.updated@google.com"
        )
        self.assertEqual(
            updated["current_user"]["name"], "Maya Lin (Staff Lead)"
        )
        self.assertEqual(
            updated["current_user"]["role"], "Principal Cloud PM"
        )
        self.assertEqual(
            updated["current_user"]["department"], "Vertex AI Core"
        )
        self.assertEqual(updated["current_user"]["nda_clearance"], "TIER-3")
        self.assertEqual(
            updated["current_user"]["team_agent_id"], "legal_agent"
        )
        self.assertEqual(
            updated["current_user"]["personal_agent_name"],
            "Maya's Custom Murph",
        )
        self.assertEqual(
            updated["auth_sessions"]["cloud"]["email"],
            "maya.lin.updated@google.com",
        )

    def test_demo_account_passwords_saved_in_sqlite_and_strict_login_enforced(
        self,
    ) -> None:
        users = {u["ldap"]: u for u in self.eng.store.list_users()}
        self.assertEqual(users["cloud_demo@google.com"]["password"], "P@ssword_123")
        self.assertEqual(users["marketing_demo@google.com"]["password"], "P@ssword_123")
        for bad_pwd in ("", "WrongPassword"):
            with self.assertRaises(ValueError):
                self.eng.login_user(
                    custom_ldap="cloud_demo@google.com",
                    password=bad_pwd,
                    environment="cloud",
                    require_password=True,
                )
        for req_pwd in (True, False):
            with self.assertRaises(ValueError):
                self.eng.login_user(
                    custom_ldap="random.stranger@google.com",
                    password="P@ssword_123",
                    environment="cloud",
                    require_password=req_pwd,
                )
        initial_boot_id = self.eng.get_state()["server_boot_id"]
        self.assertTrue(initial_boot_id.startswith("boot_"))
        self.assertEqual(self.eng.get_state()["demo_tour_seen"], {"cloud": False, "dm": False})
        cloud_ok = self.eng.login_user(
            custom_ldap="cloud_demo@google.com",
            password="P@ssword_123",
            environment="cloud",
            require_password=True,
        )
        self.assertEqual(cloud_ok["current_user"]["ldap"], "cloud_demo@google.com")
        self.assertTrue(cloud_ok["show_onboarding_tour"])
        self.assertEqual(cloud_ok["onboarding_tour_account"], "cloud")
        cloud_second = self.eng.login_user(
            custom_ldap="cloud_demo@google.com",
            password="P@ssword_123",
            environment="cloud",
            require_password=True,
        )
        self.assertFalse(cloud_second["show_onboarding_tour"])
        dm_ok = self.eng.login_user(
            custom_ldap="marketing_demo@google.com",
            password="P@ssword_123",
            environment="dm",
            require_password=True,
        )
        self.assertEqual(dm_ok["current_user"]["ldap"], "marketing_demo@google.com")
        self.assertTrue(dm_ok["show_onboarding_tour"])
        self.assertEqual(dm_ok["onboarding_tour_account"], "dm")
        dm_second = self.eng.login_user(
            custom_ldap="marketing_demo@google.com",
            password="P@ssword_123",
            environment="dm",
            require_password=True,
        )
        self.assertFalse(dm_second["show_onboarding_tour"])
        reset_state = self.eng.reset_workspace(reset_all_seed_data=True)
        self.assertNotEqual(reset_state["server_boot_id"], initial_boot_id)
        self.assertEqual(reset_state["demo_tour_seen"], {"cloud": False, "dm": False})


if __name__ == "__main__":
    unittest.main()
