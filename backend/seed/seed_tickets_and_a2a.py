"""Seed Cross-Team A2A Consultations & Bilateral Shared-File Tickets (`seed_tickets_and_a2a.py`).

Defines:
- `INITIAL_A2A_MESSAGES`: Multi-hop cross-team consultation logs across Legal,
  Cloud PM, and Commercial/PSO Team Agents.
- `INITIAL_AGENT_TICKETS`: Bilateral Shared-File Tickets (`TKT-101` and `TKT-102`)
  brokered by the Central Workspace Agent (`workspace_agent`).
"""

from __future__ import annotations

from typing import Any


INITIAL_A2A_MESSAGES: list[dict[str, Any]] = [
    {
        "id": "A2A-01",
        "timestamp": "2026-09-28 03:45 UTC",
        "user_id": "persona_creator",
        "user_name": "cloud_demo@ (Cloud Launch & PMM Lead)",
        "personal_agent_id": "agent_user_efch",
        "personal_agent_name": "cloud_demo@'s Personal Agent",
        "team_agent_id": "brand_agent",
        "team_agent_name": "Brand & Comms Team Agent",
        "question": "Can we name Apex Global Bank on the Oct 18 keynote, is Singapore live for voice encryption, and what fits our $60k budget?",
        "hops": [
            {
                "hop_order": 1,
                "from_agent_id": "agent_user_efch",
                "from_agent_name": "cloud_demo@'s Personal Agent",
                "via_team_agent_id": "brand_agent",
                "via_team_agent_name": "Brand & Comms Team Agent",
                "to_agent_id": "legal_agent",
                "to_agent_name": "Legal & NDA Team Agent",
                "to_team_name": "Google Cloud Legal & Customer References",
                "peer_agents_consulted": ["priya.nair@'s Personal Agent (priya.nair@google.com)"],
                "request_message": "Checking if we can show Apex Global Bank's name and 68% stat on Oct 18.",
                "cited_files": [
                    {
                        "id": "FILE-LEGAL-102",
                        "filename": "customer_nda_clearance_vault_2026.md",
                        "owner_ldap": "priya.nair@google.com",
                        "snippet": "Apex Global Bank: Under Customer NDA. Slides must say 'a major global bank'. The 68% stat is approved.",
                    }
                ],
                "cited_rules": ["RULE-LG-01"],
                "response_message": "Apex Global Bank is under NDA. Say 'a major global bank' and keep the 68% faster review stat.",
            },
            {
                "hop_order": 2,
                "from_agent_id": "agent_user_efch",
                "from_agent_name": "cloud_demo@'s Personal Agent",
                "via_team_agent_id": "brand_agent",
                "via_team_agent_name": "Brand & Comms Team Agent",
                "to_agent_id": "pm_agent",
                "to_agent_name": "Cloud PM Team Agent",
                "to_team_name": "Vertex AI & Cloud Product Management",
                "peer_agents_consulted": ["maya.lin@'s Personal Agent (maya.lin@google.com)"],
                "request_message": "Checking launch status for Singapore and voice encryption.",
                "cited_files": [
                    {
                        "id": "FILE-PM-101",
                        "filename": "vertex_v24_prd_and_regional_roadmap.md",
                        "owner_ldap": "maya.lin@google.com",
                        "snippet": "Live Now (GA): US and Europe. In Preview until Nov 15: Singapore and voice encryption.",
                    }
                ],
                "cited_rules": ["RULE-PM-01", "RULE-PM-03"],
                "response_message": "US and Europe are live today. Singapore and voice encryption are in Preview until Nov 15.",
            },
            {
                "hop_order": 3,
                "from_agent_id": "agent_user_efch",
                "from_agent_name": "cloud_demo@'s Personal Agent",
                "via_team_agent_id": "brand_agent",
                "via_team_agent_name": "Brand & Comms Team Agent",
                "to_agent_id": "commercial_agent",
                "to_agent_name": "Commercial & PSO Team Agent",
                "to_team_name": "Cloud Go-To-Market & PSO Deal Desk",
                "peer_agents_consulted": ["marcus.vance@'s Personal Agent (marcus.vance@google.com)"],
                "request_message": "Checking which setup fits our $60,000 budget and Oct 18 deadline.",
                "cited_files": [
                    {
                        "id": "FILE-DEAL-103",
                        "filename": "q4_pso_rate_card_and_bench_capacity.md",
                        "owner_ldap": "marcus.vance@google.com",
                        "snippet": "Standard SAP Setup (PSO-SAP-REF): $54,000 | 3.5 people | 14 days (Fits Oct 18 budget).",
                    }
                ],
                "cited_rules": ["RULE-CM-01", "RULE-CM-02"],
                "response_message": "Use the Standard SAP setup ($54,000, 14 days) for Oct 18, and move the Custom Mainframe add-on ($28k) to Phase 2.",
            },
        ],
        "final_answer": (
            "Here is the summary from Legal, Product, and Budget:\n\n"
            "1. **Legal (`DEMO NDA VAULT.md`)**: Say **'a major global bank'** instead of Apex Global Bank, and keep the **68% faster compliance review** stat.\n"
            "2. **Product (`DEMO PRODUCT PRD.md`)**: **US & Europe** are live now; **Singapore** and **voice encryption** are in **Preview until Nov 15**.\n"
            "3. **Budget (`PSO RATE CARD.csv`)**: Use the **Standard SAP setup ($54k, 14 days)** for Oct 18 and move the **Custom Mainframe add-on (+$28k)** to Phase 2."
        ),
    }
]


