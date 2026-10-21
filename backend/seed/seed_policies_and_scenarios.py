"""Seed Rate Cards, Policy Packs, Scenarios & What-If Presets (`seed_policies_and_scenarios.py`).

Defines:
- `PSO_RATE_CARD`: Deterministic PSO SKU catalog isolating LLMs from budget/FTE math.
- `POLICY_PACKS`: Department Policy Packs (`pack_prd_truth`, `pack_brand_naming`,
  `pack_legal_nda`, `pack_commercial_feasibility`).
- `SCENARIOS`: Launch scenarios (`cloud_launch_hybrid`, `cloud_marketing_blog`,
  `enterprise_deal_scope`).
- `WHAT_IF_PRESETS`, `INITIAL_MEMORY_LOG`, and `_default_debate_turns()`.
"""

from __future__ import annotations

from typing import Any


# Deterministic Rate & Capacity Catalog — isolates LLM from arithmetic
PSO_RATE_CARD: list[dict[str, Any]] = [
    {
        "sku": "PSO-SAP-REF",
        "name": "Standard SAP Setup + Live Keynote Demo",
        "keywords": ["pre-certified sap", "sap reference", "sap cloud erp", "standard sap"],
        "cost_usd": 54000,
        "fte_load": 3.5,
        "duration_days": 14,
    },
    {
        "sku": "PSO-MAINFRAME-CUSTOM",
        "name": "Custom Mainframe Add-On + 6-City Tour",
        "keywords": ["bespoke mainframe", "6-city executive roadshow", "custom mainframe"],
        "cost_usd": 28000,
        "fte_load": 2.0,
        "duration_days": 14,
    },
    {
        "sku": "PSO-WAVE1-CLINICAL",
        "name": "Phase 1 Core Services Migration (12 services)",
        "keywords": ["12 core clinical", "12 microservices"],
        "cost_usd": 118000,
        "fte_load": 5.5,
        "duration_days": 27,
    },
    {
        "sku": "PSO-WAVE2-LEGACY-DB",
        "name": "Phase 2 Archive Databases (+16 DBs)",
        "keywords": ["28 legacy databases"],
        "cost_usd": 46000,
        "fte_load": 3.0,
        "duration_days": 17,
    },
]


POLICY_PACKS: list[dict[str, Any]] = [
    {
        "id": "pack_prd_truth",
        "agent_id": "pm_agent",
        "title": "Product Plan & Launch Dates",
        "source_doc": "DEMO PRODUCT PRD.md",
        "rules": [
            {
                "id": "RULE-PM-01",
                "summary": "Live today in the US and Europe; Singapore is in Preview until Nov 15.",
                "constraint": "Do not say Singapore is fully live before Nov 15.",
                "forbidden_term": "full General Availability across all global regions, including Singapore (asia-southeast1)",
                "replacement_term": "live availability in the US and Europe, with Singapore in Preview until Nov 15",
                "severity": "auto_fix",
                "enabled": True,
            },
            {
                "id": "RULE-PM-02",
                "summary": "Verified speed improvement is 3.2x faster response time (not 10x).",
                "constraint": "Use the verified 3.2x faster response time stat.",
                "forbidden_term": "10x faster latency",
                "replacement_term": "3.2x faster response time (up to 3.2x lower p99 latency)",
                "severity": "auto_fix",
                "enabled": True,
            },
            {
                "id": "RULE-PM-03",
                "summary": "Voice encryption is in Preview until Nov 15.",
                "constraint": "List voice encryption as Preview.",
                "forbidden_term": "full CMEK support for duplex voice",
                "replacement_term": "Preview support for voice encryption",
                "severity": "auto_fix",
                "enabled": True,
            },
        ],
    },
    {
        "id": "pack_brand_naming",
        "agent_id": "brand_agent",
        "title": "Google Cloud Brand Rules",
        "source_doc": "DEMO BRAND RULES.md",
        "rules": [
            {
                "id": "RULE-BR-01",
                "summary": "Always write 'Google Cloud' in public copy instead of 'GCP'.",
                "constraint": "Replace 'GCP' with 'Google Cloud'.",
                "forbidden_term": "GCP",
                "replacement_term": "Google Cloud",
                "severity": "auto_fix",
                "enabled": True,
            },
            {
                "id": "RULE-BR-02",
                "summary": "Use the official name 'Vertex AI Agent Builder', never 'Google Vertex Autonomous Brain'.",
                "constraint": "Use approved product names only.",
                "forbidden_term": "Google Vertex Autonomous Brain",
                "replacement_term": "Vertex AI Agent Builder",
                "severity": "auto_fix",
                "enabled": True,
            },
        ],
    },
    {
        "id": "pack_legal_nda",
        "agent_id": "legal_agent",
        "title": "Customer NDA & Legal Rules",
        "source_doc": "DEMO NDA VAULT.md",
        "rules": [
            {
                "id": "RULE-LG-01",
                "summary": "Apex Global Bank is under NDA; say 'a major global bank' unless Legal signs a waiver.",
                "constraint": "Do not use 'Apex Global Bank' by name without a signed waiver.",
                "forbidden_term": "Apex Global Bank",
                "replacement_term": "a major global bank",
                "severity": "hard_stop",
                "enabled": True,
            },
            {
                "id": "RULE-LG-02",
                "summary": "Do not promise '100% hallucination-free' results.",
                "constraint": "Say 'answers backed by source citations' instead of 100% guarantees.",
                "forbidden_term": "100% hallucination-free",
                "replacement_term": "answers backed by source citations",
                "severity": "auto_fix",
                "enabled": True,
            },
        ],
    },
    {
        "id": "pack_commercial_feasibility",
        "agent_id": "commercial_agent",
        "title": "Launch Budget & Timeline Limits",
        "source_doc": "PSO RATE CARD.csv",
        "rules": [
            {
                "id": "RULE-CM-01",
                "summary": "Total cost must stay within the $60,000 launch budget.",
                "constraint": "Requires sign-off if cost goes over budget.",
                "forbidden_term": "",
                "replacement_term": "",
                "severity": "hard_stop",
                "enabled": True,
            },
            {
                "id": "RULE-CM-02",
                "summary": "Work must fit within the 18-day launch deadline and 4-person team limit.",
                "constraint": "Requires sign-off if timeline misses the launch date.",
                "forbidden_term": "",
                "replacement_term": "",
                "severity": "hard_stop",
                "enabled": True,
            },
        ],
    },
]


