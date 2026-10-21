"""Policy Pack, PSO Rate Card & Claim Graph CRUD Mixin.

Provides SQLite-backed CRUD operations for:
- Policy Pack rules (`add_custom_policy_rule`, `toggle_policy_rule`, `delete_policy_rule`, `import_policy_document`)
- PSO Rate Card SKUs (`upsert_rate_card_sku`, `delete_rate_card_sku`)
- Claim Graph nodes (`update_claim`, `add_manual_claim`, `delete_claim`)
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS


class PolicyAndRateCardCrudMixin:
    """Mixin for Policy Pack rules, PSO Rate Card SKUs, and Claim Graph CRUD."""

    store: Any
    policy_packs: list[dict[str, Any]]
    rate_card: list[dict[str, Any]]
    document_text: str
    claims: list[dict[str, Any]]
    _persist_active_project: Any
    _append_turn: Any
    get_state: Any

    def add_custom_policy_rule(
        self,
        agent_id: str,
        summary: str,
        constraint: str,
        forbidden_term: str = "",
        replacement_term: str = "",
        severity: str = "auto_fix",
    ) -> dict[str, Any]:
        """Adds a new user-defined rule to the specified agent's Policy Pack in SQLite and re-audits the document."""
        pack = next(
            (p for p in self.policy_packs if p["agent_id"] == agent_id),
            self.policy_packs[0],
        )
        all_rules_count = sum(len(p["rules"]) for p in self.policy_packs)
        new_rule_id = f"RULE-CUST-{all_rules_count + 1}"
        rule_obj = {
            "id": new_rule_id,
            "agent_id": agent_id,
            "summary": summary.strip(),
            "constraint": constraint.strip(),
            "forbidden_term": forbidden_term.strip(),
            "replacement_term": replacement_term.strip(),
            "severity": severity
            if severity in ("auto_fix", "hard_stop")
            else "auto_fix",
            "enabled": True,
        }
        self.store.add_policy_rule(pack["id"], rule_obj)
        self.policy_packs = self.store.get_policy_packs()

        if (
            rule_obj["forbidden_term"]
            and rule_obj["forbidden_term"] in self.document_text
        ):
            self.claims.append(
                {
                    "id": f"CLM-CUST-{len(self.claims) + 1}",
                    "category": f"Custom Policy ({new_rule_id})",
                    "agent_id": agent_id,
                    "rule_id": new_rule_id,
                    "severity": rule_obj["severity"],
                    "status": "hard_stop"
                    if rule_obj["severity"] == "hard_stop"
                    else "flagged",
                    "excerpt": rule_obj["forbidden_term"],
                    "replacement": rule_obj["replacement_term"]
                    or f"[Compliant with {new_rule_id}]",
                    "issue": f"Violates custom policy {new_rule_id}: {rule_obj['summary']}",
                    "evidence": f"Custom Policy Pack rule {new_rule_id}: {rule_obj['constraint']}",
                    "impact_summary": "Enforced dynamically across active draft.",
                    "blocking_workstream": "Custom Policy Gate",
                    "compromise_title": f"Apply {new_rule_id} Rewrite",
                }
            )
            self._persist_active_project()

        self._append_turn(
            agent_id=agent_id,
            agent_name="Murph Policy Registry",
            badge="RULE",
            turn_type="scrub",
            message=f"Added {new_rule_id} to {pack['title']}: '{summary}'. Re-evaluated active document.",
        )
        return self.get_state()

    def toggle_policy_rule(self, rule_id: str, enabled: bool) -> dict[str, Any]:
        """Enables or disables a Policy Pack rule in SQLite."""
        self.store.toggle_policy_rule(rule_id, enabled)
        self.policy_packs = self.store.get_policy_packs()
        return self.get_state()

    def delete_policy_rule(self, rule_id: str) -> dict[str, Any]:
        """Deletes a Policy Pack rule from SQLite."""
        self.store.delete_policy_rule(rule_id)
        self.policy_packs = self.store.get_policy_packs()
        return self.get_state()

    def import_policy_document(
        self,
        agent_id: str,
        policy_text: str,
        default_severity: str = "auto_fix",
    ) -> dict[str, Any]:
        """Parses a multi-line policy guide into structured rules in SQLite and scrubs the active document."""
        lines = [
            ln.strip(" -*\t")
            for ln in policy_text.splitlines()
            if ln.strip(" -*\t")
        ]
        added_count = 0
        for ln in lines:
            forbidden = ""
            replacement = ""
            summary = ln
            constraint = f"Imported from policy document ({agent_id})."
            if "->" in ln:
                parts = ln.split("|", 1)
                arrow_part = parts[0].strip()
                if len(parts) > 1:
                    summary = parts[1].strip()
                left_right = arrow_part.split("->", 1)
                forbidden = left_right[0].strip().strip("\"'")
                replacement = left_right[1].strip().strip("\"'")
                if summary == ln:
                    summary = f"Replace '{forbidden}' with '{replacement}'."
                constraint = (
                    f"Must use '{replacement}' instead of '{forbidden}'."
                )
            self.add_custom_policy_rule(
                agent_id=agent_id,
                summary=summary,
                constraint=constraint,
                forbidden_term=forbidden,
                replacement_term=replacement,
                severity=default_severity,
            )
            added_count += 1

        if added_count > 0:
            self._append_turn(
                agent_id=agent_id,
                agent_name="Murph Policy Ingestor",
                badge="PACK",
                turn_type="scrub",
                message=f"Bulk-ingested {added_count} policy rules into {agent_id} Policy Pack.",
            )
        return self.get_state()

    def upsert_rate_card_sku(
        self,
        sku: str,
        name: str,
        keywords: list[str] | str,
        cost_usd: int,
        fte_load: float,
        duration_days: int,
    ) -> dict[str, Any]:
        """Adds or updates a deterministic PSO Rate Card SKU in SQLite."""
        if isinstance(keywords, str):
            kw_list = [
                k.strip().lower() for k in keywords.split(",") if k.strip()
            ]
        else:
            kw_list = [
                str(k).strip().lower() for k in keywords if str(k).strip()
            ]
        clean_sku = (
            sku.strip().upper() or f"PSO-SKU-{len(self.rate_card) + 1}"
        )
        item = {
            "sku": clean_sku,
            "name": name.strip() or clean_sku,
            "keywords": kw_list or [clean_sku.lower()],
            "cost_usd": max(0, int(cost_usd)),
            "fte_load": max(0.1, float(fte_load)),
            "duration_days": max(1, int(duration_days)),
        }
        self.store.upsert_rate_card_item(item)
        self.rate_card = self.store.get_rate_card()
        self._append_turn(
            agent_id="commercial_agent",
            agent_name="Commercial & Delivery Agent",
            badge="RATE",
            turn_type="sim",
            message=f"Updated PSO Rate Card SKU {clean_sku} (${item['cost_usd']:,}, {item['fte_load']} FTE, {item['duration_days']}d).",
        )
        return self.get_state()

    def delete_rate_card_sku(self, sku: str) -> dict[str, Any]:
        """Removes a SKU from the PSO Rate Card in SQLite."""
        self.store.delete_rate_card_item(sku)
        self.rate_card = self.store.get_rate_card()
        return self.get_state()

    def update_claim(
        self,
        claim_id: str,
        excerpt: str | None = None,
        replacement: str | None = None,
        issue: str | None = None,
        severity: str | None = None,
    ) -> dict[str, Any]:
        """Updates a claim's proposed rewrite, excerpt, issue, or severity in SQLite."""
        for c in self.claims:
            if c["id"] == claim_id:
                if excerpt is not None and excerpt.strip():
                    c["excerpt"] = excerpt.strip()
                if replacement is not None and replacement.strip():
                    c["replacement"] = replacement.strip()
                if issue is not None and issue.strip():
                    c["issue"] = issue.strip()
                if severity in ("auto_fix", "hard_stop"):
                    c["severity"] = severity
                    if c["status"] in ("flagged", "hard_stop"):
                        c["status"] = (
                            "hard_stop"
                            if severity == "hard_stop"
                            else "flagged"
                        )
                break
        self._persist_active_project()
        return self.get_state()

    def add_manual_claim(
        self,
        category: str,
        agent_id: str,
        severity: str,
        excerpt: str,
        replacement: str,
        issue: str,
        evidence: str = "Manual Stakeholder Flag",
        blocking_workstream: str = "Cross-Functional Review",
    ) -> dict[str, Any]:
        """Adds a manual review claim/flag node to the active project's Claim Graph."""
        sev = severity if severity in ("auto_fix", "hard_stop") else "auto_fix"
        new_id = f"CLM-MAN-{len(self.claims) + 1}"
        self.claims.append(
            {
                "id": new_id,
                "category": category.strip() or "Manual Review Flag",
                "agent_id": agent_id
                if any(a["id"] == agent_id for a in AGENTS)
                else "pm_agent",
                "rule_id": "MANUAL-FLAG",
                "severity": sev,
                "status": "hard_stop" if sev == "hard_stop" else "flagged",
                "excerpt": excerpt.strip(),
                "replacement": replacement.strip() or excerpt.strip(),
                "issue": issue.strip() or "Flagged manually by reviewer.",
                "evidence": evidence.strip() or "Manual Stakeholder Review",
                "impact_summary": "Requires alignment prior to Stage 3 lock.",
                "blocking_workstream": blocking_workstream.strip()
                or "General Review",
                "compromise_title": f"Adopt Proposed Rewrite for {new_id}",
            }
        )
        self._persist_active_project()
        return self.get_state()

    def delete_claim(self, claim_id: str) -> dict[str, Any]:
        """Dismisses/deletes a claim node from the active project."""
        self.claims = [c for c in self.claims if c["id"] != claim_id]
        self._persist_active_project()
        return self.get_state()
