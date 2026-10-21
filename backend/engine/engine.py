"""Core Orchestrator for Murph: Multi-Agent Unified Resource & Project Harmonizer.

Architecture Overview:
  `PreFlightEngine` is composed of 4 focused domain mixins backed by SQLite (`storage.py`):
  - `seed_data.py`: Default personas, agents, Cloud/DM files, tickets, rate cards, and policies.
  - `engine_auth.py` (`AuthAndFilesMixin`): User registration, dual-track Cloud/DM login,
    environment switching, user profile settings, file vault, and Google Drive ADC.
  - `engine_agents.py` (`AgentMeshAndTicketsMixin`): Cross-team A2A queries, 12-node
    All-to-All agent mesh, and bilateral shared-file ticket negotiation.
  - `engine_projects.py` (`ProjectPolicyAndCrudMixin`): LLM configuration, custom workflow
    creation, workspace reset, and Project / Policy / Rate Card / Claim CRUD.
  - `engine_analysis.py` (`FeasibilityAndAnalysisMixin`): Hybrid deterministic budget/FTE/schedule
    math, Stage-1 drift autofix, escalation governance, What-If simulator, and deliverable export.
"""

from __future__ import annotations

import copy
import datetime
import json
import re
from typing import Any, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc
    from google3.experimental.users.efch.murph.backend.engine import engine_agents
    from google3.experimental.users.efch.murph.backend.engine import engine_analysis
    from google3.experimental.users.efch.murph.backend.engine import engine_auth
    from google3.experimental.users.efch.murph.backend.engine import engine_projects
    from google3.experimental.users.efch.murph.backend.integrations import llm_client
    from google3.experimental.users.efch.murph.backend.seed import seed_data
    from google3.experimental.users.efch.murph.backend.storage import storage
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc
        from google3.experimental.users.efch.murph.backend.engine import engine_agents
        from google3.experimental.users.efch.murph.backend.engine import engine_analysis
        from google3.experimental.users.efch.murph.backend.engine import engine_auth
        from google3.experimental.users.efch.murph.backend.engine import engine_projects
        from google3.experimental.users.efch.murph.backend.integrations import llm_client
        from google3.experimental.users.efch.murph.backend.seed import seed_data
        from google3.experimental.users.efch.murph.backend.storage import storage
    except ImportError:
        from backend.integrations import drive_adc  # type: ignore
        from backend.engine import engine_agents  # type: ignore
        from backend.engine import engine_analysis  # type: ignore
        from backend.engine import engine_auth  # type: ignore
        from backend.engine import engine_projects  # type: ignore
        from backend.integrations import llm_client  # type: ignore
        from backend.seed import seed_data  # type: ignore
        from backend.storage import storage  # type: ignore

# Re-export seed constants for backward compatibility with server.py & engine_test.py
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


