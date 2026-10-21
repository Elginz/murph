"""Seed Agents, Personas & Workspace Files (`seed_agents_and_files.py`).

Defines:
- `AGENTS`: The 4 core department Team Agents (`pm_agent`, `brand_agent`,
  `legal_agent`, `commercial_agent`).
- `PERSONAS`: Default user accounts & stakeholder identities.
- `INITIAL_USER_AGENTS`: Central Workspace Agent (`workspace_agent`), 4 Team
  Agents, and Personal User Agents in the all-to-all agent mesh.
- `INITIAL_USER_FILES`: Pre-existing Cloud (`DEMO PRODUCT PRD.md`,
  `DEMO NDA VAULT.md`; plus `PSO RATE CARD.csv` as Commercial agent knowledge)
  and Digital Marketing (`DEMO LAUNCH BRIEF.md`, `DEMO BRAND RULES.md`)
  reference files.
"""

from __future__ import annotations

from typing import Any


# The 2 built-in demo accounts. Legacy ldaps (pre-2026-10-03) are kept only so
# existing SQLite workspaces and stale browser sessions can be migrated forward.
CLOUD_ACCOUNT_LDAP = "cloud_demo@google.com"
DM_ACCOUNT_LDAP = "marketing_demo@google.com"
DEMO_ACCOUNT_PASSWORD = "P@ssword_123"
DEMO_ACCOUNT_LDAPS = frozenset({CLOUD_ACCOUNT_LDAP, DM_ACCOUNT_LDAP})
LEGACY_ACCOUNT_LDAP_MAP: dict[str, str] = {
    "efch@google.com": CLOUD_ACCOUNT_LDAP,
    "alex.rivera@google.com": DM_ACCOUNT_LDAP,
}
DM_ACCOUNT_LDAP_ALIASES = frozenset(
    {DM_ACCOUNT_LDAP, *(old for old, new in LEGACY_ACCOUNT_LDAP_MAP.items() if new == DM_ACCOUNT_LDAP)}
)


def is_dm_account_ldap(ldap: Any) -> bool:
    """True when `ldap` belongs to the built-in Digital Marketing (DM) demo account (current or legacy)."""
    return str(ldap or "").strip().lower() in DM_ACCOUNT_LDAP_ALIASES

AGENTS: list[dict[str, str]] = [
    {
        "id": "pm_agent",
        "name": "Cloud PM Agent",
        "role": "Product & Technical Truth",
        "owner_team": "Vertex AI & Cloud Product Management",
        "human_approver": "maya.lin@ (Staff Cloud PM)",
        "badge": "PM",
        "color": "blue",
    },
    {
        "id": "brand_agent",
        "name": "Brand & Comms Agent",
        "role": "Naming, Tone & External Comms",
        "owner_team": "Google Cloud Brand & PMM Governance",
        "human_approver": "marketing_demo@ (Cloud Brand Lead)",
        "badge": "BRAND",
        "color": "teal",
    },
    {
        "id": "legal_agent",
        "name": "Legal & NDA Agent",
        "role": "Customer Clearance, Substantiation & IP",
        "owner_team": "Google Cloud Legal & Customer References",
        "human_approver": "priya.nair@ (Senior Product Counsel)",
        "badge": "LEGAL",
        "color": "amber",
    },
    {
        "id": "commercial_agent",
        "name": "Commercial & Delivery Agent",
        "role": "Budget, PSO Capacity & Critical Path",
        "owner_team": "Cloud Go-To-Market & PSO Deal Desk",
        "human_approver": "marcus.vance@ (VP Cloud GTM Ops)",
        "badge": "DEAL",
        "color": "rose",
    },
]