SCENARIOS: dict[str, dict[str, Any]] = {
    "cloud_launch_hybrid": {
        "id": "cloud_launch_hybrid",
        "name": "Vertex AI Launch + Apex Bank Deal",
        "subtitle": "Oct 18 Keynote Launch + Customer Story & Budget Check",
        "workspace_mode": "Shared Workspace (Marketing + Product + Legal + Budget)",
        "allocated_budget": 60000,
        "tolerance_limit": 66000,
        "target_launch_days": 18,
        "team_capacity_fte": 4.0,
        "document_title": "Launch Brief & Joint Announcement: Vertex AI Agent Builder + Apex Global Bank",
        "document_text": (
            "Headline: Introducing Google Vertex Autonomous Brain on GCP — Now Generally Available Globally!\n\n"
            "1. Product & Performance Announcement:\n"
            "Starting today, GCP customers can deploy Vertex AI Agent Builder with full General Availability "
            "across all global regions, including Singapore (asia-southeast1), with full CMEK support for duplex voice. "
            "In production benchmarks, our new runtime delivers 10x faster latency than competing cloud providers "
            "and guarantees 100% hallucination-free financial compliance.\n\n"
            "2. Customer Spotlight (Named External Press Release & Keynote Slide):\n"
            "\"By migrating our core trading copilot to GCP, Apex Global Bank cut compliance review cycles by 68%,\" "
            "said the CTO of Apex Global Bank. We will feature the Apex Global Bank logo on the main stage keynote on October 18.\n\n"
            "3. Joint Delivery Scope & Commercial Commitment:\n"
            "To close the joint keynote showcase, Google Cloud PSO will deliver a custom bespoke mainframe & SAP live connector "
            "plus a 6-city executive roadshow prior to October 18 (estimated spend: $82,000; requires 5.5 PSO FTEs over 28 business days)."
        ),
        "claims": [
            {
                "id": "CLM-101",
                "category": "Brand Rule",
                "agent_id": "brand_agent",
                "rule_id": "RULE-BR-01",
                "severity": "auto_fix",
                "status": "flagged",
                "excerpt": "Introducing Google Vertex Autonomous Brain on GCP",
                "replacement": "Introducing Vertex AI Agent Builder on Google Cloud",
                "issue": "Uses unapproved name ('Google Vertex Autonomous Brain') and old 'GCP' acronym.",
                "evidence": "Brand Rule: Use 'Vertex AI Agent Builder' and 'Google Cloud'.",
                "impact_summary": "1-click fix with no delay.",
                "blocking_workstream": "Launch Headline",
            },
            {
                "id": "CLM-102",
                "category": "Product Rule",
                "agent_id": "pm_agent",
                "rule_id": "RULE-PM-01",
                "severity": "auto_fix",
                "status": "flagged",
                "excerpt": "full General Availability across all global regions, including Singapore (asia-southeast1), with full CMEK support for duplex voice.",
                "replacement": "live availability in the US & Europe, with Singapore and voice encryption in Preview until Nov 15.",
                "issue": "Singapore and voice encryption are in Preview until Nov 15, not fully live yet.",
                "evidence": "Product Plan: Live in US & Europe; Preview in Singapore until Nov 15.",
                "impact_summary": "Matches the official Product Plan.",
                "blocking_workstream": "Launch Regions",
            },
            {
                "id": "CLM-103",
                "category": "Product & Legal Rule",
                "agent_id": "pm_agent",
                "rule_id": "RULE-PM-02",
                "severity": "auto_fix",
                "status": "flagged",
                "excerpt": "delivers 10x faster latency than competing cloud providers and guarantees 100% hallucination-free financial compliance.",
                "replacement": "delivers 3.2x faster response time (up to 3.2x lower p99 latency) and answers backed by source citations.",
                "issue": "Says '10x faster' (verified speed is 3.2x) and promises '100% hallucination-free'.",
                "evidence": "Product Plan: 3.2x faster response time; Legal bans 100% guarantees.",
                "impact_summary": "Uses verified speed numbers and approved wording.",
                "blocking_workstream": "Speed & Accuracy Claims",
            },
            {
                "id": "CLM-104",
                "category": "Customer NDA",
                "agent_id": "legal_agent",
                "rule_id": "RULE-LG-01",
                "severity": "hard_stop",
                "status": "hard_stop",
                "excerpt": "\"By migrating our core trading copilot to GCP, Apex Global Bank cut compliance review cycles by 68%,\" said the CTO of Apex Global Bank. We will feature the Apex Global Bank logo on the main stage keynote on October 18.",
                "replacement": "On Google Cloud, a major global bank cut compliance review time by 68% using Vertex AI Agent Builder.",
                "issue": "Blocker: Apex Global Bank is under NDA. Use 'a major global bank' or get a signed waiver.",
                "evidence": "Customer NDA Vault: 'a major global bank' + 68% stat is approved; bank logo is blocked.",
                "impact_summary": "Pauses only the customer slide while other work continues.",
                "blocking_workstream": "Keynote Customer Slide",
                "compromise_title": "Say 'a major global bank' and keep the 68% stat",
            },
            {
                "id": "CLM-105",
                "category": "Budget & Timeline",
                "agent_id": "commercial_agent",
                "rule_id": "RULE-CM-01",
                "severity": "hard_stop",
                "status": "hard_stop",
                "excerpt": "Google Cloud PSO will deliver a custom bespoke mainframe & SAP live connector plus a 6-city executive roadshow prior to October 18 (estimated spend: $82,000; requires 5.5 PSO FTEs over 28 business days).",
                "replacement": "Google Cloud will launch the Standard SAP setup for the Oct 18 keynote and move the Custom Mainframe add-on to Phase 2 ($54,000; 3.5 people over 14 days).",
                "issue": "Blocker: $82,000 is $22k over our $60k budget and misses the Oct 18 keynote by 10 days.",
                "evidence": "Rate Card: Standard SAP setup ($54k, 14 days) fits; Mainframe add-on (+$28k) pushes to 28 days.",
                "impact_summary": "Moving Mainframe to Phase 2 saves $28,000 and finishes 4 days early.",
                "blocking_workstream": "Launch Budget & Schedule",
                "compromise_title": "Use Standard SAP setup ($54k / 14 days) for Oct 18; move Mainframe to Phase 2",
            },
        ],
    },
    "cloud_marketing_blog": {
        "id": "cloud_marketing_blog",
        "name": "BigQuery Data Canvas Launch Blog",
        "subtitle": "Pure Cloud PMM Content & Competitive Benchmark Review",
        "workspace_mode": "Collaborative Workspace (BigQuery PMM + Data Analytics PM + Legal)",
        "allocated_budget": 25000,
        "tolerance_limit": 27500,
        "target_launch_days": 10,
        "team_capacity_fte": 2.0,
        "document_title": "Launch Blog: BigQuery Autonomous Data Canvas Beats Snowflake by 8x",
        "document_text": (
            "Headline: GCP BigQuery Autonomous Data Canvas Is Now GA Across All Regions\n\n"
            "1. Core Claim:\n"
            "GCP is proud to announce that BigQuery Autonomous Data Canvas is Generally Available today in every region "
            "with zero-cost query optimization and 8x lower TCO than Snowflake on all enterprise workloads.\n\n"
            "2. Customer Proof:\n"
            "RetailGiant Corp replaced 100% of their legacy data warehouse in 48 hours with zero human DBA review.\n\n"
            "3. Campaign Spend:\n"
            "Paid digital syndication and benchmark whitepaper production budgeted at $24,000 over 9 business days (1.8 FTEs)."
        ),
        "claims": [
            {
                "id": "CLM-201",
                "category": "Brand & Naming",
                "agent_id": "brand_agent",
                "rule_id": "RULE-BR-01",
                "severity": "auto_fix",
                "status": "flagged",
                "excerpt": "GCP BigQuery Autonomous Data Canvas Is Now GA Across All Regions",
                "replacement": "Google Cloud BigQuery Data Canvas Is Now Available in Preview",
                "issue": "Uses deprecated 'GCP' acronym and unapproved 'Autonomous' product modifier.",
                "evidence": "Brand Guide §2.1: Use 'Google Cloud BigQuery Data Canvas'.",
                "impact_summary": "Instant brand compliance fix.",
                "blocking_workstream": "Blog Headline",
            },
            {
                "id": "CLM-202",
                "category": "Benchmark & Legal Substantiation",
                "agent_id": "legal_agent",
                "rule_id": "RULE-LG-02",
                "severity": "hard_stop",
                "status": "hard_stop",
                "excerpt": "zero-cost query optimization and 8x lower TCO than Snowflake on all enterprise workloads.",
                "replacement": "automated SQL query recommendations and up to 2.7x price-performance improvement on TPC-DS 10TB internal benchmarks compared to alternative cloud data warehouses.",
                "issue": "HARD STOP: Naming competitor directly with unsubstantiated '8x on all workloads' violates Comparative Advertising Policy.",
                "evidence": "Legal Comparative Claims Guide §3.1: Must use anonymized 'alternative cloud data warehouses' unless third-party audited.",
                "impact_summary": "Halts comparative chart; narrative blog sections remain unblocked.",
                "blocking_workstream": "Competitive Benchmark Section",
                "compromise_title": "Cite TPC-DS 10TB 2.7x Price-Performance Without Named Competitor",
            },
        ],
    },
    "enterprise_deal_scope": {
        "id": "enterprise_deal_scope",
        "name": "Pacific National Healthcare SOW (#CR-44)",
        "subtitle": "Dynamic Client Scope Expansion Across Eng, Product, Legal & Commercials",
        "workspace_mode": "Collaborative Workspace (Cloud Solutions + PSO + Deal Desk + Legal)",
        "allocated_budget": 120000,
        "tolerance_limit": 132000,
        "target_launch_days": 30,
        "team_capacity_fte": 6.0,
        "document_title": "Change Request #CR-44: Sovereign Cloud Migration + Real-Time Fraud Agent",
        "document_text": (
            "Client Demand Update: Pacific National Healthcare requests adding real-time HIPAA/PHI voice transcription "
            "on GCP in asia-southeast1 with guaranteed zero latency spike, plus expanding PSO migration scope from 12 microservices "
            "to 28 legacy databases within the original 30-day Go-Live window (projected spend: $164,000; requires 8.5 FTEs over 44 days)."
        ),
        "claims": [
            {
                "id": "CLM-301",
                "category": "Technical Truth (PRD)",
                "agent_id": "pm_agent",
                "rule_id": "RULE-PM-03",
                "severity": "auto_fix",
                "status": "flagged",
                "excerpt": "real-time HIPAA/PHI voice transcription on GCP in asia-southeast1 with guaranteed zero latency spike",
                "replacement": "HIPAA-aligned batch and streaming text transcription on Google Cloud with p99 SLA targets (duplex voice CMEK in Public Preview)",
                "issue": "Duplex voice CMEK in asia-southeast1 is Public Preview and not covered under the BAA until Nov 15.",
                "evidence": "PRD v2.4 Compliance Matrix.",
                "impact_summary": "Aligns technical scope with GA BAA coverage.",
                "blocking_workstream": "Architecture Specification",
            },
            {
                "id": "CLM-302",
                "category": "Budget, Capacity & Schedule Feasibility",
                "agent_id": "commercial_agent",
                "rule_id": "RULE-CM-01",
                "severity": "hard_stop",
                "status": "hard_stop",
                "excerpt": "expanding PSO migration scope from 12 microservices to 28 legacy databases within the original 30-day Go-Live window (projected spend: $164,000; requires 8.5 FTEs over 44 days).",
                "replacement": "migrating the 12 core clinical microservices in Wave 1 within the 30-day Go-Live window ($118,000; 5.5 FTEs over 27 days), with the 16 archival databases scheduled for Wave 2.",
                "issue": "HARD STOP: $164,000 exceeds $120,000 budget by +$44,000 and slips Go-Live by +14 business days.",
                "evidence": "PSO Delivery Estimator #EST-902.",
                "impact_summary": "Wave 1/Wave 2 split keeps Go-Live on day 27 and saves $46,000 in Wave 1 budget.",
                "blocking_workstream": "SOW Amendment & Budget Sign-off",
                "compromise_title": "Split into Wave 1 (12 Core Services, $118k, 27d) + Wave 2 Archival DBs",
            },
        ],
    },
}


