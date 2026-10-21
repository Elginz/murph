"""Governance, Project, Claim, Policy, Rate Card & Workflow POST Route Mixin.

Handles REST POST endpoints for projects, claims, escalations, memory, what-if,
document analysis, LLM config, custom workflows, policy packs, and rate cards.
"""

from __future__ import annotations

from typing import Any


class ServerGovernanceRoutesMixin:
    """Mixin for dispatching project, claim, policy, rate card, and workflow POST routes."""

    engine_instance: Any
    _send_json: Any

    def _dispatch_governance_post(
        self, path: str, body: dict[str, Any]
    ) -> bool:
        """Handles governance/project/workflow POST endpoints. Returns True if handled."""
        if path == "/api/scenario/switch":
            scenario_id = str(body.get("scenario_id", "cloud_launch_hybrid"))
            self._send_json(self.engine_instance.switch_scenario(scenario_id))
            return True

        if path == "/api/project/create":
            self._send_json(
                self.engine_instance.create_project(
                    name=str(body.get("name", "New Cloud Launch Project")),
                    subtitle=str(body.get("subtitle", "")),
                    workspace_mode=str(
                        body.get("workspace_mode", "Collaborative Workspace")
                    ),
                    allocated_budget=int(body.get("allocated_budget", 60000)),
                    tolerance_limit=int(body["tolerance_limit"])
                    if body.get("tolerance_limit")
                    else None,
                    target_launch_days=int(body.get("target_launch_days", 18)),
                    team_capacity_fte=float(
                        body.get("team_capacity_fte", 4.0)
                    ),
                    document_title=str(body.get("document_title", "")),
                    document_text=str(body.get("document_text", "")),
                )
            )
            return True

        if path == "/api/project/update":
            self._send_json(
                self.engine_instance.update_project_settings(
                    name=body.get("name"),
                    subtitle=body.get("subtitle"),
                    allocated_budget=int(body["allocated_budget"])
                    if body.get("allocated_budget")
                    else None,
                    tolerance_limit=int(body["tolerance_limit"])
                    if body.get("tolerance_limit")
                    else None,
                    target_launch_days=int(body["target_launch_days"])
                    if body.get("target_launch_days")
                    else None,
                    team_capacity_fte=float(body["team_capacity_fte"])
                    if body.get("team_capacity_fte")
                    else None,
                    document_title=body.get("document_title"),
                )
            )
            return True

        if path == "/api/project/delete":
            self._send_json(
                self.engine_instance.delete_project(
                    project_id=body.get("project_id")
                )
            )
            return True

        if path == "/api/project/reset":
            self._send_json(
                self.engine_instance.reset_workspace(
                    reset_all_seed_data=bool(body.get("reset_all", False))
                )
            )
            return True

        if path == "/api/workspace/tier":
            tier = str(body.get("tier", "collaborative"))
            self._send_json(self.engine_instance.toggle_workspace_tier(tier))
            return True

        if path == "/api/autofix":
            claim_id = body.get("claim_id")
            self._send_json(self.engine_instance.apply_autofix(claim_id))
            return True

        if path == "/api/claim/update":
            self._send_json(
                self.engine_instance.update_claim(
                    claim_id=str(body.get("claim_id", "")),
                    excerpt=body.get("excerpt"),
                    replacement=body.get("replacement"),
                    issue=body.get("issue"),
                    severity=body.get("severity"),
                )
            )
            return True

        if path == "/api/claim/add":
            self._send_json(
                self.engine_instance.add_manual_claim(
                    category=str(body.get("category", "Manual Review Flag")),
                    agent_id=str(body.get("agent_id", "pm_agent")),
                    severity=str(body.get("severity", "auto_fix")),
                    excerpt=str(body.get("excerpt", "")),
                    replacement=str(body.get("replacement", "")),
                    issue=str(body.get("issue", "")),
                    evidence=str(
                        body.get("evidence", "Manual Stakeholder Flag")
                    ),
                    blocking_workstream=str(
                        body.get(
                            "blocking_workstream", "Cross-Functional Review"
                        )
                    ),
                )
            )
            return True

        if path == "/api/claim/delete":
            self._send_json(
                self.engine_instance.delete_claim(str(body.get("claim_id", "")))
            )
            return True

        if path == "/api/escalate/decide":
            self._send_json(
                self.engine_instance.resolve_escalation(
                    claim_id=str(body.get("claim_id", "")),
                    action=str(body.get("action", "approve_compromise")),
                    stakeholder_comment=str(body.get("comment", "")),
                    promote_to_rule=bool(body.get("promote_to_rule", False)),
                )
            )
            return True

        if path == "/api/memory/promote":
            memory_id = str(body.get("memory_id", ""))
            self._send_json(self.engine_instance.promote_memory(memory_id))
            return True

        if path == "/api/whatif":
            self._send_json(
                self.engine_instance.run_whatif(
                    preset_id=body.get("preset_id"),
                    custom_query=body.get("custom_query"),
                )
            )
            return True

        if path == "/api/analyze":
            doc_text = str(body.get("document_text", ""))
            self._send_json(
                self.engine_instance.analyze_custom_document(doc_text)
            )
            return True

        if path == "/api/llm/configure":
            api_key = str(body.get("api_key", ""))
            model = str(body.get("model", "gemini-3.8-flash"))
            self._send_json(
                self.engine_instance.configure_llm(api_key=api_key, model=model)
            )
            return True

        if path == "/api/workflows/create":
            raw_files = body.get("selected_files")
            selected_files = (
                [str(x) for x in raw_files if str(x).strip()]
                if isinstance(raw_files, list)
                else None
            )
            raw_tagged = body.get("tagged_users") or body.get("target_user_ids")
            tagged_users = (
                [str(x) for x in raw_tagged if str(x).strip()]
                if isinstance(raw_tagged, list)
                else (
                    [
                        s.strip()
                        for s in str(raw_tagged).split(",")
                        if s.strip()
                    ]
                    if raw_tagged
                    else None
                )
            )
            self._send_json(
                self.engine_instance.create_custom_workflow(
                    folder_name=str(body.get("folder_name", "")),
                    description=str(body.get("description", "")),
                    wf_filename=str(
                        body.get("wf_filename", "CUSTOM_WORKFLOW.wf")
                    ),
                    workflow_type=str(body.get("workflow_type", "scrub")),
                    prompt_text=str(body.get("prompt_text") or body.get("prompt") or ""),
                    selected_files=selected_files,
                    target_popup_id=str(
                        body.get("target_popup_id", "136:468")
                    ),
                    tagged_users=tagged_users,
                    creator_user_id=str(body.get("creator_user_id", "")).strip()
                    or None,
                    environment=str(body.get("environment", "")).strip(),
                )
            )
            return True

        if path == "/api/workflows/delete":
            self._send_json(
                self.engine_instance.delete_custom_workflow(
                    folder_name=str(body.get("folder_name", "")),
                    requester_ldap=str(body.get("requester_ldap", "")),
                    requester_env=str(body.get("requester_env", "")),
                )
            )
            return True

        if path == "/api/policy/add_rule":
            self._send_json(
                self.engine_instance.add_custom_policy_rule(
                    agent_id=str(body.get("agent_id", "brand_agent")),
                    summary=str(body.get("summary", "")),
                    constraint=str(body.get("constraint", "")),
                    forbidden_term=str(body.get("forbidden_term", "")),
                    replacement_term=str(body.get("replacement_term", "")),
                    severity=str(body.get("severity", "auto_fix")),
                )
            )
            return True

        if path == "/api/policy/toggle_rule":
            self._send_json(
                self.engine_instance.toggle_policy_rule(
                    rule_id=str(body.get("rule_id", "")),
                    enabled=bool(body.get("enabled", True)),
                )
            )
            return True

        if path == "/api/policy/delete_rule":
            self._send_json(
                self.engine_instance.delete_policy_rule(
                    rule_id=str(body.get("rule_id", ""))
                )
            )
            return True

        if path == "/api/policy/import":
            self._send_json(
                self.engine_instance.import_policy_document(
                    agent_id=str(body.get("agent_id", "brand_agent")),
                    policy_text=str(body.get("policy_text", "")),
                    default_severity=str(
                        body.get("default_severity", "auto_fix")
                    ),
                )
            )
            return True

        if path == "/api/rate_card/upsert":
            self._send_json(
                self.engine_instance.upsert_rate_card_sku(
                    sku=str(body.get("sku", "")),
                    name=str(body.get("name", "")),
                    keywords=body.get("keywords", ""),
                    cost_usd=int(body.get("cost_usd", 25000)),
                    fte_load=float(body.get("fte_load", 2.0)),
                    duration_days=int(body.get("duration_days", 10)),
                )
            )
            return True

        if path == "/api/rate_card/delete":
            self._send_json(
                self.engine_instance.delete_rate_card_sku(
                    sku=str(body.get("sku", ""))
                )
            )
            return True

        return False