class PreFlightEngine(
    engine_auth.AuthAndFilesMixin,
    engine_agents.AgentMeshAndTicketsMixin,
    engine_projects.ProjectPolicyAndCrudMixin,
    engine_analysis.FeasibilityAndAnalysisMixin,
):
    """Persistent, SQLite-backed orchestrator for Murph."""
    DEFAULT_FILE_ENVIRONMENTS: dict[str, str] = {
        "FILE-PM-101": "cloud",
        "FILE-LEGAL-102": "cloud",
        "FILE-DEAL-103": "cloud",
        "FILE-OWNER-105": "dm",
        "FILE-BRAND-104": "dm",
        # Desktop (frontend) names of the seeded Blue files, renamed with a `DEMO ` prefix on 2026-10-03.
        "DEMO PRODUCT PRD.md": "cloud",
        "DEMO NDA VAULT.md": "cloud",
        "PSO RATE CARD.csv": "cloud",  # backend knowledge file only; no desktop tile since 2026-10-03
        "DEMO LAUNCH BRIEF.md": "dm",
        "DEMO BRAND RULES.md": "dm",
        # Legacy (pre-rename) desktop names, kept so stale browser sessions keep resolving.
        "PRODUCT PRD.md": "cloud",
        "NDA VAULT.md": "cloud",
        "LAUNCH BRIEF.md": "dm",
        "BRAND RULES.md": "dm",
    }

    def __init__(self, db_path: str = ":memory:") -> None:
        self.store = storage.MurphStorage(db_path=db_path)
        self.drive_adc = drive_adc.GoogleDriveADCClient()
        self.last_drive_results: dict[str, Any] = {}
        initial_debates = {k: _default_debate_turns() for k in SCENARIOS}
        self.store.seed_defaults(
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
        raw_saved_model: str = self.store.get_setting(
            "llm_model", llm_client.DEFAULT_MODEL
        )
        saved_model: str = llm_client.normalize_gemini_model(raw_saved_model)
        if saved_model != raw_saved_model:
            self.store.set_setting("llm_model", saved_model)
        saved_key: str = self.store.get_setting("gemini_api_key", "")
        self.llm_client = llm_client.MurphLLMClient(
            api_key=saved_key or None,
            model=saved_model,
            allow_adc=(db_path != ":memory:"),
        )
        self.active_scenario_id: str = self.store.get_setting(
            "active_project_id", "cloud_launch_hybrid"
        )
        self.workspace_tier: str = self.store.get_setting(
            "workspace_tier", "collaborative"
        )
        self.active_environment: str = self.store.get_setting(
            "active_environment", "all"
        )
        self.auth_sessions: dict[str, dict[str, Any]] = {}
        self.account_registry: dict[str, dict[str, Any]] = {}
        self.file_environments: dict[str, str] = {}
        self.current_user: dict[str, Any] | None = None
        self.user_agents: list[dict[str, Any]] = []
        self.user_files: list[dict[str, Any]] = []
        self.custom_workflows: list[dict[str, Any]] = []
        self.custom_file_descriptions: dict[str, str] = {}
        self.a2a_messages: list[dict[str, Any]] = []
        self.agent_tickets: list[dict[str, Any]] = []
        self.server_boot_id: str = f"boot_{uuid.uuid4().hex[:12]}"
        self.demo_tour_seen: dict[str, bool] = {"cloud": False, "dm": False}
        self._sync_from_store()

    def reset_demo_tour_state(self) -> None:
        """Resets the per-server-run onboarding tour state for built-in Cloud & DM demo accounts."""
        self.server_boot_id = f"boot_{uuid.uuid4().hex[:12]}"
        self.demo_tour_seen = {"cloud": False, "dm": False}

    def close(self) -> None:
        self.store.close()

    def _sync_from_store(self) -> None:
        """Loads the active project, claims, policy packs, rate card, agents, files, workflows, tickets, and logs from SQLite."""
        proj = self.store.get_project(self.active_scenario_id)
        if not proj:
            summaries = self.store.list_projects_summary()
            if summaries:
                self.active_scenario_id = summaries[0]["id"]
                self.store.set_setting("active_project_id", self.active_scenario_id)
                proj = self.store.get_project(self.active_scenario_id)
        assert proj is not None
        self.scenario_meta: dict[str, Any] = {
            "id": proj["id"],
            "name": proj["name"],
            "subtitle": proj["subtitle"],
            "workspace_mode": proj["workspace_mode"],
            "allocated_budget": int(proj["allocated_budget"]),
            "tolerance_limit": int(proj["tolerance_limit"]),
            "target_launch_days": int(proj["target_launch_days"]),
            "team_capacity_fte": float(proj["team_capacity_fte"]),
            "document_title": proj["document_title"],
            "updated_at": proj.get("updated_at", "2026-09-28 UTC"),
        }
        self.document_text: str = proj["document_text"]
        self.custom_whatif_note: str | None = proj.get("custom_whatif_note")
        self.live_derivatives_override: dict[str, str] | None = proj.get(
            "live_derivatives_override"
        )
        self.claims: list[dict[str, Any]] = self.store.get_claims(
            self.active_scenario_id
        )
        self.policy_packs: list[dict[str, Any]] = self.store.get_policy_packs()
        self.rate_card: list[dict[str, Any]] = self.store.get_rate_card()
        self.debate_log: list[dict[str, Any]] = self.store.get_debate_log(
            self.active_scenario_id
        )
        self.memory_log: list[dict[str, Any]] = self.store.get_memory_log()
        self.user_agents = self.store.list_user_agents()
        self.active_environment = self.store.get_setting(
            "active_environment", self.active_environment or "all"
        )
        default_auth_sessions = {
            "cloud": {"email": "", "name": "", "authenticated": False},
            "dm": {"email": "", "name": "", "authenticated": False},
        }
        try:
            raw_auth = self.store.get_setting("auth_sessions", "{}")
            parsed_auth = json.loads(raw_auth)
            if isinstance(parsed_auth, dict):
                default_auth_sessions.update(parsed_auth)
            self.auth_sessions = default_auth_sessions
        except Exception:
            self.auth_sessions = default_auth_sessions
        try:
            raw_reg = self.store.get_setting("account_registry", "{}")
            parsed_reg = json.loads(raw_reg)
            self.account_registry = (
                parsed_reg if isinstance(parsed_reg, dict) else {}
            )
        except Exception:
            self.account_registry = {}
        try:
            raw_fenv = self.store.get_setting("file_environments", "{}")
            parsed_fenv = json.loads(raw_fenv)
            merged_fenv = dict(self.DEFAULT_FILE_ENVIRONMENTS)
            if isinstance(parsed_fenv, dict):
                merged_fenv.update(parsed_fenv)
            self.file_environments = merged_fenv
        except Exception:
            self.file_environments = dict(self.DEFAULT_FILE_ENVIRONMENTS)
        try:
            raw_desc = self.store.get_setting("custom_file_descriptions", "{}")
            parsed_desc = json.loads(raw_desc)
            self.custom_file_descriptions = (
                parsed_desc if isinstance(parsed_desc, dict) else {}
            )
        except Exception:
            self.custom_file_descriptions = {}
        try:
            raw_wf = self.store.get_setting("custom_workflows", "[]")
            parsed_wf = json.loads(raw_wf)
            self.custom_workflows = (
                parsed_wf if isinstance(parsed_wf, list) else []
            )
        except Exception:
            self.custom_workflows = []

        raw_files = self.store.list_user_files()
        for rf in raw_files:
            desc = self.custom_file_descriptions.get(
                rf["id"]
            ) or self.custom_file_descriptions.get(rf["filename"], "")
            if desc:
                rf["description"] = desc
            env_tag = (
                self.file_environments.get(rf["id"])
                or self.file_environments.get(rf["filename"])
            )
            if not env_tag:
                reg_meta = self.account_registry.get(
                    str(rf.get("user_ldap", "")).lower()
                )
                if reg_meta and reg_meta.get("is_new_account"):
                    env_tag = f"user:{rf['user_id']}"
                elif rf.get("team_agent_id") == "brand_agent":
                    env_tag = "dm"
                else:
                    env_tag = "cloud"
            rf["environment"] = env_tag
        self.user_files = raw_files
        self.a2a_messages = self.store.get_a2a_messages()
        self.agent_tickets = self.store.list_tickets()

    def _get_environment_filtered_files(self) -> list[dict[str, Any]]:
        """Returns the files visible in the currently active environment ('cloud', 'dm', 'user:<id>', or 'all').

        Isolated `user:*` files are always included (like `user:*` workflows)
        because the backend keeps ONE global `active_environment` for every
        browser; the frontend filters `user_files` by the logged-in account key.
        """
        env = (self.active_environment or "all").strip()

        def _is_isolated(f: dict[str, Any]) -> bool:
            return str(f.get("environment", "")).startswith("user:") and (
                f.get("id") not in self.DEFAULT_FILE_ENVIRONMENTS
            )

        if env in ("cloud", "dm"):
            return [
                f
                for f in self.user_files
                if f.get("environment") == env or _is_isolated(f)
            ]
        if env.startswith("user:"):
            uid = env.split(":", 1)[1]
            return [
                f
                for f in self.user_files
                if (f.get("user_id") == uid and f.get("id") not in self.DEFAULT_FILE_ENVIRONMENTS)
                or _is_isolated(f)
            ]
        return self.user_files

    def _get_environment_filtered_workflows(self) -> list[dict[str, Any]]:
        """Returns custom workflows visible in the active environment; isolated `user:*` workflows are always included because the frontend enforces per-account visibility."""
        env = (self.active_environment or "all").strip()
        if env == "all":
            return self.custom_workflows
        return [
            w
            for w in self.custom_workflows
            if w.get("environment", "all") in (env, "all")
            or w.get("shared_across_environments")
            or str(w.get("environment", "")).startswith("user:")
        ]

    def _persist_active_project(self) -> None:
        """Persists the current project metadata, document text, and claims to SQLite."""
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        self.scenario_meta["updated_at"] = now_str
        self.store.save_project(
            {
                "id": self.active_scenario_id,
                "name": self.scenario_meta["name"],
                "subtitle": self.scenario_meta["subtitle"],
                "workspace_mode": self.scenario_meta["workspace_mode"],
                "allocated_budget": self.scenario_meta["allocated_budget"],
                "tolerance_limit": self.scenario_meta["tolerance_limit"],
                "target_launch_days": self.scenario_meta["target_launch_days"],
                "team_capacity_fte": self.scenario_meta["team_capacity_fte"],
                "document_title": self.scenario_meta["document_title"],
                "document_text": self.document_text,
                "custom_whatif_note": self.custom_whatif_note,
                "live_derivatives_override": self.live_derivatives_override,
                "updated_at": now_str,
            }
        )
        self.store.replace_claims(self.active_scenario_id, self.claims)

    def _append_turn(
        self,
        agent_id: str,
        agent_name: str,
        badge: str,
        turn_type: str,
        message: str,
    ) -> None:
        turn = {
            "id": f"TURN-{len(self.debate_log) + 1}",
            "agent_id": agent_id,
            "agent_name": agent_name,
            "badge": badge,
            "type": turn_type,
            "message": message,
        }
        self.debate_log.append(turn)
        self.store.append_debate_turn(self.active_scenario_id, turn)

    # -------------------------------------------------------------------------
    # Authentication, Account Creation & Personal/Team Agent Provisioning
    # -------------------------------------------------------------------------


    def get_state(self) -> dict[str, Any]:
        feasibility = self._compute_feasibility()
        readiness = self._compute_readiness_score()
        derivatives = self._compile_derivatives(feasibility, readiness)
        projects_list = self.store.list_projects_summary()
        dual_complete = bool(
            self.auth_sessions.get("cloud", {}).get("authenticated")
            and self.auth_sessions.get("dm", {}).get("authenticated")
        )
        return {
            "server_boot_id": self.server_boot_id,
            "demo_tour_seen": dict(self.demo_tour_seen),
            "active_scenario_id": self.active_scenario_id,
            "workspace_tier": self.workspace_tier,
            "current_user": self.current_user,
            "active_environment": self.active_environment,
            "auth_sessions": self.auth_sessions,
            "dual_auth_complete": dual_complete,
            "personas": self.store.list_users(),
            "llm_status": self.llm_client.get_status(),
            "adc_status": self.drive_adc.get_status(),
            "drive_results": self.last_drive_results,
            "scenarios": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "subtitle": p["subtitle"],
                    "allocated_budget": p["allocated_budget"],
                    "target_launch_days": p["target_launch_days"],
                    "team_capacity_fte": p["team_capacity_fte"],
                    "updated_at": p["updated_at"],
                }
                for p in projects_list
            ],
            "scenario_meta": self.scenario_meta,
            "agents": AGENTS,
            "user_agents": self.user_agents,
            "user_files": self._get_environment_filtered_files(),
            "all_user_files": self.user_files,
            "custom_workflows": self._get_environment_filtered_workflows(),
            "a2a_messages": self.a2a_messages,
            "agent_tickets": self.agent_tickets,
            "agent_mesh": self._build_all_to_all_agent_mesh(),
            "policy_packs": self.policy_packs,
            "document_text": self.document_text,
            "claims": self.claims,
            "feasibility": feasibility,
            "readiness": readiness,
            "debate_log": self.debate_log,
            "memory_log": self.memory_log,
            "whatif_presets": WHAT_IF_PRESETS,
            "custom_whatif_note": self.custom_whatif_note,
            "derivatives": derivatives,
            "persistence_mode": "SQLite Persistent DB"
            if self.store.db_path != ":memory:"
            else "SQLite In-Memory",
        }

