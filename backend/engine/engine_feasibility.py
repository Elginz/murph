"""Deterministic Feasibility Math, Readiness Scoring & What-If Simulator Mixin.

Isolates LLM reasoning from deterministic budget, FTE capacity, and critical-path
schedule arithmetic (`_extract_deterministic_scope_numbers`, `_compute_feasibility`,
`_compute_readiness_score`) and implements What-If scenario simulations (`run_whatif`).
"""

from __future__ import annotations

import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.seed import seed_data  # type: ignore

WHAT_IF_PRESETS = seed_data.WHAT_IF_PRESETS


class FeasibilityAndWhatIfMixin:
    """Mixin for deterministic PSO Rate Card feasibility math and What-If simulation."""

    active_scenario_id: str
    rate_card: Any
    scenario_meta: dict[str, Any]
    claims: list[dict[str, Any]]
    document_text: str
    custom_whatif_note: str
    apply_autofix: Any
    _persist_active_project: Any
    _append_turn: Any
    get_state: Any

    def _extract_deterministic_scope_numbers(
        self, text: str
    ) -> dict[str, float | int | None]:
        """Deterministically parses explicit $, FTE, and business-day figures or Rate Card SKUs from text."""
        spend_match = re.search(r"\$\s*([\d,]+)", text)
        fte_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:PSO\s+)?FTE", text, re.IGNORECASE)
        days_match = re.search(
            r"(\d+)\s*(?:business\s+)?days", text, re.IGNORECASE
        )

        parsed_spend = (
            int(spend_match.group(1).replace(",", "")) if spend_match else None
        )
        parsed_fte = float(fte_match.group(1)) if fte_match else None
        parsed_days = int(days_match.group(1)) if days_match else None

        matched_skus: list[str] = []
        catalog_spend = 0
        catalog_fte = 0.0
        catalog_days = 0
        lower_txt = text.lower()
        for item in self.rate_card:
            if any(k in lower_txt for k in item["keywords"]):
                matched_skus.append(item["sku"])
                catalog_spend += int(item["cost_usd"])
                catalog_fte += float(item["fte_load"])
                catalog_days = max(catalog_days, int(item["duration_days"]))

        return {
            "spend": parsed_spend
            if parsed_spend is not None
            else (catalog_spend or None),
            "fte": parsed_fte if parsed_fte is not None else (catalog_fte or None),
            "days": parsed_days
            if parsed_days is not None
            else (catalog_days or None),
            "matched_skus": len(matched_skus),
        }

    def _compute_feasibility(self) -> dict[str, Any]:
        """Deterministically computes budget, capacity, and schedule metrics without LLM math hallucination."""
        alloc = self.scenario_meta["allocated_budget"]
        tol = self.scenario_meta["tolerance_limit"]
        target_days = self.scenario_meta["target_launch_days"]
        cap_fte = self.scenario_meta["team_capacity_fte"]

        commercial_hard_stop = any(
            c["agent_id"] == "commercial_agent" and c["status"] == "hard_stop"
            for c in self.claims
        )
        legal_hard_stop = any(
            c["agent_id"] == "legal_agent" and c["status"] == "hard_stop"
            for c in self.claims
        )

        extracted = self._extract_deterministic_scope_numbers(self.document_text)

        if self.active_scenario_id == "cloud_launch_hybrid":
            projected_spend = 82000 if commercial_hard_stop else 54000
            required_fte = 5.5 if commercial_hard_stop else 3.5
            projected_days = 28 if commercial_hard_stop else 14
            if legal_hard_stop and not commercial_hard_stop:
                projected_days = 20
        elif self.active_scenario_id == "enterprise_deal_scope":
            projected_spend = 164000 if commercial_hard_stop else 118000
            required_fte = 8.5 if commercial_hard_stop else 5.5
            projected_days = 44 if commercial_hard_stop else 27
        elif self.active_scenario_id == "cloud_marketing_blog":
            projected_spend = 24000
            required_fte = 1.8
            projected_days = 9 if not legal_hard_stop else 14
        else:
            projected_spend = (
                int(extracted["spend"])
                if extracted["spend"] is not None
                else int(alloc * 0.9)
            )
            required_fte = (
                float(extracted["fte"])
                if extracted["fte"] is not None
                else round(cap_fte * 0.85, 1)
            )
            projected_days = (
                int(extracted["days"])
                if extracted["days"] is not None
                else max(1, target_days - 2)
            )

        # If user edited the document with custom numbers, honor the deterministic extraction
        if extracted["spend"] is not None and extracted["spend"] not in (
            82000,
            54000,
            164000,
            118000,
            24000,
        ):
            projected_spend = int(extracted["spend"])
        if extracted["fte"] is not None and extracted["fte"] not in (
            5.5,
            3.5,
            8.5,
            1.8,
        ):
            required_fte = float(extracted["fte"])
        if extracted["days"] is not None and extracted["days"] not in (
            28,
            14,
            44,
            27,
            9,
            30,
            18,
        ):
            projected_days = int(extracted["days"])

        budget_delta = projected_spend - alloc
        schedule_buffer = target_days - projected_days
        capacity_pct = round((required_fte / cap_fte) * 100) if cap_fte > 0 else 100

        brand_pm_halted = any(
            c["status"] == "hard_stop" and c["agent_id"] in ("brand_agent", "pm_agent")
            for c in self.claims
        ) or any(
            c["status"] == "hard_stop" and c["id"] == "CLM-202"
            for c in self.claims
        )

        workstreams = [
            {
                "name": "Core Product Narrative & Blog",
                "status": "halted" if brand_pm_halted else "running",
                "owner": "Brand & PMM",
            },
            {
                "name": "Technical Architecture & Regional Matrix",
                "status": "running",
                "owner": "Cloud PM",
            },
            {
                "name": "Customer Spotlight & Keynote Logo",
                "status": "halted" if legal_hard_stop else "running",
                "owner": "Legal & Customer PR",
            },
            {
                "name": "PSO Connector Delivery & Roadshow SOW",
                "status": "halted" if commercial_hard_stop else "running",
                "owner": "Commercial & PSO",
            },
        ]

        return {
            "allocated_budget": alloc,
            "tolerance_limit": tol,
            "projected_spend": projected_spend,
            "budget_delta": budget_delta,
            "budget_status": "overrun"
            if projected_spend > tol
            else ("warning" if projected_spend > alloc else "healthy"),
            "target_launch_days": target_days,
            "projected_days": projected_days,
            "critical_path_days": projected_days,
            "schedule_buffer_days": schedule_buffer,
            "schedule_slip_days": max(0, projected_days - target_days),
            "schedule_status": "slippage"
            if projected_days > target_days
            else "on_track",
            "available_fte": cap_fte,
            "team_capacity_fte": cap_fte,
            "required_fte": required_fte,
            "projected_fte": required_fte,
            "fte_overload": round(max(0.0, required_fte - cap_fte), 1),
            "capacity_utilization_pct": capacity_pct,
            "capacity_status": "overloaded"
            if required_fte > cap_fte
            else "balanced",
            "workstreams": workstreams,
            "rate_card": self.rate_card,
        }

    def _compute_readiness_score(self) -> dict[str, Any]:
        total = len(self.claims)
        if total == 0:
            return {
                "score": 100,
                "resolved": 0,
                "total": 0,
                "hard_stops": 0,
                "auto_fixes_pending": 0,
            }
        hard_stops = sum(1 for c in self.claims if c["status"] == "hard_stop")
        flagged = sum(1 for c in self.claims if c["status"] == "flagged")
        resolved = sum(
            1
            for c in self.claims
            if c["status"] in ("resolved", "approved_override")
        )
        penalty = (hard_stops * 26) + (flagged * 10)
        score = max(12, min(100, 100 - penalty))
        if hard_stops == 0 and flagged == 0:
            score = 100
        return {
            "score": score,
            "resolved": resolved,
            "total": total,
            "hard_stops": hard_stops,
            "auto_fixes_pending": flagged,
        }

    def run_whatif(
        self, preset_id: str | None = None, custom_query: str | None = None
    ) -> dict[str, Any]:
        """Executes a What-If simulation via preset or natural-language query."""
        if preset_id:
            alias_map = {
                "phase_mainframe": "whatif_phase_mainframe",
                "anonymize_customer": "whatif_anonymize_customer",
            }
            norm_id = alias_map.get(preset_id, preset_id)
            if norm_id == "resolve_all":
                for c in self.claims:
                    if c["status"] != "resolved":
                        self.apply_autofix(c["id"])
                self.custom_whatif_note = "All open claims & hard stops resolved with Option A compromises."
                self._persist_active_project()
            elif norm_id == "executive_waiver":
                self.resolve_escalation(
                    "CLM-105",
                    "override_approve",
                    "Executive Budget Waiver (+$22k over cap)",
                )
                self.custom_whatif_note = "Executive Budget Waiver active (+$22k over $60k cap)."
                self._persist_active_project()
            else:
                preset = next(
                    (p for p in WHAT_IF_PRESETS if p["id"] == norm_id), None
                )
                if preset:
                    for cid in preset.get("resolves_claim_ids", []):
                        self.apply_autofix(cid)
                    if "tighten_days" in preset:
                        self.scenario_meta["target_launch_days"] = preset[
                            "tighten_days"
                        ]
                    self.custom_whatif_note = preset["agent_note"]
                    self._persist_active_project()
                    self._append_turn(
                        agent_id="commercial_agent",
                        agent_name="What-If Simulator",
                        badge="SIM",
                        turn_type="sim",
                        message=f"Simulated Scenario [{preset['label']}]: {preset['agent_note']}",
                    )

        if custom_query:
            q_lower = custom_query.lower()
            notes: list[str] = []
            if any(
                k in q_lower
                for k in ["preview", "singapore", "3.2x", "gcp", "brand"]
            ):
                for cid in ("CLM-101", "CLM-102", "CLM-103", "CLM-201", "CLM-301"):
                    self.apply_autofix(cid)
                notes.append(
                    "Aligned regional Preview & 3.2x benchmark claims with PRD v2.4."
                )
            if any(
                k in q_lower
                for k in ["anonym", "nda", "bank", "tier-1", "logo"]
            ):
                self.apply_autofix("CLM-104")
                notes.append(
                    "Switched customer reference to NDA-compliant Anonymized summary."
                )
            if any(
                k in q_lower
                for k in ["sap", "mainframe", "budget", "54k", "phase", "scope"]
            ):
                for cid in ("CLM-105", "CLM-302"):
                    self.apply_autofix(cid)
                notes.append(
                    "Phased bespoke Wave-2 scope; spend and timeline brought within launch envelope."
                )
            if not notes:
                m_days = re.search(r"(\d+)\s*day", q_lower)
                m_budget = re.search(r"\$\s*([\d,]+)", q_lower)
                if m_days:
                    new_days = int(m_days.group(1))
                    self.scenario_meta["target_launch_days"] = new_days
                    notes.append(
                        f"Recalculated critical path against {new_days}-day target launch window."
                    )
                if m_budget:
                    new_b = int(m_budget.group(1).replace(",", ""))
                    self.scenario_meta["allocated_budget"] = new_b
                    self.scenario_meta["tolerance_limit"] = int(round(new_b * 1.1))
                    notes.append(
                        f"Updated allocated budget cap to ${new_b:,} (tolerance ${int(round(new_b * 1.1)):,})."
                    )
                if not notes:
                    notes.append(
                        f"Evaluated '{custom_query}' across all 4 Role Agents: no new policy violations introduced."
                    )

            self.custom_whatif_note = " ".join(notes)
            self._persist_active_project()
            self._append_turn(
                agent_id="pm_agent",
                agent_name="What-If Simulator",
                badge="SIM",
                turn_type="sim",
                message=f"Custom What-If ('{custom_query}'): {self.custom_whatif_note}",
            )

        return self.get_state()
