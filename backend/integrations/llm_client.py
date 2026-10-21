"""Dual-transport Gemini Multi-Agent Client for Murph.

Supports:
1. Official `google-genai` SDK (`from google import genai`) when available in the runtime.
2. Direct HTTPS REST transport (`generativelanguage.googleapis.com/v1beta`) using standard library
   `urllib.request` so live Gemini structured-output calls work in bare Python environments without pip dependencies.
3. Concurrent execution across all 4 Role Agents (`asyncio` / `ThreadPoolExecutor`) with strict JSON Schema output.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import llm_agent_helpdesk
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import llm_agent_helpdesk
    except ImportError:
        from backend.integrations import llm_agent_helpdesk  # type: ignore

try:
    from google import genai  # type: ignore
    from google.genai import types as genai_types  # type: ignore

    HAS_GENAI_SDK = True
except ImportError:
    HAS_GENAI_SDK = False


DEFAULT_MODEL = "gemini-3.8-flash"

LEGACY_GEMINI_MODEL_MAP: dict[str, str] = {
    "gemini-2.5-flash": "gemini-3.8-flash",
    "gemini-2.5-pro": "gemini-3.1-pro-preview",
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.0-flash": "gemini-3.5-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-1.5-pro": "gemini-3.8-flash",
    "gemini-1.5-flash": "gemini-3.8-flash",
}

AVAILABLE_MODELS: list[dict[str, str]] = [
    {
        "id": "gemini-3.8-flash",
        "label": "GEMINI 3.8 FLASH · v3.8",
        "name": "Gemini 3.8 Flash",
        "badge": "AGENTIC FLASH",
        "latency": "18ms",
    },
    {
        "id": "gemini-3.1-pro-preview",
        "label": "GEMINI 3.1 PRO · PREVIEW",
        "name": "Gemini 3.1 Pro",
        "badge": "DEEP REASONING",
        "latency": "36ms",
    },
    {
        "id": "gemini-3.5-flash-lite",
        "label": "GEMINI 3.5 FLASH-LITE",
        "name": "Gemini 3.5 Flash-Lite",
        "badge": "LOW LATENCY",
        "latency": "11ms",
    },
    {
        "id": "gemini-3.5-flash",
        "label": "GEMINI 3.5 FLASH · v3.5",
        "name": "Gemini 3.5 Flash",
        "badge": "WORKHORSE",
        "latency": "21ms",
    },
]

_VALID_MODEL_IDS: set[str] = {m["id"] for m in AVAILABLE_MODELS}


def normalize_gemini_model(model: str | None) -> str:
    """Normalizes a Gemini model ID, auto-upgrading deprecated 2.5/2.0/1.5 IDs to Gemini 3.x."""
    raw = str(model or "").strip().lower()
    if not raw:
        return DEFAULT_MODEL
    if raw in LEGACY_GEMINI_MODEL_MAP:
        return LEGACY_GEMINI_MODEL_MAP[raw]
    if raw.startswith(("gemini-2.", "gemini-1.")):
        if "pro" in raw:
            return "gemini-3.1-pro-preview"
        if "lite" in raw:
            return "gemini-3.5-flash-lite"
        return DEFAULT_MODEL
    if raw in _VALID_MODEL_IDS or raw.startswith("gemini-3"):
        return raw
    return DEFAULT_MODEL


ROLE_AGENT_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": ["war_room_statement", "claims"],
    "properties": {
        "war_room_statement": {
            "type": "STRING",
            "description": "Concise 1-2 sentence summary from this Role Agent explaining what it checked and flagged.",
        },
        "claims": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": [
                    "category",
                    "rule_id",
                    "severity",
                    "excerpt",
                    "replacement",
                    "issue",
                    "evidence",
                    "impact_summary",
                    "blocking_workstream",
                ],
                "properties": {
                    "category": {"type": "STRING"},
                    "rule_id": {"type": "STRING"},
                    "severity": {
                        "type": "STRING",
                        "enum": ["auto_fix", "hard_stop"],
                    },
                    "excerpt": {
                        "type": "STRING",
                        "description": "Exact verbatim substring from the document_text that violates the rule.",
                    },
                    "replacement": {
                        "type": "STRING",
                        "description": "Policy-compliant drop-in replacement text.",
                    },
                    "issue": {"type": "STRING"},
                    "evidence": {"type": "STRING"},
                    "impact_summary": {"type": "STRING"},
                    "blocking_workstream": {"type": "STRING"},
                    "compromise_title": {"type": "STRING"},
                },
            },
        },
    },
}


MEDIATOR_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "negotiation_turns",
        "blog_post_content",
        "sales_faq_content",
    ],
    "properties": {
        "negotiation_turns": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["agent_id", "agent_name", "badge", "message"],
                "properties": {
                    "agent_id": {"type": "STRING"},
                    "agent_name": {"type": "STRING"},
                    "badge": {"type": "STRING"},
                    "message": {"type": "STRING"},
                },
            },
        },
        "blog_post_content": {"type": "STRING"},
        "sales_faq_content": {"type": "STRING"},
    },
}


class MurphLLMClient(llm_agent_helpdesk.HelpDeskAgentMixin):
    """Manages live Gemini API / Vertex AI structured-output calls for Murph's agents."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        allow_adc: bool = False,
    ) -> None:
        self._runtime_api_key: str | None = (api_key or "").strip() or None
        self.model: str = normalize_gemini_model(model)
        self.allow_adc: bool = allow_adc
        self.last_error: str | None = None
        self.total_live_calls: int = 0
        self._vertex_token: str = ""
        self._vertex_token_expiry: float = 0.0
        self._vertex_project: str = ""
        self._vertex_token_source: str = ""
        self._dotenv_key_cache: str | None = None

    @property
    def api_key(self) -> str:
        return (
            self._runtime_api_key
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or self._read_dotenv_api_key()
            or ""
        ).strip()

    def set_api_key(self, api_key: str | None = None, model: str | None = None) -> None:
        if api_key is not None and api_key.strip():
            self._runtime_api_key = api_key.strip()
        if model and model.strip():
            self.model = normalize_gemini_model(model)
        self.last_error = None

    def is_live_enabled(self) -> bool:
        return bool(self.api_key) or (self.allow_adc and self.has_vertex_auth())

    def get_status(self) -> dict[str, Any]:
        has_key = bool(self.api_key)
        transport = (
            "google-genai-sdk"
            if (HAS_GENAI_SDK and has_key)
            else ("gemini-rest-v1beta" if has_key else "vertex-ai-adc")
        )
        return {
            "live_enabled": self.is_live_enabled(),
            "sdk_transport": transport,
            "model": self.model,
            "available_models": AVAILABLE_MODELS,
            "total_live_calls": self.total_live_calls,
            "last_error": self.last_error,
        }

    def generate_structured_json(
        self,
        prompt: str,
        schema: dict[str, Any],
        system_instruction: str = "",
        timeout_sec: float = 18.0,
    ) -> dict[str, Any] | None:
        """Calls Gemini with structured JSON schema enforcement."""
        key = self.api_key
        if key and HAS_GENAI_SDK:
            try:
                client = genai.Client(api_key=key)
                full_prompt = (
                    f"{system_instruction}\n\n{prompt}"
                    if system_instruction
                    else prompt
                )
                cfg_kwargs: dict[str, Any] = {
                    "response_mime_type": "application/json",
                    "response_json_schema": schema,
                }
                if self.model not in ("gemini-3.8-flash", "gemini-3.5-flash-lite"):
                    cfg_kwargs["temperature"] = 0.1
                response = client.models.generate_content(
                    model=self.model,
                    contents=full_prompt,
                    config=genai_types.GenerateContentConfig(**cfg_kwargs),
                )
                self.total_live_calls += 1
                self.last_error = None
                return json.loads(response.text)
            except Exception as exc:  # pylint: disable=broad-exception-caught
                self.last_error = str(exc)

        return self.generate_multi_turn_json(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            schema=schema,
            system_instruction=system_instruction,
            temperature=0.1,
            timeout_sec=timeout_sec,
        )

    def run_parallel_role_agents(
        self,
        document_text: str,
        agents: list[dict[str, str]],
        policy_packs: list[dict[str, Any]],
        feasibility_context: dict[str, Any],
    ) -> list[dict[str, Any]] | None:
        """Executes 4 concurrent Gemini Role Agent evaluations in parallel."""
        if not self.is_live_enabled():
            return None

        def _eval_single_agent(agent: dict[str, str]) -> dict[str, Any] | None:
            default_pack: dict[str, Any] = {"title": "Default Policy", "rules": []}
            pack: dict[str, Any] = next(
                (p for p in policy_packs if p["agent_id"] == agent["id"]),
                default_pack,
            )
            rules_list: list[dict[str, Any]] = list(pack.get("rules", []))
            rules_txt = "\n".join(
                f"- {r.get('id', '')}: {r.get('summary', '')} (Constraint: {r.get('constraint', '')})"
                for r in rules_list
            )
            sys_inst = (
                f"You are the {agent['name']} ({agent['role']}) at Google Cloud, "
                f"representing {agent['owner_team']} and human approver {agent['human_approver']}. "
                "Audit the user's draft document strictly against your assigned Policy Pack rules. "
                "Only flag claims that belong to your domain. "
                "The `excerpt` field MUST be an exact verbatim substring copied from the document so it can be highlighted and replaced."
            )
            user_prompt = (
                f"ASSIGNED POLICY PACK ({pack.get('title')}):\n{rules_txt}\n\n"
                f"DETERMINISTIC FEASIBILITY & BUDGET TELEMETRY:\n"
                f"- Allocated Budget: ${feasibility_context['allocated_budget']:,} "
                f"(Tolerance limit: ${feasibility_context['tolerance_limit']:,})\n"
                f"- Projected Spend from Scope: ${feasibility_context['projected_spend']:,}\n"
                f"- Team Capacity: {feasibility_context['required_fte']} FTE required vs {feasibility_context['available_fte']} FTE available\n"
                f"- Critical Path: {feasibility_context['projected_days']} business days vs {feasibility_context['target_launch_days']}-day deadline\n\n"
                f"DRAFT DOCUMENT TO AUDIT:\n\"\"\"\n{document_text}\n\"\"\""
            )
            res = self.generate_structured_json(
                prompt=user_prompt,
                schema=ROLE_AGENT_RESPONSE_SCHEMA,
                system_instruction=sys_inst,
            )
            if not res:
                return None
            return {"agent": agent, "result": res}

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(_eval_single_agent, ag) for ag in agents]
            results = [f.result() for f in futures]

        if any(r is None for r in results):
            return None
        return [r for r in results if r is not None]

    def run_mediator_and_derivatives(
        self,
        document_text: str,
        claims: list[dict[str, Any]],
        feasibility: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Runs a Gemini Multi-Agent Mediator turn to synthesize negotiation dialogue and derivatives."""
        if not self.is_live_enabled():
            return None

        claims_summary = "\n".join(
            f"- [{c['status'].upper()}] {c['id']} ({c['agent_id']} / {c['rule_id']}): {c['issue']} -> Proposed: {c['replacement']}"
            for c in claims
        )
        prompt = (
            "Synthesize a realistic 2-turn cross-agent negotiation between the Google Cloud PM Agent, "
            "Legal & NDA Agent, and Commercial & Delivery Agent resolving the active Hard Stops, "
            "and generate a zero-drift External Launch Blog and Field Sales FAQ that strictly obey all verified claims.\n\n"
            f"DOCUMENT:\n{document_text}\n\n"
            f"ACTIVE CLAIM GRAPH:\n{claims_summary}\n\n"
            f"FEASIBILITY METRICS:\nSpend: ${feasibility['projected_spend']:,} / ${feasibility['allocated_budget']:,} | "
            f"FTE: {feasibility['required_fte']}/{feasibility['available_fte']} | "
            f"Schedule: {feasibility['projected_days']}d / {feasibility['target_launch_days']}d"
        )
        return self.generate_structured_json(
            prompt=prompt,
            schema=MEDIATOR_RESPONSE_SCHEMA,
            system_instruction="You are the Murph Multi-Agent Harmonizer Mediator at Google Cloud.",
        )

    def run_workspace_ticket_negotiation(
        self,
        title: str,
        request_summary: str,
        requester_agent: dict[str, Any],
        target_agents: list[dict[str, Any]],
        shared_files: list[dict[str, Any]],
        followup_feedback: str = "",
    ) -> dict[str, Any] | None:
        """Uses Gemini to coordinate Central Workspace Agent matchmaking and peer-to-peer Personal Agent negotiation over shared files."""
        if not self.is_live_enabled():
            return None

        ticket_schema: dict[str, Any] = {
            "type": "OBJECT",
            "required": [
                "status", "compromise_title", "compromise_summary",
                "updated_shared_file_content", "requires_additional_assistance",
                "assistance_reason", "agent_debate_turns",
            ],
            "properties": {
                "status": {"type": "STRING", "description": "'compromise_reached' or 'needs_assistance'"},
                "compromise_title": {"type": "STRING"},
                "compromise_summary": {"type": "STRING"},
                "updated_shared_file_content": {"type": "STRING"},
                "requires_additional_assistance": {"type": "BOOLEAN"},
                "assistance_reason": {"type": "STRING"},
                "agent_debate_turns": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["speaker_agent_id", "speaker_agent_name", "target_agent_id", "message", "referenced_file"],
                        "properties": {
                            "speaker_agent_id": {"type": "STRING"},
                            "speaker_agent_name": {"type": "STRING"},
                            "target_agent_id": {"type": "STRING"},
                            "message": {"type": "STRING"},
                            "referenced_file": {"type": "STRING"},
                        },
                    },
                },
            },
        }

        files_blob = json.dumps(shared_files, indent=2)
        targets_blob = json.dumps(target_agents, indent=2)
        prompt = (
            f"TICKET TITLE: {title}\n"
            f"USER REQUEST TO PERSONAL AGENT ({requester_agent['name']}): {request_summary}\n"
            f"FOLLOW-UP FEEDBACK (IF ANY): {followup_feedback}\n\n"
            f"LINKED PEER PERSONAL AGENTS IN SHARED SESSION:\n{targets_blob}\n\n"
            f"SHARED REFERENCE FILES:\n{files_blob}\n\n"
            "Have the Central Workspace Agent (`workspace_agent`) link the participating Personal Agents over the shared files, "
            "run a multi-turn peer-to-peer negotiation, and produce either a concrete compromise proposal (with updated_shared_file_content) "
            "or flag requires_additional_assistance if human policy/budget sign-off is required."
        )
        return self.generate_structured_json(
            prompt=prompt,
            schema=ticket_schema,
            system_instruction=(
                "You are the Murph Central Workspace Agent (`workspace_agent`) orchestrating peer-to-peer "
                "negotiations between users' Personal Agents over shared reference files."
            ),
        )