WHAT_IF_PRESETS: list[dict[str, Any]] = [
    {
        "id": "whatif_anonymize_customer",
        "label": "What if we switch Named Customer References to NDA Anonymized Mode?",
        "description": "Applies NDA Anonymized Summary Mode so customer impact metrics stay without requiring external logo/name waiver.",
        "resolves_claim_ids": ["CLM-104"],
        "agent_note": "Legal Agent verified: Anonymized Tier-1 Financial Institution summary satisfies Strict Tier-2 NDA without external PR delay.",
    },
    {
        "id": "whatif_phase_mainframe",
        "label": "What if we phase Wave-2 / Bespoke Scope to fit inside Wave-1 Budget?",
        "description": "Phases non-critical custom connectors/databases into Wave 2 to fit allocated budget and launch deadline.",
        "resolves_claim_ids": ["CLM-105", "CLM-302"],
        "agent_note": "Commercial & PM Agents aligned: Phasing Wave-2 custom scope brings spend and timeline inside the target launch envelope.",
    },
    {
        "id": "whatif_pull_deadline_7d",
        "label": "Stress Test: What if Execs pull the Launch Deadline in by 5 days?",
        "description": "Simulates tightening the non-negotiable launch milestone by 5 business days.",
        "tighten_days": 13,
        "agent_note": "Commercial Agent Alert: Pulling milestone to 13 days pushes critical path into a 1-day deficit even with phased scope unless 0.5 extra PSO FTE is allocated.",
    },
    {
        "id": "whatif_qualify_preview_claims",
        "label": "What if we auto-align all Stage-1 Brand, Regional Preview & Benchmark claims?",
        "description": "Applies all Stage 1 Policy Pack auto-fixes across Brand, Cloud PM, and Benchmark rules.",
        "resolves_claim_ids": ["CLM-101", "CLM-102", "CLM-103", "CLM-201", "CLM-301"],
        "agent_note": "Cloud PM & Brand Agents cleared all Stage-1 drift items automatically.",
    },
]


