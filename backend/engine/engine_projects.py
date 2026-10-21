"""Project, Workflow, Policy Pack Studio, Rate Card & Claim CRUD Mixin.

Provides Gemini model configuration (`configure_llm`), custom desktop
workflow creation (`create_custom_workflow`), scenario switching and
workspace reset (`switch_scenario`, `reset_workspace`), and full CRUD
operations for Projects, Policy Rules, PSO Rate Card SKUs, and Claims.
"""

from __future__ import annotations

import copy
import datetime
import json
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc
    from google3.experimental.users.efch.murph.backend.engine import engine_policies_and_rates
    from google3.experimental.users.efch.murph.backend.integrations import llm_client
    from google3.experimental.users.efch.murph.backend.seed import seed_data
    from google3.experimental.users.efch.murph.backend.storage import storage
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc
        from google3.experimental.users.efch.murph.backend.engine import engine_policies_and_rates
        from google3.experimental.users.efch.murph.backend.integrations import llm_client
        from google3.experimental.users.efch.murph.backend.seed import seed_data
        from google3.experimental.users.efch.murph.backend.storage import storage
    except ImportError:
        from backend.integrations import drive_adc  # type: ignore
        from backend.engine import engine_policies_and_rates  # type: ignore
        from backend.integrations import llm_client  # type: ignore
        from backend.seed import seed_data  # type: ignore
        from backend.storage import storage  # type: ignore

AGENTS = seed_data.AGENTS
PERSONAS = seed_data.PERSONAS
INITIAL_MEMORY_LOG = seed_data.INITIAL_MEMORY_LOG
INITIAL_USER_AGENTS = seed_data.INITIAL_USER_AGENTS
INITIAL_USER_FILES = seed_data.INITIAL_USER_FILES
INITIAL_A2A_MESSAGES = seed_data.INITIAL_A2A_MESSAGES
INITIAL_AGENT_TICKETS = seed_data.INITIAL_AGENT_TICKETS
PSO_RATE_CARD = seed_data.PSO_RATE_CARD
POLICY_PACKS = seed_data.POLICY_PACKS
SCENARIOS = seed_data.SCENARIOS
WHAT_IF_PRESETS = seed_data.WHAT_IF_PRESETS
_default_debate_turns = seed_data._default_debate_turns