INITIAL_AGENT_TICKETS: list[dict[str, Any]] = [
    {
        "id": "TKT-101",
        "created_at": "2026-09-28 18:05 UTC",
        "updated_at": "2026-09-28 18:15 UTC",
        "status": "compromise_reached",
        "title": "Oct 18 Keynote: Bank Name & Singapore Wording",
        "request_summary": (
            "Agree on keynote wording for the 68% bank stat and Singapore launch."
        ),
        "requester_user_id": "persona_creator",
        "requester_user_name": "cloud_demo@ (Cloud Launch & PMM Lead)",
        "requester_ldap": "cloud_demo@google.com",
        "requester_personal_agent_id": "agent_user_efch",
        "requester_personal_agent_name": "cloud_demo@'s Personal Agent",
        "requester_team_agent_id": "brand_agent",
        "requester_team_name": "Google Cloud Brand & PMM Governance",
        "workspace_agent_id": "workspace_agent",
        "workspace_agent_name": "Central Workspace Agent",
        "participating_users": [
            {
                "user_id": "persona_creator",
                "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
                "ldap": "cloud_demo@google.com",
                "role": "Requester",
                "routing_mode": "requester",
                "team_agent_id": "brand_agent",
                "team_name": "Google Cloud Brand & PMM Governance",
                "personal_agent_id": "agent_user_efch",
                "personal_agent_name": "cloud_demo@'s Personal Agent",
            },
            {
                "user_id": "persona_legal",
                "name": "priya.nair@ (Senior Product Counsel)",
                "ldap": "priya.nair@google.com",
                "role": "Legal & NDA Reviewer",
                "routing_mode": "tagged",
                "team_agent_id": "legal_agent",
                "team_name": "Google Cloud Legal & Customer References",
                "personal_agent_id": "agent_user_priya_nair",
                "personal_agent_name": "priya.nair@'s Personal Agent",
            },
            {
                "user_id": "persona_pm",
                "name": "maya.lin@ (Staff Cloud PM)",
                "ldap": "maya.lin@google.com",
                "role": "Product & Technical Reviewer",
                "routing_mode": "auto_routed",
                "team_agent_id": "pm_agent",
                "team_name": "Vertex AI & Cloud Product Management",
                "personal_agent_id": "agent_user_maya_lin",
                "personal_agent_name": "maya.lin@'s Personal Agent",
            },
        ],
        "participating_agents": [
            "workspace_agent",
            "agent_user_efch",
            "agent_user_priya_nair",
            "agent_user_maya_lin",
            "brand_agent",
            "legal_agent",
            "pm_agent",
        ],
        "shared_files": [
            {
                "id": "FILE-OWNER-105",
                "filename": "DEMO LAUNCH BRIEF.md",
                "owner_ldap": "cloud_demo@google.com",
                "personal_agent_id": "agent_user_efch",
                "content": (
                    "# Oct 18 Keynote Launch Brief\n"
                    "- Launch Date: October 18 (18 days left).\n"
                    "- Keynote Demo: 4-minute live demo featuring the 68% faster compliance review stat."
                ),
            },
            {
                "id": "FILE-LEGAL-102",
                "filename": "DEMO NDA VAULT.md",
                "owner_ldap": "priya.nair@google.com",
                "personal_agent_id": "agent_user_priya_nair",
                "content": (
                    "# Customer NDA Rules\n"
                    "- Apex Global Bank: Under Customer NDA. Say 'a major global bank' and keep the 68% stat."
                ),
            },
            {
                "id": "FILE-PM-101",
                "filename": "DEMO PRODUCT PRD.md",
                "owner_ldap": "maya.lin@google.com",
                "personal_agent_id": "agent_user_maya_lin",
                "content": (
                    "# Product Plan: Vertex AI Agent Builder\n"
                    "- Live Now (GA): US and Europe.\n"
                    "- In Preview until Nov 15: Singapore and voice encryption."
                ),
            },
        ],
        "workspace_routing_log": [
            {
                "step": 1,
                "actor": "cloud_demo@'s Personal Agent",
                "event": "Sent Launch Brief to Central Workspace Agent.",
            },
            {
                "step": 2,
                "actor": "Central Workspace Agent",
                "event": "Connected Launch, Legal, and Product agents.",
            },
            {
                "step": 3,
                "actor": "Central Workspace Agent",
                "event": "Agreed on wording and sent TKT-101 for sign-off.",
            },
        ],
        "agent_debate_turns": [
            {
                "turn_order": 1,
                "speaker_agent_id": "agent_user_priya_nair",
                "speaker_agent_name": "priya.nair@'s Personal Agent",
                "target_agent_id": "agent_user_efch",
                "referenced_file": "DEMO NDA VAULT.md",
                "message": "Say 'a major global bank' (NDA) — 68% stat is approved.",
            },
            {
                "turn_order": 2,
                "speaker_agent_id": "agent_user_maya_lin",
                "speaker_agent_name": "maya.lin@'s Personal Agent",
                "target_agent_id": "agent_user_efch",
                "referenced_file": "DEMO PRODUCT PRD.md",
                "message": "US & Europe live now; Singapore in Preview until Nov 15.",
            },
        ],
        "compromise_proposal": {
            "compromise_title": "Say 'a major global bank' + list Singapore as Preview",
            "compromise_summary": (
                "Say 'a major global bank' (keep 68% stat) and list Singapore as Preview until Nov 15."
            ),
            "updated_shared_file_name": "DEMO LAUNCH BRIEF.md",
            "updated_shared_file_content": (
                "# Oct 18 Keynote Launch Brief (Updated)\n"
                "- Launch Date: October 18.\n"
                "- Availability: Live in US & Europe; Preview in Singapore until Nov 15.\n"
                "- Customer Story: A major global bank cut compliance review time by 68%."
            ),
            "requires_additional_assistance": False,
            "assistance_reason": "",
        },
        "approvals": {
            "persona_creator": {
                "user_id": "persona_creator",
                "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
                "ldap": "cloud_demo@google.com",
                "team_agent_id": "brand_agent",
                "status": "approved",
                "updated_at": "2026-09-28 18:12 UTC",
                "comment": "Looks great — keeps our 68% keynote stat.",
            },
            "persona_legal": {
                "user_id": "persona_legal",
                "name": "priya.nair@ (Senior Product Counsel)",
                "ldap": "priya.nair@google.com",
                "team_agent_id": "legal_agent",
                "status": "pending",
                "updated_at": "2026-09-28 18:12 UTC",
                "comment": "Waiting for Priya Nair's sign-off.",
            },
            "persona_pm": {
                "user_id": "persona_pm",
                "name": "maya.lin@ (Staff Cloud PM)",
                "ldap": "maya.lin@google.com",
                "team_agent_id": "pm_agent",
                "status": "approved",
                "updated_at": "2026-09-28 18:14 UTC",
                "comment": "Approved — matches the Product Plan.",
            },
        },
        "adjustments_log": [],
        "h2h_thread": [],
    },
    {
        "id": "TKT-102",
        "created_at": "2026-09-28 18:20 UTC",
        "updated_at": "2026-09-28 18:30 UTC",
        "status": "needs_assistance",
        "title": "Oct 18 Demo Budget: $82k Plan vs. $60k Limit",
        "request_summary": (
            "Keep the Oct 18 demo within our $60,000 budget and 18-day deadline."
        ),
        "requester_user_id": "persona_creator",
        "requester_user_name": "cloud_demo@ (Cloud Launch & PMM Lead)",
        "requester_ldap": "cloud_demo@google.com",
        "requester_personal_agent_id": "agent_user_efch",
        "requester_personal_agent_name": "cloud_demo@'s Personal Agent",
        "requester_team_agent_id": "brand_agent",
        "requester_team_name": "Google Cloud Brand & PMM Governance",
        "workspace_agent_id": "workspace_agent",
        "workspace_agent_name": "Central Workspace Agent",
        "participating_users": [
            {
                "user_id": "persona_creator",
                "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
                "ldap": "cloud_demo@google.com",
                "role": "Requester",
                "routing_mode": "requester",
                "team_agent_id": "brand_agent",
                "team_name": "Google Cloud Brand & PMM Governance",
                "personal_agent_id": "agent_user_efch",
                "personal_agent_name": "cloud_demo@'s Personal Agent",
            },
            {
                "user_id": "persona_commercial",
                "name": "marcus.vance@ (VP Cloud GTM Ops)",
                "ldap": "marcus.vance@google.com",
                "role": "Commercial & PSO Approver",
                "routing_mode": "tagged",
                "team_agent_id": "commercial_agent",
                "team_name": "Cloud Go-To-Market & PSO Deal Desk",
                "personal_agent_id": "agent_user_marcus_vance",
                "personal_agent_name": "marcus.vance@'s Personal Agent",
            },
        ],
        "participating_agents": [
            "workspace_agent",
            "agent_user_efch",
            "agent_user_marcus_vance",
            "brand_agent",
            "commercial_agent",
        ],
        "shared_files": [
            {
                "id": "FILE-DEAL-103",
                "filename": "PSO RATE CARD.csv",
                "owner_ldap": "marcus.vance@google.com",
                "personal_agent_id": "agent_user_marcus_vance",
                "content": (
                    "# Launch Budget & PSO Rate Card\n"
                    "- Budget Limit: $60,000 | Team Limit: 4 people | Deadline: 18 days.\n"
                    "- Standard SAP Setup: $54,000 | 3.5 people | 14 days.\n"
                    "- Custom Mainframe Add-On: +$28,000 ($82,000 total) | 28 days."
                ),
            },
            {
                "id": "FILE-OWNER-105",
                "filename": "DEMO LAUNCH BRIEF.md",
                "owner_ldap": "cloud_demo@google.com",
                "personal_agent_id": "agent_user_efch",
                "content": (
                    "# Oct 18 Keynote Launch Brief\n"
                    "- Launch Date: October 18 (18 days left)."
                ),
            },
        ],
        "workspace_routing_log": [
            {
                "step": 1,
                "actor": "cloud_demo@'s Personal Agent",
                "event": "Flagged the $82,000 budget overrun.",
            },
            {
                "step": 2,
                "actor": "Central Workspace Agent",
                "event": "Connected Launch and Budget agents.",
            },
            {
                "step": 3,
                "actor": "Central Workspace Agent",
                "event": "Proposed $54k SAP Demo now and $28k Mainframe in Wave 2.",
            },
        ],
        "agent_debate_turns": [
            {
                "turn_order": 1,
                "speaker_agent_id": "agent_user_efch",
                "speaker_agent_name": "cloud_demo@'s Personal Agent",
                "target_agent_id": "agent_user_marcus_vance",
                "referenced_file": "DEMO LAUNCH BRIEF.md",
                "message": "SAP + Mainframe ($82k) is over our $60k budget.",
            },
            {
                "turn_order": 2,
                "speaker_agent_id": "agent_user_marcus_vance",
                "speaker_agent_name": "marcus.vance@'s Personal Agent",
                "target_agent_id": "agent_user_efch",
                "referenced_file": "PSO RATE CARD.csv",
                "message": "Ship $54k SAP Demo now; move $28k Mainframe to Wave 2.",
            },
        ],
        "compromise_proposal": {
            "compromise_title": "Ship $54k SAP Demo now; move $28k Mainframe to Wave 2",
            "compromise_summary": (
                "Ship the $54k Standard SAP Demo for Oct 18; move the $28k Mainframe add-on to Wave 2."
            ),
            "updated_shared_file_name": "PSO RATE CARD.csv",
            "updated_shared_file_content": (
                "# Agreed Launch Budget Plan\n"
                "- Wave 1 (Oct 18): Standard SAP Demo — $54,000 | 3.5 people | 14 days.\n"
                "- Wave 2 (Follow-Up): Custom Mainframe Add-On — $28,000 | 2.0 people."
            ),
            "requires_additional_assistance": True,
            "assistance_reason": (
                "Needs sign-off from cloud_demo@ and marcus.vance@."
            ),
        },
        "approvals": {
            "persona_creator": {
                "user_id": "persona_creator",
                "name": "cloud_demo@ (Cloud Launch & PMM Lead)",
                "ldap": "cloud_demo@google.com",
                "team_agent_id": "brand_agent",
                "status": "pending",
                "updated_at": "2026-09-28 18:25 UTC",
                "comment": "",
            },
            "persona_commercial": {
                "user_id": "persona_commercial",
                "name": "marcus.vance@ (VP Cloud GTM Ops)",
                "ldap": "marcus.vance@google.com",
                "team_agent_id": "commercial_agent",
                "status": "pending",
                "updated_at": "2026-09-28 18:25 UTC",
                "comment": "",
            },
        },
        "adjustments_log": [],
        "h2h_thread": [],
    },
]