PERSONAS: list[dict[str, Any]] = [
    {
        "id": "persona_creator",
        "ldap": "cloud_demo@google.com",
        "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
        "role": "Workspace Owner & Launch Orchestrator",
        "department": "Google Cloud Marketing & GTM",
        "default_lens": "all",
        "default_stage": "1",
        "nda_clearance": "Tier-2 Cleared",
        "badge": "OWNER",
        "description": "Full access to create projects, manage Policy Packs & Rate Cards, run 4-Agent Scrub, and export deliverables.",
        "personal_agent_id": "agent_user_efch",
        "team_agent_id": "brand_agent",
        "password": DEMO_ACCOUNT_PASSWORD,
    },
    {
        "id": "persona_pm",
        "ldap": "maya.lin@google.com",
        "name": "maya.lin@ (Staff Cloud PM)",
        "role": "Technical & Product Truth Approver",
        "department": "Vertex AI Product Management",
        "default_lens": "pm_agent",
        "default_stage": "1",
        "nda_clearance": "Tier-2 Cleared",
        "badge": "PM",
        "description": "Reviews technical PRD claims, regional GA/Preview accuracy, and engineering benchmark citations.",
        "personal_agent_id": "agent_user_maya_lin",
        "team_agent_id": "pm_agent",
    },
    {
        "id": "persona_legal",
        "ldap": "priya.nair@google.com",
        "name": "priya.nair@ (Senior Product Counsel)",
        "role": "Legal, Substantiation & NDA Approver",
        "department": "Google Cloud Legal",
        "default_lens": "legal_agent",
        "default_stage": "2",
        "nda_clearance": "Strict NDA Vault Access",
        "badge": "LEGAL",
        "description": "Receives 30-second Hard-Stop Escalation Cards for customer NDA clearance and comparative claims.",
        "personal_agent_id": "agent_user_priya_nair",
        "team_agent_id": "legal_agent",
    },
    {
        "id": "persona_commercial",
        "ldap": "marcus.vance@google.com",
        "name": "marcus.vance@ (VP Cloud GTM Ops)",
        "role": "Commercial Budget & PSO Capacity Approver",
        "department": "Cloud PSO & Deal Desk",
        "default_lens": "commercial_agent",
        "default_stage": "2",
        "nda_clearance": "Tier-2 Cleared",
        "badge": "DEAL",
        "description": "Approves or phases scope when projected PSO spend or timeline exceeds the project feasibility envelope.",
        "personal_agent_id": "agent_user_marcus_vance",
        "team_agent_id": "commercial_agent",
    },
    {
        "id": "persona_brand",
        "ldap": "marketing_demo@google.com",
        "name": "marketing_demo@ (Cloud Brand Lead)",
        "role": "Brand & Naming Governance Lead",
        "department": "Google Cloud Brand Studio",
        "default_lens": "brand_agent",
        "default_stage": "1",
        "nda_clearance": "Standard Internal",
        "badge": "BRAND",
        "description": "Audits official Google Cloud product lockups, naming conventions, and external tone.",
        "personal_agent_id": "agent_user_alex_rivera",
        "team_agent_id": "brand_agent",
        "password": DEMO_ACCOUNT_PASSWORD,
    },
]