class ProjectPolicyAndCrudMixin(
    engine_policies_and_rates.PolicyAndRateCardCrudMixin
):
    """Domain mixin for PreFlightEngine."""
    _sync_from_store: Any
    analyze_custom_document: Any
    create_agent_ticket: Any
    _resolve_reference_file_ids: Any
    reset_demo_tour_state: Any
    scenario_meta: Any
    # Type annotations for attributes provided by PreFlightEngine host class
    store: Any
    drive_adc: Any
    last_drive_results: dict[str, Any]
    llm_client: Any
    active_scenario_id: str
    workspace_tier: str
    active_environment: str
    auth_sessions: dict[str, dict[str, Any]]
    account_registry: dict[str, dict[str, Any]]
    file_environments: dict[str, str]
    current_user: dict[str, Any] | None
    user_agents: list[dict[str, Any]]
    user_files: list[dict[str, Any]]
    custom_workflows: list[dict[str, Any]]
    custom_file_descriptions: dict[str, str]
    a2a_messages: list[dict[str, Any]]
    agent_tickets: list[dict[str, Any]]
    scenarios: dict[str, dict[str, Any]]
    policy_packs: dict[str, dict[str, Any]]
    rate_card: dict[str, dict[str, Any]]
    claims_by_scenario: dict[str, list[dict[str, Any]]]
    debate_logs: dict[str, list[dict[str, Any]]]
    memory_log: list[dict[str, Any]]
    whatif_History: Any
    DEFAULT_FILE_ENVIRONMENTS: dict[str, str]

    def configure_llm(
        self, api_key: str = "", model: str = llm_client.DEFAULT_MODEL
    ) -> dict[str, Any]:
        """Sets or updates the Gemini API key and model at runtime and persists the model in SQLite."""
        self.llm_client.set_api_key(api_key=api_key, model=model)
        if api_key and api_key.strip():
            self.store.set_setting("gemini_api_key", api_key.strip())
        self.store.set_setting("llm_model", self.llm_client.model)
        mode_msg = (
            f"Live Gemini Multi-Agent Engine active ({self.llm_client.model} via {self.llm_client.get_status()['sdk_transport']})."
            if self.llm_client.is_live_enabled()
            else f"Switched active Gemini runtime model to {self.llm_client.model}."
        )
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Murph Orchestrator",
            badge="AI",
            turn_type="resolved",
            message=mode_msg,
        )
        return self.get_state()

    def create_custom_workflow(
        self,
        folder_name: str,
        description: str = "",
        wf_filename: str = "CUSTOM_WORKFLOW.wf",
        workflow_type: str = "scrub",
        prompt_text: str = "",
        selected_files: list[str] | None = None,
        target_popup_id: str = "136:468",
        tagged_users: list[str] | None = None,
        creator_user_id: str | None = None,
        creator_ldap: str = "",
        environment: str = "",
    ) -> dict[str, Any]:
        """Persists a newly created Agent Workflow Folder, tags users, and lets their Personal Agents settle it automatically before updating both creator & tagged users."""
        clean_folder = (
            folder_name.strip()
            or wf_filename.replace(".wf", "").replace("_", " ").strip()
            or "CUSTOM WORKFLOW"
        )
        files_list = [str(f).strip() for f in (selected_files or []) if str(f).strip()]
        raw_tagged = [str(u).strip() for u in (tagged_users or []) if str(u).strip()]

        all_users = self.store.list_users()
        creator_user = None
        lookup_key = (creator_user_id or creator_ldap or "").strip()
        if lookup_key:
            creator_user = next(
                (u for u in all_users if u["id"] == lookup_key or u["ldap"].lower() == lookup_key.lower()),
                None,
            )
        if not creator_user and self.current_user:
            creator_user = next(
                (u for u in all_users if u["id"] == self.current_user["id"]),
                self.current_user,
            )
        if not creator_user:
            creator_user = all_users[0]

        clean_env = (environment or "").strip().lower()
        reg_env = str(self.account_registry.get(str(creator_user.get("ldap", "")).lower(), {}).get("environment", ""))
        if clean_env in ("cloud", "dm"):
            creator_env = clean_env
        elif clean_env.startswith(("user:", "user_")):  # self-registered account → stays on its own isolated desktop
            creator_env = clean_env if clean_env.startswith("user:") else f"user:{clean_env}"
        elif reg_env.startswith("user:") or str(creator_user.get("id", "")).startswith("user_"):
            creator_env = reg_env if reg_env.startswith("user:") else f"user:{creator_user['id']}"
        elif seed_data.is_dm_account_ldap(creator_user.get("ldap", "")) or creator_user.get("team_agent_id") == "brand_agent":
            creator_env = "dm"
        else:
            creator_env = self.active_environment if self.active_environment in ("cloud", "dm") else "cloud"

        ref_file_ids = self._resolve_reference_file_ids(
            files_list, creator_user=creator_user, creator_env=creator_env
        )

        ticket_req_summary = (
            prompt_text.strip()
            or description.strip()
            or (
                f"Automated '{workflow_type}' workflow '{clean_folder}' over "
                f"{', '.join(files_list) if files_list else 'shared Blue Team Files'}."
            )
        )
        self.create_agent_ticket(
            title=f"[WORKFLOW] {clean_folder} ({wf_filename.strip() or 'CUSTOM_WORKFLOW.wf'})",
            request_summary=ticket_req_summary,
            reference_file_ids=ref_file_ids,
            target_user_ids=raw_tagged,
            user_id=creator_user["id"],
        )

        all_tickets = self.store.list_tickets()
        settled_ticket = all_tickets[0] if all_tickets else {}
        ticket_id = settled_ticket.get("id", "TKT-AUTO")
        participating_users = settled_ticket.get("participating_users", [])
        tagged_peers = [pu for pu in participating_users if pu.get("user_id") != creator_user["id"]]
        tagged_ldaps = [pu.get("ldap", "") for pu in tagged_peers if pu.get("ldap")]
        comp_prop = settled_ticket.get("compromise_proposal", {})
        comp_summary = comp_prop.get("compromise_summary", "")

        clean_desc = (
            description.strip()
            or (
                f"Tagged: {', '.join(u.split('@')[0] + '@' for u in tagged_ldaps)} · Agent Settled ({ticket_id})"
                if tagged_ldaps
                else f"{len(files_list) or 5} files · {workflow_type} · Settled ({ticket_id})"
            )
        )
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        wf_id = f"WF-CUST-{len(self.custom_workflows) + 1}-{datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S')}"
        popup_map = {
            "scrub": "136:468", "tickets": "136:730", "escalations": "136:417",
            "policies": "136:579", "deliverables": "136:521",
        }
        resolved_popup = (
            "136:730"
            if (raw_tagged or workflow_type == "tickets")
            else (target_popup_id or popup_map.get(workflow_type, "136:468"))
        )
        wf_obj = {
            "id": wf_id,
            "folder_name": clean_folder.upper(),
            "description": clean_desc,
            "wf_filename": wf_filename.strip() or "CUSTOM_WORKFLOW.wf",
            "workflow_type": workflow_type.strip() or "scrub",
            "prompt_text": prompt_text.strip(),
            "selected_files": files_list,
            "target_popup_id": resolved_popup,
            "badge": str(len(tagged_ldaps) or len(files_list) or 1),
            "environment": creator_env,
            "creator_env": creator_env,
            "shared_across_environments": creator_env in ("cloud", "dm") or bool(tagged_ldaps),
            "ticket_id": ticket_id,
            "ticket_status": settled_ticket.get("status", "compromise_reached"),
            "approvals": settled_ticket.get("approvals", {}),
            "settled_by_agents": True,
            "creator_user_id": creator_user["id"],
            "creator_ldap": creator_user["ldap"],
            "creator_name": creator_user["name"],
            "creator_agent_name": settled_ticket.get("requester_personal_agent_name", "Creator's Personal Agent"),
            "tagged_users": tagged_peers,
            "tagged_user_ldaps": tagged_ldaps,
            "explicit_tagged_ldaps": raw_tagged,
            "compromise_summary": comp_summary,
            "initial_creator_update": comp_prop.get("initial_creator_update", ""),
            "tagged_people_updates": comp_prop.get("tagged_people_updates", []),
            "created_at": now_str,
        }
        self.custom_workflows = [w for w in self.custom_workflows if w.get("folder_name", "").upper() != wf_obj["folder_name"]]
        self.custom_workflows.append(wf_obj)
        self.store.set_setting("custom_workflows", json.dumps(self.custom_workflows))
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Murph Workflow Engine",
            badge="SETTLED",
            turn_type="resolved",
            message=(
                f"Agents settled Workflow '{wf_obj['folder_name']}' ({ticket_id}) between "
                f"{creator_user['ldap']} and [{', '.join(tagged_ldaps) or 'peer agents'}], "
                f"and updated both the initial creator and tagged user(s): {comp_summary}"
            ),
        )
        return self.get_state()

    def delete_custom_workflow(
        self, folder_name: str, requester_ldap: str = "", requester_env: str = ""
    ) -> dict[str, Any]:
        """Deletes a custom workflow from SQLite if requested by its initial creator."""
        target_upper = (folder_name or "").strip().upper()
        if not target_upper:
            return self.get_state()
        matched = next(
            (w for w in self.custom_workflows if str(w.get("folder_name", "")).strip().upper() == target_upper),
            None,
        )
        if not matched:
            return self.get_state()
        w_env = str(matched.get("creator_env") or matched.get("environment") or "").lower()
        if w_env not in ("cloud", "dm"):
            w_env = (
                "dm"
                if seed_data.is_dm_account_ldap(matched.get("creator_ldap", ""))
                or matched.get("creator_user_id") == "user_brand"
                else "cloud"
            )
        req_env = (requester_env or "").strip().lower()
        req_ldap = (requester_ldap or "").strip().lower()
        creator_ldap = str(matched.get("creator_ldap", "")).strip().lower()
        if req_env in ("cloud", "dm") and req_env != w_env:
            if not (req_ldap and creator_ldap and req_ldap == creator_ldap):
                return self.get_state()
        self.custom_workflows = [
            w for w in self.custom_workflows if str(w.get("folder_name", "")).strip().upper() != target_upper
        ]
        self.store.set_setting("custom_workflows", json.dumps(self.custom_workflows))
        return self.get_state()

    # -------------------------------------------------------------------------
    # Project Workspace CRUD Management
    # -------------------------------------------------------------------------

    def switch_scenario(self, scenario_id: str) -> dict[str, Any]:
        """Switches the active project workspace (or resets if scenario_id matches a seed scenario and reset requested)."""
        if self.store.get_project(scenario_id) is None:
            scenario_id = self.store.list_projects_summary()[0]["id"]
        self.active_scenario_id = scenario_id
        self.store.set_setting("active_project_id", scenario_id)
        self._sync_from_store()
        return self.get_state()

    def reset_workspace(self, reset_all_seed_data: bool = False) -> dict[str, Any]:
        """Resets the current project (or entire database) to clean seed defaults."""
        if reset_all_seed_data or self.active_scenario_id in SCENARIOS:
            if reset_all_seed_data:
                initial_debates = {k: _default_debate_turns() for k in SCENARIOS}
                self.store.reset_all(
                    personas=PERSONAS,
                    policy_packs=POLICY_PACKS,
                    rate_card=PSO_RATE_CARD,
                    scenarios=SCENARIOS,
                    initial_memory=INITIAL_MEMORY_LOG,
                    initial_debates=initial_debates,
                    initial_agents=INITIAL_USER_AGENTS,
                    initial_files=INITIAL_USER_FILES,
                    initial_a2a=INITIAL_A2A_MESSAGES,
                    initial_tickets=INITIAL_AGENT_TICKETS,
                )
                self.store.set_setting("custom_workflows", "[]")
                self.store.set_setting("custom_file_descriptions", "{}")
                self.store.set_setting("active_environment", "cloud")
                self.store.set_setting(
                    "auth_sessions",
                    json.dumps(
                        {
                            "cloud": {"email": "", "name": "", "authenticated": False},
                            "dm": {"email": "", "name": "", "authenticated": False},
                        }
                    ),
                )
                self.store.set_setting("account_registry", "{}")
                self.store.set_setting("file_environments", json.dumps(self.DEFAULT_FILE_ENVIRONMENTS))
                self.reset_demo_tour_state()
            else:
                seed_sc = copy.deepcopy(SCENARIOS[self.active_scenario_id])
                self.store.save_project(
                    {
                        "id": seed_sc["id"],
                        "name": seed_sc["name"],
                        "subtitle": seed_sc["subtitle"],
                        "workspace_mode": seed_sc["workspace_mode"],
                        "allocated_budget": seed_sc["allocated_budget"],
                        "tolerance_limit": seed_sc["tolerance_limit"],
                        "target_launch_days": seed_sc["target_launch_days"],
                        "team_capacity_fte": seed_sc["team_capacity_fte"],
                        "document_title": seed_sc["document_title"],
                        "document_text": seed_sc["document_text"],
                        "custom_whatif_note": None,
                        "live_derivatives_override": None,
                        "updated_at": datetime.datetime.now(
                            datetime.timezone.utc
                        ).strftime("%Y-%m-%d %H:%M UTC"),
                    }
                )
                self.store.replace_claims(seed_sc["id"], seed_sc["claims"])
            self._sync_from_store()
            return self.get_state()

        # For a user-created project, re-run the multi-agent scrub on its document
        return self.analyze_custom_document(self.document_text)


    def create_project(
        self,
        name: str,
        subtitle: str = "",
        workspace_mode: str = "Collaborative Workspace",
        allocated_budget: int = 60000,
        tolerance_limit: int | None = None,
        target_launch_days: int = 18,
        team_capacity_fte: float = 4.0,
        document_title: str = "",
        document_text: str = "",
    ) -> dict[str, Any]:
        """Creates a new persistent project workspace in SQLite and runs the 4-Agent Scrub on its document."""
        clean_name = name.strip() or "Untitled Cloud Launch Project"
        slug = re.sub(r"[^a-z0-9]+", "_", clean_name.lower()).strip("_")[:32]
        ts_suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%H%M%S")
        project_id = f"proj_{slug}_{ts_suffix}"

        alloc = max(1000, int(allocated_budget))
        tol = int(tolerance_limit) if tolerance_limit is not None else int(round(alloc * 1.1))
        days = max(1, int(target_launch_days))
        fte = max(0.5, float(team_capacity_fte))
        doc_title = document_title.strip() or clean_name
        doc_body = (
            document_text.strip()
            if document_text.strip()
            else (
                f"Headline: {clean_name} on Google Cloud\n\n"
                "1. Product & Launch Summary:\n"
                "Describe product capabilities, regional availability (GA vs. Public Preview), and benchmark metrics.\n\n"
                "2. Customer Proof & Legal Substantiation:\n"
                "Include customer case studies, NDA status, and SLA commitments.\n\n"
                "3. Delivery Scope & Commercial Resource Plan:\n"
                f"Estimated spend: ${int(alloc * 0.9):,}; requires {max(1.0, round(fte - 0.5, 1))} PSO FTEs over {max(1, days - 2)} business days."
            )
        )
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        self.store.save_project(
            {
                "id": project_id,
                "name": clean_name,
                "subtitle": subtitle.strip() or "Custom Cross-Functional Launch & Deal Workspace",
                "workspace_mode": workspace_mode.strip() or "Collaborative Workspace",
                "allocated_budget": alloc,
                "tolerance_limit": tol,
                "target_launch_days": days,
                "team_capacity_fte": fte,
                "document_title": doc_title,
                "document_text": doc_body,
                "custom_whatif_note": None,
                "live_derivatives_override": None,
                "updated_at": now_str,
            }
        )
        self.active_scenario_id = project_id
        self.store.set_setting("active_project_id", project_id)
        self._sync_from_store()
        self._append_turn(
            agent_id="pm_agent",
            agent_name="Murph Workspace Manager",
            badge="NEW",
            turn_type="resolved",
            message=(
                f"Created persistent workspace '{clean_name}' "
                f"(Budget: ${alloc:,}, Capacity: {fte} FTE, Target Window: {days}d)."
            ),
        )
        return self.analyze_custom_document(doc_body)

    def update_project_settings(
        self,
        name: str | None = None,
        subtitle: str | None = None,
        allocated_budget: int | None = None,
        tolerance_limit: int | None = None,
        target_launch_days: int | None = None,
        team_capacity_fte: float | None = None,
        document_title: str | None = None,
    ) -> dict[str, Any]:
        """Updates the active project's budget envelope, FTE capacity, target launch window, and metadata."""
        if name is not None and name.strip():
            self.scenario_meta["name"] = name.strip()
        if subtitle is not None and subtitle.strip():
            self.scenario_meta["subtitle"] = subtitle.strip()
        if document_title is not None and document_title.strip():
            self.scenario_meta["document_title"] = document_title.strip()
        if allocated_budget is not None and int(allocated_budget) > 0:
            self.scenario_meta["allocated_budget"] = int(allocated_budget)
            if tolerance_limit is None:
                self.scenario_meta["tolerance_limit"] = int(
                    round(int(allocated_budget) * 1.1)
                )
        if tolerance_limit is not None and int(tolerance_limit) > 0:
            self.scenario_meta["tolerance_limit"] = int(tolerance_limit)
        if target_launch_days is not None and int(target_launch_days) > 0:
            self.scenario_meta["target_launch_days"] = int(target_launch_days)
        if team_capacity_fte is not None and float(team_capacity_fte) > 0:
            self.scenario_meta["team_capacity_fte"] = float(team_capacity_fte)

        self._persist_active_project()
        self._append_turn(
            agent_id="commercial_agent",
            agent_name="Commercial & Delivery Agent",
            badge="ENV",
            turn_type="sim",
            message=(
                f"Updated project envelope: Budget=${self.scenario_meta['allocated_budget']:,} "
                f"(Tolerance=${self.scenario_meta['tolerance_limit']:,}), "
                f"Capacity={self.scenario_meta['team_capacity_fte']} FTE, "
                f"Target Window={self.scenario_meta['target_launch_days']}d."
            ),
        )
        return self.get_state()

    def delete_project(self, project_id: str | None = None) -> dict[str, Any]:
        """Deletes a project from SQLite and switches to the first remaining project."""
        target_id = project_id or self.active_scenario_id
        deleted = self.store.delete_project(target_id)
        if deleted:
            remaining = self.store.list_projects_summary()
            self.active_scenario_id = remaining[0]["id"]
            self.store.set_setting("active_project_id", self.active_scenario_id)
            self._sync_from_store()
        return self.get_state()

    def toggle_workspace_tier(self, tier: str) -> dict[str, Any]:
        if tier in ("collaborative", "personal"):
            self.workspace_tier = tier
            self.store.set_setting("workspace_tier", tier)
        return self.get_state()

