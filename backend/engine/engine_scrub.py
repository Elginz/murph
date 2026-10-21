"""Multi-Agent Claim Scrub, Escalation Governance & Deliverable Compiler Mixin.

Implements Stage-1 drift auto-fixes (`apply_autofix`), Stage-2 hard-stop
escalation resolution and precedent promotion (`resolve_escalation`,
`promote_memory`), parallel 4-agent document scrubbing (`analyze_custom_document`),
and Stage-3 zero-drift deliverable compilation (`_compile_derivatives`,
`export_deliverables_markdown`).
"""

from __future__ import annotations

import datetime
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_deliverables
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_deliverables
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.engine import engine_deliverables  # type: ignore
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS


class GovernanceAndDeliverablesMixin(
    engine_deliverables.DeliverablesCompilerMixin
):
    """Mixin for claim auto-fix, escalation governance, document scrubbing, and deliverables."""
    _append_turn: Any
    _compute_feasibility: Any
    _extract_deterministic_scope_numbers: Any
    _persist_active_project: Any

    store: Any
    llm_client: Any
    active_scenario_id: str
    current_user: dict[str, Any] | None
    policy_packs: Any
    memory_log: list[dict[str, Any]]
    scenario_meta: dict[str, Any]
    claims: list[dict[str, Any]]
    document_text: str
    live_derivatives_override: dict[str, str] | None

    _CLAIM_ID_ALIASES: dict[str, tuple[str, ...]] = {
        "CLM-01": ("CLM-01", "CLM-101", "CLM-103"),
        "CLM-02": ("CLM-02", "CLM-102"),
        "CLM-03": ("CLM-03", "CLM-103"),
        "CLM-04": ("CLM-04", "CLM-104"),
        "CLM-05": ("CLM-05", "CLM-105"),
        "CLM-101": ("CLM-01", "CLM-101"),
        "CLM-102": ("CLM-02", "CLM-102"),
        "CLM-103": ("CLM-03", "CLM-103"),
        "CLM-104": ("CLM-04", "CLM-104"),
        "CLM-105": ("CLM-05", "CLM-105"),
    }

    def apply_autofix(self, claim_id: str | None = None) -> dict[str, Any]:
        """Applies 1-click auto-fix to a specific claim or all auto-fixable claims and persists to SQLite."""
        fixed_ids: list[str] = []
        target_ids = (
            set(self._CLAIM_ID_ALIASES.get(claim_id, (claim_id,)))
            if claim_id
            else set()
        )
        for claim in self.claims:
            if claim_id and claim["id"] not in target_ids:
                continue
            if claim_id is None and claim["severity"] != "auto_fix":
                continue
            if claim["status"] in ("flagged", "hard_stop"):
                if claim["excerpt"] in self.document_text:
                    self.document_text = self.document_text.replace(
                        claim["excerpt"], claim["replacement"], 1
                    )
                claim["status"] = "resolved"
                claim["resolution_method"] = "AI 1-Click Auto-Fix"
                fixed_ids.append(claim["id"])

        if fixed_ids:
            self._persist_active_project()
            self._append_turn(
                agent_id="pm_agent",
                agent_name="Murph Orchestrator",
                badge="SYNC",
                turn_type="resolved",
                message=f"Applied verified rewrite for {', '.join(fixed_ids)}. Document text and Claim Graph synchronized with Policy Packs.",
            )
        return self.get_state()

    def resolve_escalation(
        self,
        claim_id: str,
        action: str,
        stakeholder_comment: str = "",
        promote_to_rule: bool = False,
    ) -> dict[str, Any]:
        """Handles human stakeholder decision on a Hard-Stop Escalation Card and persists to SQLite."""
        if action in ("unapprove", "revert"):
            target_ids = set(self._CLAIM_ID_ALIASES.get(claim_id, (claim_id,)))
            reverted: list[str] = []
            for claim in self.claims:
                match = (
                    (claim_id == "ALL_AUTO_FIX" and claim.get("severity") == "auto_fix")
                    or (claim_id == "ALL_HARD_STOPS" and claim.get("severity") == "hard_stop")
                    or claim_id == "ALL"
                    or claim["id"] in target_ids
                )
                if not match:
                    continue
                if claim.get("replacement") and claim.get("excerpt") and claim["replacement"] in self.document_text:
                    self.document_text = self.document_text.replace(claim["replacement"], claim["excerpt"], 1)
                claim["status"] = "hard_stop" if claim.get("severity") == "hard_stop" else "flagged"
                claim["resolution_method"] = ""
                reverted.append(claim["id"])
            if reverted:
                self._persist_active_project()
                self._append_turn(
                    agent_id="pm_agent",
                    agent_name="Murph Orchestrator",
                    badge="REVERT",
                    turn_type="sim",
                    message=f"Reverted approval on {', '.join(reverted)} — reopened for review.",
                )
            return self.get_state()

        target_ids = set(self._CLAIM_ID_ALIASES.get(claim_id, (claim_id,)))
        for claim in self.claims:
            if claim["id"] not in target_ids:
                continue

            agent_meta = next((a for a in AGENTS if a["id"] == claim["agent_id"]), AGENTS[0])
            approver_label = self.current_user["name"] if self.current_user else agent_meta["human_approver"]
            now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

            if action == "approve_compromise":
                if claim["excerpt"] in self.document_text:
                    self.document_text = self.document_text.replace(claim["excerpt"], claim["replacement"], 1)
                claim["status"] = "resolved"
                claim["resolution_method"] = f"Compromise Approved by {approver_label}"
                decision_summary = (
                    f"Approved multi-agent compromise on {claim['id']} ({claim['category']}): "
                    f"{claim.get('compromise_title', 'Adopted policy-compliant rewrite')}."
                )
            elif action in ("override_approve", "sign_waiver"):
                claim["status"] = "approved_override"
                claim["resolution_method"] = f"Executive Exception Signed by {approver_label}"
                decision_summary = (
                    f"Granted explicit stakeholder exception for {claim['id']} ({claim['category']}). "
                    f"Note: {stakeholder_comment or 'Cleared via executive waiver.'}"
                )
            else:
                claim["status"] = "hard_stop"
                claim["resolution_method"] = f"Rejected by {approver_label} — Halted"
                decision_summary = f"Confirmed Hard Stop on {claim['id']}: workstream remains halted pending scope revision."

            mem_entry = {
                "id": f"MEM-0{len(self.memory_log) + 1}",
                "timestamp": now_str,
                "stakeholder": approver_label,
                "decision": decision_summary,
                "promoted_to_rule": promote_to_rule,
                "rule_id": claim["rule_id"],
            }
            self.store.insert_memory_entry(mem_entry)
            self.memory_log = self.store.get_memory_log()
            if promote_to_rule:
                self._promote_memory_to_rule(mem_entry["id"])

            self._persist_active_project()
            self._append_turn(
                agent_id=claim["agent_id"],
                agent_name=agent_meta["name"],
                badge=agent_meta["badge"],
                turn_type="resolved" if action not in ("reject", "reject_halt") else "hard_stop",
                message=f"Stakeholder Decision ({approver_label}): {decision_summary}",
            )
            break

        return self.get_state()

    def _promote_memory_to_rule(self, memory_id: str) -> None:
        self.store.mark_memory_promoted(memory_id)
        self.memory_log = self.store.get_memory_log()
        for mem in self.memory_log:
            if mem["id"] == memory_id:
                for pack in self.policy_packs:
                    if any(r["id"] == mem["rule_id"] for r in pack["rules"]):
                        if not any(r.get("source_memory") == memory_id for r in pack["rules"]):
                            new_rule_id = f"RULE-DYN-{sum(len(p['rules']) for p in self.policy_packs) + 1}"
                            self.store.add_policy_rule(
                                pack["id"],
                                {
                                    "id": new_rule_id, "agent_id": pack["agent_id"],
                                    "summary": f"[Learned Precedent] {mem['decision']}",
                                    "constraint": f"Enforced from stakeholder sign-off ({mem['stakeholder']}).",
                                    "forbidden_term": "", "replacement_term": "",
                                    "severity": "auto_fix", "enabled": True, "source_memory": memory_id,
                                },
                            )
                        break
        self.policy_packs = self.store.get_policy_packs()

    def promote_memory(self, memory_id: str) -> dict[str, Any]:
        self._promote_memory_to_rule(memory_id)
        return self.get_state()

    def analyze_custom_document(self, text: str) -> dict[str, Any]:
        """Runs Multi-Agent Claim Extraction & Parallel Role Agent Evaluation on any document."""
        self.document_text = text
        feasibility_ctx = self._compute_feasibility()

        parallel_results = self.llm_client.run_parallel_role_agents(
            document_text=text,
            agents=AGENTS,
            policy_packs=self.policy_packs,
            feasibility_context=feasibility_ctx,
        )

        if parallel_results is not None:
            live_claims: list[dict[str, Any]] = []
            idx = 1
            for entry in parallel_results:
                ag = entry["agent"]
                res = entry["result"]
                stmt = res.get("war_room_statement", "")
                if stmt:
                    self._append_turn(
                        agent_id=ag["id"],
                        agent_name=ag["name"],
                        badge=ag["badge"],
                        turn_type="hard_stop"
                        if any(
                            c.get("severity") == "hard_stop"
                            for c in res.get("claims", [])
                        )
                        else "scrub",
                        message=f"[LIVE GEMINI] {stmt}",
                    )
                for raw_c in res.get("claims", []):
                    sev = raw_c.get("severity", "auto_fix")
                    live_claims.append(
                        {
                            "id": f"CLM-AI-{idx:02d}",
                            "category": raw_c.get("category", ag["role"]),
                            "agent_id": ag["id"],
                            "rule_id": raw_c.get("rule_id", "POLICY"),
                            "severity": sev,
                            "status": "hard_stop"
                            if sev == "hard_stop"
                            else "flagged",
                            "excerpt": raw_c.get("excerpt", ""),
                            "replacement": raw_c.get("replacement", ""),
                            "issue": raw_c.get("issue", ""),
                            "evidence": raw_c.get(
                                "evidence", f"Audited by {ag['name']}"
                            ),
                            "impact_summary": raw_c.get("impact_summary", ""),
                            "blocking_workstream": raw_c.get(
                                "blocking_workstream", ag["role"]
                            ),
                            "compromise_title": raw_c.get(
                                "compromise_title",
                                "Adopt Agent-Recommended Rewrite",
                            ),
                        }
                    )
                    idx += 1

            self.claims = live_claims

            mediator_res = self.llm_client.run_mediator_and_derivatives(
                document_text=text,
                claims=self.claims,
                feasibility=self._compute_feasibility(),
            )
            if mediator_res:
                for turn in mediator_res.get("negotiation_turns", []):
                    self._append_turn(
                        agent_id=turn.get("agent_id", "pm_agent"),
                        agent_name=turn.get("agent_name", "Murph Mediator"),
                        badge=turn.get("badge", "MED"),
                        turn_type="sim",
                        message=f"[LIVE NEGOTIATION] {turn.get('message', '')}",
                    )
                self.live_derivatives_override = {
                    "blog_post": mediator_res.get("blog_post_content", ""),
                    "sales_faq": mediator_res.get("sales_faq_content", ""),
                }
            self._persist_active_project()
            return self.get_state()

        # Universal Deterministic Multi-Agent Policy Pack & Heuristic Scanner
        new_claims: list[dict[str, Any]] = []
        matched_excerpts: set[str] = set()

        # 1. Brand & Naming Check
        if re.search(r"\bGCP\b", text) or "Autonomous Brain" in text:
            excerpt = (
                "GCP"
                if "Autonomous Brain" not in text
                else "Google Vertex Autonomous Brain on GCP"
            )
            if excerpt not in text:
                excerpt = "GCP"
            matched_excerpts.add(excerpt)
            new_claims.append(
                {
                    "id": f"CLM-DYN-{len(new_claims) + 1}",
                    "category": "Brand & Naming",
                    "agent_id": "brand_agent",
                    "rule_id": "RULE-BR-01",
                    "severity": "auto_fix",
                    "status": "flagged",
                    "excerpt": excerpt,
                    "replacement": "Google Cloud"
                    if excerpt == "GCP"
                    else "Vertex AI Agent Builder on Google Cloud",
                    "issue": "Detected deprecated 'GCP' acronym or non-standard product naming lockup.",
                    "evidence": "Brand Guide §2.1: Use 'Google Cloud' in all external assets.",
                    "impact_summary": "1-click brand terminology replacement.",
                    "blocking_workstream": "Brand & Copy Scrub",
                }
            )

        # 2. Benchmark & Technical Truth Check
        if "10x" in text or "100% hallucination-free" in text:
            target_ex = (
                "10x faster latency"
                if "10x faster latency" in text
                else ("10x" if "10x" in text else "100% hallucination-free")
            )
            matched_excerpts.add(target_ex)
            new_claims.append(
                {
                    "id": f"CLM-DYN-{len(new_claims) + 1}",
                    "category": "Benchmark & Technical Truth",
                    "agent_id": "pm_agent",
                    "rule_id": "RULE-PM-02",
                    "severity": "auto_fix",
                    "status": "flagged",
                    "excerpt": target_ex,
                    "replacement": "up to 3.2x lower p99 latency on TPU v5e benchmarks¹",
                    "issue": "Unverified '10x' performance multiplier or prohibited absolute accuracy guarantee.",
                    "evidence": "PRD v2.4 Benchmark #BM-884 verified at 3.2x p99 speedup.",
                    "impact_summary": "Aligns claim with engineering benchmark footnote.",
                    "blocking_workstream": "Technical Fact-Check Gate",
                }
            )
        else:
            mult_m = re.search(
                r"\b([4-9]|\d{2,})x\s+(?:faster|lower|cheaper|better)\b",
                text,
                re.IGNORECASE,
            )
            if mult_m and "#BM-" not in text and "¹" not in text:
                ex_str = mult_m.group(0)
                matched_excerpts.add(ex_str)
                new_claims.append(
                    {
                        "id": f"CLM-DYN-{len(new_claims) + 1}",
                        "category": "Benchmark Substantiation",
                        "agent_id": "pm_agent",
                        "rule_id": "RULE-PM-02",
                        "severity": "auto_fix",
                        "status": "flagged",
                        "excerpt": ex_str,
                        "replacement": f"up to {ex_str} in verified internal benchmarks¹",
                        "issue": f"Unqualified performance multiplier ('{ex_str}') lacks benchmark methodology citation.",
                        "evidence": "PRD v2.4 Benchmark Substantiation Policy.",
                        "impact_summary": "Adds mandatory benchmark qualification and footnote.",
                        "blocking_workstream": "Technical Fact-Check Gate",
                    }
                )

        # 3. NDA & Customer Reference Check
        if "Apex Global Bank" in text:
            matched_excerpts.add("Apex Global Bank")
            new_claims.append(
                {
                    "id": f"CLM-DYN-{len(new_claims) + 1}",
                    "category": "NDA & Customer Reference",
                    "agent_id": "legal_agent",
                    "rule_id": "RULE-LG-01",
                    "severity": "hard_stop",
                    "status": "hard_stop",
                    "excerpt": "Apex Global Bank",
                    "replacement": "a leading Tier-1 Global Investment Bank",
                    "issue": "HARD STOP: 'Apex Global Bank' requires Strict Tier-2 NDA anonymization or signed Customer PR waiver.",
                    "evidence": "Customer Reference Registry #REF-2091.",
                    "impact_summary": "Halts named customer spotlight until anonymized or waived.",
                    "blocking_workstream": "Customer Reference Clearance",
                    "compromise_title": "Switch to Anonymized Tier-1 Bank Summary",
                }
            )

        # 4. Commercial Budget, Capacity & Schedule Check
        extracted_nums = self._extract_deterministic_scope_numbers(text)
        alloc_budget = self.scenario_meta["allocated_budget"]
        cap_fte = self.scenario_meta["team_capacity_fte"]
        target_days = self.scenario_meta["target_launch_days"]

        spend_over = bool(
            extracted_nums["spend"] and int(extracted_nums["spend"]) > alloc_budget
        )
        fte_over = bool(
            extracted_nums["fte"] and float(extracted_nums["fte"]) > cap_fte
        )
        days_over = bool(
            extracted_nums["days"] and int(extracted_nums["days"]) > target_days
        )

        if (
            "$82,000" in text
            or "mainframe" in text.lower()
            or spend_over
            or fte_over
            or days_over
        ):
            spend_val = int(extracted_nums["spend"] or 82000)
            excerpt_str = (
                "$82,000"
                if "$82,000" in text
                else (
                    f"${spend_val:,}"
                    if f"${spend_val:,}" in text
                    else "mainframe"
                )
            )
            safe_budget = int(round(alloc_budget * 0.9))
            matched_excerpts.add(excerpt_str)
            new_claims.append(
                {
                    "id": f"CLM-DYN-{len(new_claims) + 1}",
                    "category": "Budget, Capacity & Schedule Feasibility",
                    "agent_id": "commercial_agent",
                    "rule_id": "RULE-CM-01",
                    "severity": "hard_stop",
                    "status": "hard_stop",
                    "excerpt": excerpt_str,
                    "replacement": f"${safe_budget:,} (phasing Wave-2 custom scope to next quarter)",
                    "issue": (
                        f"HARD STOP: Projected scope (${spend_val:,}) exceeds ${alloc_budget:,} allocated budget "
                        "or breaches FTE/schedule envelope."
                    ),
                    "evidence": "Deterministic PSO Rate Card & Capacity Envelope.",
                    "impact_summary": f"Phasing Wave-2 scope brings spend to ${safe_budget:,} within target window.",
                    "blocking_workstream": "PSO Delivery & Budget",
                    "compromise_title": f"Phase Wave-2 Custom Scope (${safe_budget:,})",
                }
            )

        # 5. Evaluate all enabled Custom / Imported Policy Pack Rules from SQLite
        for pack in self.policy_packs:
            for r in pack.get("rules", []):
                if not r.get("enabled", True):
                    continue
                if not r["id"].startswith("RULE-CUST-"):
                    continue
                ft = r.get("forbidden_term", "")
                if ft and ft in text and ft not in matched_excerpts:
                    matched_excerpts.add(ft)
                    new_claims.append(
                        {
                            "id": f"CLM-CUST-{len(new_claims) + 1}",
                            "category": f"Custom Policy ({r['id']})",
                            "agent_id": r["agent_id"],
                            "rule_id": r["id"],
                            "severity": r["severity"],
                            "status": "hard_stop"
                            if r["severity"] == "hard_stop"
                            else "flagged",
                            "excerpt": ft,
                            "replacement": r.get("replacement_term")
                            or f"[Compliant with {r['id']}]",
                            "issue": f"Violates custom policy {r['id']}: {r['summary']}",
                            "evidence": r["constraint"],
                            "impact_summary": "Enforced by workspace Policy Pack rule.",
                            "blocking_workstream": "Custom Policy Gate",
                            "compromise_title": f"Apply {r['id']} Rewrite",
                        }
                    )

        self.claims = new_claims
        self.live_derivatives_override = None
        self._persist_active_project()
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Murph Claim Extractor",
            badge="SCAN",
            turn_type="scrub",
            message=f"Re-indexed document ({len(text)} chars): extracted {len(new_claims)} active claim nodes across 4 Role Agents.",
        )
        return self.get_state()