INITIAL_MEMORY_LOG: list[dict[str, Any]] = [
    {
        "id": "MEM-01",
        "timestamp": "2026-09-25 16:40 UTC",
        "stakeholder": "priya.nair@ (Senior Product Counsel)",
        "decision": "Approved anonymized industry benchmark comparisons when citing TPC-DS 10TB internal config.",
        "promoted_to_rule": True,
        "rule_id": "RULE-LG-02",
    }
]


def _default_debate_turns() -> list[dict[str, Any]]:
    """Returns the initial 4-Agent scrub debate turn entries."""
    return [
        {
            "id": "TURN-1",
            "agent_id": "brand_agent",
            "agent_name": "Brand & Comms Agent",
            "badge": "BRAND",
            "type": "scrub",
            "message": "Checked Brand Rules: flagged 'GCP' and unapproved product names with a 1-click fix.",
        },
        {
            "id": "TURN-2",
            "agent_id": "pm_agent",
            "agent_name": "Cloud PM Agent",
            "badge": "PM",
            "type": "scrub",
            "message": "Checked Product Plan: US & Europe are live now; Singapore and voice encryption are in Preview until Nov 15.",
        },
        {
            "id": "TURN-3",
            "agent_id": "legal_agent",
            "agent_name": "Legal & NDA Agent",
            "badge": "LEGAL",
            "type": "hard_stop",
            "message": "Checked Customer NDA Vault: Apex Global Bank is under NDA; use 'a major global bank' instead.",
        },
        {
            "id": "TURN-4",
            "agent_id": "commercial_agent",
            "agent_name": "Commercial & Delivery Agent",
            "badge": "DEAL",
            "type": "hard_stop",
            "message": "Checked Rate Card: $82k is over our $60k budget; use the $54k Standard SAP setup for Oct 18.",
        },
    ]