INITIAL_USER_AGENTS: list[dict[str, Any]] = [
    # Central Workspace Agent Hub (connects all Personal Agents & Team Agents in an all-to-all mesh)
    {
        "id": "workspace_agent",
        "agent_type": "workspace",
        "name": "Central Workspace Agent",
        "owner_user_id": "persona_creator",
        "owner_ldap": "workspace-hub@google.com",
        "team_id": "team_workspace_hub",
        "team_name": "Murph Central Workspace Orchestration Hub",
        "parent_team_agent_id": "workspace_agent",
        "specialty": "Central Matchmaker & Shared-File Session Broker connecting all Personal Agents & Team Agents in an all-to-all mesh",
        "badge": "HUB-AG",
        "created_at": "2026-09-25 08:55 UTC",
    },
    # 4 Core Team Agents (representing each department/team)
    {
        "id": "pm_agent",
        "agent_type": "team",
        "name": "Cloud PM Team Agent",
        "owner_user_id": "persona_pm",
        "owner_ldap": "maya.lin@google.com",
        "team_id": "team_pm",
        "team_name": "Vertex AI & Cloud Product Management",
        "parent_team_agent_id": "pm_agent",
        "specialty": "Product PRDs, Regional GA/Preview Matrix & TPU Benchmarks",
        "badge": "TEAM-PM",
        "created_at": "2026-09-25 09:00 UTC",
    },
    {
        "id": "brand_agent",
        "agent_type": "team",
        "name": "Brand & Comms Team Agent",
        "owner_user_id": "persona_brand",
        "owner_ldap": "marketing_demo@google.com",
        "team_id": "team_brand",
        "team_name": "Google Cloud Brand & PMM Governance",
        "parent_team_agent_id": "brand_agent",
        "specialty": "Official Product Naming Lockups, Tone & External Messaging",
        "badge": "TEAM-BRAND",
        "created_at": "2026-09-25 09:00 UTC",
    },
    {
        "id": "legal_agent",
        "agent_type": "team",
        "name": "Legal & NDA Team Agent",
        "owner_user_id": "persona_legal",
        "owner_ldap": "priya.nair@google.com",
        "team_id": "team_legal",
        "team_name": "Google Cloud Legal & Customer References",
        "parent_team_agent_id": "legal_agent",
        "specialty": "Customer NDA Clearance Vault, BAA Terms & Claim Substantiation",
        "badge": "TEAM-LEGAL",
        "created_at": "2026-09-25 09:00 UTC",
    },
    {
        "id": "commercial_agent",
        "agent_type": "team",
        "name": "Commercial & PSO Team Agent",
        "owner_user_id": "persona_commercial",
        "owner_ldap": "marcus.vance@google.com",
        "team_id": "team_commercial",
        "team_name": "Cloud Go-To-Market & PSO Deal Desk",
        "parent_team_agent_id": "commercial_agent",
        "specialty": "PSO Rate Cards, Deal Desk Co-Investment Budget & FTE Capacity",
        "badge": "TEAM-DEAL",
        "created_at": "2026-09-25 09:00 UTC",
    },
    # 5 Personal User Agents (each tied to its user and bound to a parent Team Agent)
    {
        "id": "agent_user_efch",
        "agent_type": "personal",
        "name": "cloud_demo@'s Personal Agent",
        "owner_user_id": "persona_creator",
        "owner_ldap": "cloud_demo@google.com",
        "team_id": "team_brand",
        "team_name": "Google Cloud Brand & PMM Governance",
        "parent_team_agent_id": "brand_agent",
        "specialty": "Personal Launch Orchestrator Agent for cloud_demo@ (Cloud Launch & PMM Lead)",
        "badge": "USER-AG",
        "created_at": "2026-09-25 09:05 UTC",
    },
    {
        "id": "agent_user_maya_lin",
        "agent_type": "personal",
        "name": "maya.lin@'s Personal Agent",
        "owner_user_id": "persona_pm",
        "owner_ldap": "maya.lin@google.com",
        "team_id": "team_pm",
        "team_name": "Vertex AI & Cloud Product Management",
        "parent_team_agent_id": "pm_agent",
        "specialty": "Personal PM Agent for maya.lin@ (Staff Cloud PM)",
        "badge": "USER-AG",
        "created_at": "2026-09-25 09:05 UTC",
    },
    {
        "id": "agent_user_priya_nair",
        "agent_type": "personal",
        "name": "priya.nair@'s Personal Agent",
        "owner_user_id": "persona_legal",
        "owner_ldap": "priya.nair@google.com",
        "team_id": "team_legal",
        "team_name": "Google Cloud Legal & Customer References",
        "parent_team_agent_id": "legal_agent",
        "specialty": "Personal Legal Agent for priya.nair@ (Senior Product Counsel)",
        "badge": "USER-AG",
        "created_at": "2026-09-25 09:05 UTC",
    },
    {
        "id": "agent_user_marcus_vance",
        "agent_type": "personal",
        "name": "marcus.vance@'s Personal Agent",
        "owner_user_id": "persona_commercial",
        "owner_ldap": "marcus.vance@google.com",
        "team_id": "team_commercial",
        "team_name": "Cloud Go-To-Market & PSO Deal Desk",
        "parent_team_agent_id": "commercial_agent",
        "specialty": "Personal Deal Desk Agent for marcus.vance@ (VP Cloud GTM Ops)",
        "badge": "USER-AG",
        "created_at": "2026-09-25 09:05 UTC",
    },
    {
        "id": "agent_user_alex_rivera",
        "agent_type": "personal",
        "name": "marketing_demo@'s Personal Agent",
        "owner_user_id": "persona_brand",
        "owner_ldap": "marketing_demo@google.com",
        "team_id": "team_brand",
        "team_name": "Google Cloud Brand & PMM Governance",
        "parent_team_agent_id": "brand_agent",
        "specialty": "Personal Brand Agent for marketing_demo@ (Cloud Brand Lead)",
        "badge": "USER-AG",
        "created_at": "2026-09-25 09:05 UTC",
    },
]


