"""Stage 3 Deliverables Compiler & Markdown Export Mixin.

Compiles zero-drift launch derivative assets (`_compile_derivatives`) and
exports complete Markdown governance bundles (`export_deliverables_markdown`).
"""

from __future__ import annotations

from typing import Any


class DeliverablesCompilerMixin:
    """Mixin for compiling Stage 3 derivative assets and exporting Markdown."""

    active_scenario_id: str
    scenario_meta: dict[str, Any]
    document_text: str
    claims: list[dict[str, Any]]
    live_derivatives_override: dict[str, Any] | None
    get_state: Any

    def _compile_derivatives(
        self, feasibility: dict[str, Any], readiness: dict[str, Any]
    ) -> dict[str, Any]:
        """Compiles Stage 3 zero-drift derivative assets dynamically from the active project's state."""
        is_clean = (
            readiness["hard_stops"] == 0 and readiness["auto_fixes_pending"] == 0
        )
        status_tag = (
            "VERIFIED & GREENLIT"
            if is_clean
            else f"PENDING ({readiness['hard_stops']} Hard Stops, {readiness['auto_fixes_pending']} Drift Flags)"
        )

        sanitized_doc = self.document_text
        for c in self.claims:
            if c["status"] == "hard_stop" and c["excerpt"] in sanitized_doc:
                sanitized_doc = sanitized_doc.replace(
                    c["excerpt"],
                    f"[BLOCKED PENDING {c['rule_id']} SIGN-OFF: {c.get('compromise_title', c['category'])}]",
                )

        if (
            self.live_derivatives_override
            and self.live_derivatives_override.get("blog_post")
        ):
            blog_content = self.live_derivatives_override["blog_post"]
        elif (
            self.active_scenario_id == "cloud_launch_hybrid"
            and "Vertex AI" in self.document_text
        ):
            customer_label = (
                "a major global bank"
                if not any(
                    c["id"] in ("CLM-104", "CLM-DYN-3")
                    and c["status"] == "hard_stop"
                    for c in self.claims
                )
                else "[BLOCKED: Apex Global Bank Pending NDA Waiver]"
            )
            blog_content = (
                f"[STATUS: {status_tag}]\n\n"
                "Title: Introducing Google Cloud Vertex AI Agent Builder\n\n"
                "Google Cloud Vertex AI Agent Builder is now available in the US and Europe, "
                "with Singapore and voice encryption in Public Preview until Nov 15.\n\n"
                "Teams get 3.2x faster response times for daily workflows, backed by clear source citations.\n\n"
                f"Customer Results: On Google Cloud, {customer_label} cut compliance review time by 68% "
                "and launched our Standard SAP setup ($54k) in 14 days."
            )
        else:
            blog_content = (
                f"[STATUS: {status_tag}]\n"
                f"Document: {self.scenario_meta['document_title']}\n\n"
                f"{sanitized_doc}\n\n"
                "---\n"
                f"Checked across {len(self.claims)} launch items "
                f"(Readiness Score: {readiness['score']}/100)."
            )

        if (
            self.live_derivatives_override
            and self.live_derivatives_override.get("sales_faq")
        ):
            faq_content = self.live_derivatives_override["sales_faq"]
        elif self.claims:
            faq_lines: list[str] = []
            for c in self.claims:
                faq_lines.append(
                    f"Q: How should we talk about {c['category']}?\n"
                    f'A: [{c["status"].upper()}] Say: "{c["replacement"]}" '
                    f'(Instead of: "{c["excerpt"]}")'
                )
            faq_content = "\n\n".join(faq_lines)
        else:
            faq_content = (
                "All claims passed team checks with zero issues.\n"
                f"Approved Budget: ${feasibility['projected_spend']:,} / ${feasibility['allocated_budget']:,}."
            )

        audit_lines = (
            [
                f"- [{c['status'].upper()}] {c['category']}: "
                f"{c.get('resolution_method', 'Pending: ' + c['issue'])}"
                for c in self.claims
            ]
            if self.claims
            else ["- [CLEAN] All checks passed."]
        )

        return {
            "status_tag": status_tag,
            "is_clean": is_clean,
            "blog_post": {
                "title": "1. Launch Blog Post",
                "audience": "Customers & Press",
                "content": blog_content,
            },
            "exec_tracker": {
                "title": "2. Launch Budget & Timeline Summary",
                "audience": "Launch & Deal Leads",
                "content": (
                    f"Project: {self.scenario_meta['document_title']}\n"
                    f"Readiness: {readiness['score']}/100 ({status_tag})\n"
                    f"Budget: ${feasibility['projected_spend']:,} of ${feasibility['allocated_budget']:,} limit\n"
                    f"Team Size: {feasibility['required_fte']} of {feasibility['available_fte']} people\n"
                    f"Timeline: {feasibility['projected_days']} of {feasibility['target_launch_days']} days"
                ),
            },
            "sales_faq": {
                "title": "3. Sales Team FAQ",
                "audience": "Sales & Customer Teams",
                "content": faq_content,
            },
            "audit_receipt": {
                "title": "4. Approval Receipt",
                "audience": "Launch Sign-Off Log",
                "content": "\n".join(audit_lines),
            },
        }

    def export_deliverables_markdown(self) -> str:
        """Compiles a complete Markdown bundle of the project's harmonized document and Stage 3 deliverables."""
        state = self.get_state()
        meta = state["scenario_meta"]
        deriv = state["derivatives"]
        readiness = state["readiness"]
        feas = state["feasibility"]

        md = [
            f"# {meta['document_title']}",
            f"**Workspace:** {meta['name']} (`{meta['id']}`)  ",
            f"**Readiness Score:** {readiness['score']}/100 ({deriv['status_tag']})  ",
            f"**Budget:** ${feas['projected_spend']:,} / ${feas['allocated_budget']:,} ({feas['budget_status'].upper()}) | "
            f"**Capacity:** {feas['required_fte']} / {feas['available_fte']} FTE | "
            f"**Schedule:** {feas['projected_days']}d / {feas['target_launch_days']}d",
            "",
            "---",
            "## Harmonized Source Document",
            "",
            state["document_text"],
            "",
            "---",
            f"## {deriv['blog_post']['title']}",
            f"*{deriv['blog_post']['audience']}*",
            "",
            deriv["blog_post"]["content"],
            "",
            "---",
            f"## {deriv['exec_tracker']['title']}",
            f"*{deriv['exec_tracker']['audience']}*",
            "",
            "```text",
            deriv["exec_tracker"]["content"],
            "```",
            "",
            "---",
            f"## {deriv['sales_faq']['title']}",
            f"*{deriv['sales_faq']['audience']}*",
            "",
            deriv["sales_faq"]["content"],
            "",
            "---",
            f"## {deriv['audit_receipt']['title']}",
            f"*{deriv['audit_receipt']['audience']}*",
            "",
            deriv["audit_receipt"]["content"],
            "",
        ]
        return "\n".join(md)