INITIAL_USER_FILES: list[dict[str, Any]] = [
    {
        "id": "FILE-PM-101",
        "user_id": "persona_pm",
        "user_ldap": "maya.lin@google.com",
        "personal_agent_id": "agent_user_maya_lin",
        "team_agent_id": "pm_agent",
        "team_name": "Vertex AI & Cloud Product Management",
        "filename": "vertex_v24_prd_and_regional_roadmap.md",
        "content": (
            "# Product Plan: Vertex AI Agent Builder\n"
            "- Live Now (GA): US and Europe.\n"
            "- In Preview until Nov 15: Singapore and voice encryption.\n"
            "- Verified Speed: 3.2x faster response time than baseline."
        ),
        "visibility": "federated",
        "uploaded_at": "2026-09-26 14:20 UTC",
    },
    {
        "id": "FILE-LEGAL-102",
        "user_id": "persona_legal",
        "user_ldap": "priya.nair@google.com",
        "personal_agent_id": "agent_user_priya_nair",
        "team_agent_id": "legal_agent",
        "team_name": "Google Cloud Legal & Customer References",
        "filename": "customer_nda_clearance_vault_2026.md",
        "content": (
            "# Customer NDA Rules\n"
            "- Apex Global Bank: Under strict Customer NDA. Do not use the Apex Global Bank name or logo on stage without a signed waiver.\n"
            "- Approved Wording: Call them 'a major global bank'. The '68% faster compliance review' stat is approved to share.\n"
            "- Competitor Claims: Do not name competitors directly without verified proof."
        ),
        "visibility": "federated",
        "uploaded_at": "2026-09-26 15:10 UTC",
    },
    {
        "id": "FILE-DEAL-103",
        "user_id": "persona_commercial",
        "user_ldap": "marcus.vance@google.com",
        "personal_agent_id": "agent_user_marcus_vance",
        "team_agent_id": "commercial_agent",
        "team_name": "Cloud Go-To-Market & PSO Deal Desk",
        "filename": "q4_pso_rate_card_and_bench_capacity.md",
        "content": (
            "# Launch Budget & PSO Rate Card\n"
            "- Launch Budget Limit: $60,000 | Team Limit: 4 people | Deadline: 18 days (Oct 18).\n"
            "- Standard SAP Setup (PSO-SAP-REF): $54,000 | 3.5 people | 14 days (Fits Oct 18 budget).\n"
            "- Custom Mainframe Add-On (PSO-MAINFRAME-CUSTOM): +$28,000 ($82,000 total) | +2 people | 28 days (Over budget — move to Phase 2)."
        ),
        "visibility": "federated",
        "uploaded_at": "2026-09-26 16:05 UTC",
    },
    {
        "id": "FILE-BRAND-104",
        "user_id": "persona_brand",
        "user_ldap": "marketing_demo@google.com",
        "personal_agent_id": "agent_user_alex_rivera",
        "team_agent_id": "brand_agent",
        "team_name": "Google Cloud Brand & PMM Governance",
        "filename": "google_cloud_brand_naming_guidelines_2026.md",
        "content": (
            "# Google Cloud Brand Rules\n"
            "- Always write 'Google Cloud' in public copy (never 'GCP').\n"
            "- Approved Product Names: 'Vertex AI Agent Builder' and 'Google Cloud'.\n"
            "- Do Not Use: 'Google Vertex Autonomous Brain', 'Bard', or 'Duet AI'."
        ),
        "visibility": "federated",
        "uploaded_at": "2026-09-26 17:00 UTC",
    },
    {
        "id": "FILE-OWNER-105",
        "user_id": "persona_creator",
        "user_ldap": "cloud_demo@google.com",
        "personal_agent_id": "agent_user_efch",
        "team_agent_id": "brand_agent",
        "team_name": "Google Cloud Brand & PMM Governance",
        "filename": "cloud_next_keynote_run_of_show.md",
        "content": (
            "# Oct 18 Keynote Launch Brief\n"
            "- Launch Date: October 18 (18 days left).\n"
            "- Keynote Demo: 4-minute live demo featuring the 68% faster compliance review stat.\n"
            "- Final Check: All product, brand, legal, and budget blockers must be cleared 48 hours before rehearsal."
        ),
        "visibility": "federated",
        "uploaded_at": "2026-09-27 09:30 UTC",
    },
]
