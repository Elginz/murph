"""Conversational Gemini Help Desk Agent & Vertex AI ADC Transport Mixin.

Provides multi-turn conversational Gemini execution (`run_federated_a2a_consultation`
and `generate_multi_turn_json`) for the Murph Terminal Agent Help Desk, supporting:
1. Gemini Developer API keys (`GEMINI_API_KEY` / `GOOGLE_API_KEY` / `.env` / runtime key)
   via `generativelanguage.googleapis.com/v1beta`.
2. Google Cloud Vertex AI Gemini (`aiplatform.googleapis.com`) via OAuth2 Bearer tokens when
   `allow_adc=True`: the Cloud Run runtime service account (`cloud_run_metadata`), else the
   local `gcloud auth` login or ADC file, so the agent works live out-of-the-box.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any, TYPE_CHECKING
import urllib.error
import urllib.parse
import urllib.request

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend import paths
    from google3.experimental.users.efch.murph.backend.integrations import cloud_run_metadata
else:
    try:
        from google3.experimental.users.efch.murph.backend import paths
        from google3.experimental.users.efch.murph.backend.integrations import cloud_run_metadata
    except ImportError:
        from backend import paths  # type: ignore
        from backend.integrations import cloud_run_metadata  # type: ignore


HELPDESK_AGENT_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "final_answer",
        "sources",
        "suggested_chips",
        "ui_action",
        "hop_Overrides",
    ],
    "properties": {
        "final_answer": {
            "type": "STRING",
            "description": (
                "Natural, conversational plain-text response for the Murph terminal. "
                "No markdown **bold** or # headers; use short paragraphs or '•' bullets."
            ),
        },
        "sources": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": (
                "Exact filenames or Policy Pack rule IDs actually cited in final_answer. "
                "Return [] for greetings, small talk, or general workflow/navigation help."
            ),
        },
        "suggested_chips": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": (
                "3 to 4 short clickable follow-up prompts (under 36 chars each) relevant "
                "to the current conversation and the user's visible workflows/files."
            ),
        },
        "ui_action": {
            "type": "OBJECT",
            "required": ["action", "popup_id", "target_title"],
            "properties": {
                "action": {
                    "type": "STRING",
                    "enum": ["none", "open_popup"],
                    "description": (
                        "Use 'open_popup' ONLY when the user explicitly asks to open, show, "
                        "view, or launch a workflow folder, file, or app window on their desktop."
                    ),
                },
                "popup_id": {
                    "type": "STRING",
                    "description": (
                        "Target popup ID when action='open_popup': '136:468' (Claim Fixes), "
                        "'136:417' (Blocker Alerts), '136:521' (Deliverables), '136:579' (Policy & Rates Sync), "
                        "'136:730' (Cross-Team Agreement / Tickets), '136:341' (Blue File Viewer), "
                        "'145:1045' (Create Workflow Wizard), '145:1122' (Drive / Upload Blue File), "
                        "'guide:welcome' (Guide), or 'trash:bin' (Trash Bin)."
                    ),
                },
                "target_title": {
                    "type": "STRING",
                    "description": "Exact workflow title or Blue filename to open, or empty string.",
                },
            },
        },
        "hop_Overrides": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["to_agent_id", "request_message", "response_message"],
                "properties": {
                    "to_agent_id": {"type": "STRING"},
                    "request_message": {"type": "STRING"},
                    "response_message": {"type": "STRING"},
                },
            },
        },
    },
}


class HelpDeskAgentMixin:
    """Mixin giving MurphLLMClient Vertex AI OAuth2 fallback and multi-turn Help Desk chat."""

    _runtime_api_key: str | None
    model: str
    last_error: str | None
    total_live_calls: int
    allow_adc: bool
    _vertex_token: str
    _vertex_token_expiry: float
    _vertex_project: str
    _vertex_token_source: str
    _dotenv_key_cache: str | None

    def _read_dotenv_api_key(self) -> str:
        """Reads GEMINI_API_KEY or GOOGLE_API_KEY from the project-root `.env` file if present."""
        if getattr(self, "_dotenv_key_cache", None) is not None:
            return self._dotenv_key_cache or ""
        env_path = paths.DOTENV_PATH
        found = ""
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for raw_line in f:
                        line = raw_line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        if k.strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                            found = v.strip().strip("'\"")
                            if found:
                                break
            except OSError:
                pass
        self._dotenv_key_cache = found
        return found

    def _mint_vertex_oauth_token(self) -> tuple[str, str]:
        """Mints a Google Cloud OAuth2 token and resolves an active Vertex AI GCP project.

        Token sources, in order: the Cloud Run runtime service account (metadata server),
        the local `gcloud auth` login, then the user's ADC file.
        """
        if not getattr(self, "allow_adc", False):
            return "", ""
        now = time.time()
        cached_tok = getattr(self, "_vertex_token", "")
        cached_exp = getattr(self, "_vertex_token_expiry", 0.0)
        cached_proj = getattr(self, "_vertex_project", "")
        if cached_tok and cached_proj and now < cached_exp - 60:
            return cached_tok, cached_proj

        token, ttl, metadata_project = cloud_run_metadata.runtime_credentials()
        from_metadata = bool(token)
        if not from_metadata:
            ttl = 2400.0
            try:
                out = subprocess.check_output(
                    ["gcloud", "auth", "print-access-token"],
                    stderr=subprocess.DEVNULL,
                    timeout=3.5,
                ).decode("utf-8", errors="replace").strip()
                for line in reversed(out.splitlines()):
                    clean = line.strip()
                    if clean.startswith("ya29."):
                        token = clean
                        break
            except Exception:  # pylint: disable=broad-exception-caught
                token = ""

        if not token:
            adc_path = os.path.expanduser(
                "~/.config/gcloud/application_default_credentials.json"
            )
            if os.path.isfile(adc_path):
                try:
                    with open(adc_path, "r", encoding="utf-8") as f:
                        adc = json.load(f)
                    if adc.get("type") == "authorized_user":
                        body = urllib.parse.urlencode(
                            {
                                "client_id": adc.get("client_id", ""),
                                "client_secret": adc.get("client_secret", ""),
                                "refresh_token": adc.get("refresh_token", ""),
                                "grant_type": "refresh_token",
                            }
                        ).encode("utf-8")
                        req = urllib.request.Request(
                            "https://oauth2.googleapis.com/token",
                            data=body,
                            method="POST",
                        )
                        with urllib.request.urlopen(req, timeout=3.5) as resp:
                            token = str(
                                json.loads(resp.read().decode("utf-8")).get(
                                    "access_token", ""
                                )
                            ).strip()
                except Exception:  # pylint: disable=broad-exception-caught
                    token = ""

        if not token:
            return "", ""

        project = (
            os.environ.get("VERTEX_PROJECT_ID", "").strip()
            or os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
            or metadata_project
            or cached_proj
        )
        if not project:
            try:
                req_p = urllib.request.Request(
                    "https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=20",
                    headers={"Authorization": f"Bearer {token}"},
                )
                with urllib.request.urlopen(req_p, timeout=3.5) as rp:
                    projs = [
                        str(p.get("projectId", "")).strip()
                        for p in json.loads(rp.read().decode("utf-8")).get(
                            "projects", []
                        )
                        if p.get("lifecycleState") == "ACTIVE"
                        and p.get("projectId")
                    ]
                if projs:
                    project = projs[0]
            except Exception:  # pylint: disable=broad-exception-caught
                pass
        if not project:
            project = "efch-501106"

        self._vertex_token = token
        self._vertex_token_expiry = now + ttl
        self._vertex_project = project
        self._vertex_token_source = "metadata" if from_metadata else "user"
        return token, project

    def has_vertex_auth(self) -> bool:
        """Returns True if Vertex AI OAuth2 credentials are available."""
        tok, proj = self._mint_vertex_oauth_token()
        return bool(tok and proj)

    def generate_multi_turn_json(
        self,
        contents: list[dict[str, Any]],
        schema: dict[str, Any],
        system_instruction: str = "",
        temperature: float = 0.25,
        timeout_sec: float = 18.0,
    ) -> dict[str, Any] | None:
        """Calls Gemini (via API key or Vertex AI OAuth2) with multi-turn contents and JSON schema."""
        def _build_payload(target_model: str) -> bytes:
            gen_cfg: dict[str, Any] = {
                "responseMimeType": "application/json",
                "responseSchema": schema,
            }
            if target_model not in ("gemini-3.8-flash", "gemini-3.5-flash-lite"):
                gen_cfg["temperature"] = temperature
            body_obj: dict[str, Any] = {
                "contents": contents,
                "generationConfig": gen_cfg,
            }
            if system_instruction:
                body_obj["systemInstruction"] = {
                    "parts": [{"text": system_instruction}]
                }
            return json.dumps(body_obj).encode("utf-8")

        def _candidate_models(primary: str) -> list[str]:
            candidates = [
                primary,
                "gemini-3.8-flash",
                "gemini-3.5-flash",
                "gemini-3-flash-preview",
                "gemini-3.1-pro-preview",
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-3.1-flash-lite-preview",
                "gemini-2.5-flash",
            ]
            seen: list[str] = []
            for m in candidates:
                if m and m not in seen:
                    seen.append(m)
            return seen

        key = getattr(self, "api_key", "")
        if key:
            for candidate in _candidate_models(self.model):
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate}:generateContent?key={key}"
                req = urllib.request.Request(
                    url,
                    data=_build_payload(candidate),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                        body = json.loads(resp.read().decode("utf-8"))
                    text_out = (
                        body.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if text_out:
                        self.total_live_calls += 1
                        self.last_error = None
                        return json.loads(text_out)
                except urllib.error.HTTPError as exc:
                    self.last_error = f"HTTP {exc.code}: {exc.reason}"
                    if exc.code in (400, 404):
                        continue
                    break
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    self.last_error = str(exc)
                    break

        token, project = self._mint_vertex_oauth_token()
        if not (token and project):
            return None

        for candidate in _candidate_models(self.model):
            vertex_url = (
                f"https://aiplatform.googleapis.com/v1/projects/{project}"
                f"/locations/global/publishers/google/models/{candidate}:generateContent"
            )
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            if getattr(self, "_vertex_token_source", "") != "metadata":
                # gcloud/ADC user tokens need a quota project. The Cloud Run service account
                # bills its own project (the header would also need serviceusage.services.use).
                headers["X-Goog-User-Project"] = project
            req_v = urllib.request.Request(
                vertex_url,
                data=_build_payload(candidate),
                headers=headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(req_v, timeout=timeout_sec) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                text_out = (
                    body.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                if text_out:
                    self.total_live_calls += 1
                    self.last_error = None
                    return json.loads(text_out)
            except urllib.error.HTTPError as exc:
                self.last_error = f"HTTP {exc.code}: {exc.reason}"
                if exc.code in (400, 404):
                    continue
                break
            except Exception as exc:  # pylint: disable=broad-exception-caught
                self.last_error = str(exc)
                break
        return None

    def run_federated_a2a_consultation(
        self,
        question: str,
        requester_agent: dict[str, Any],
        requester_team_agent: dict[str, Any],
        candidate_hops: list[dict[str, Any]],
        own_files: list[dict[str, Any]] | None = None,
        policy_rules: list[str] | None = None,
        isolated: bool = False,
        requester_ldap: str = "",
        workspace_context: str = "",
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any] | None:
        """Runs a multi-turn conversational Help Desk Agent turn grounded in workspace state and files."""
        if not self.is_live_enabled():  # type: ignore[attr-defined]
            return None

        own_files_block = "\n\n".join(
            f"=== FILE: {f.get('filename', 'file.md')}{' (truncated)' if f.get('truncated') else ''} ===\n{f.get('content', '')}"
            for f in (own_files or [])
        ) or "(the user has not uploaded any Blue files on this account yet)"
        rules_block = "\n".join(f"- {r}" for r in (policy_rules or [])) or "(no specific rule matched)"
        hops_context = json.dumps(candidate_hops, indent=2) if candidate_hops else "[]"
        ws_block = (
            f"ACTIVE WORKSPACE SNAPSHOT (live desktop workflows, open counts, tickets, launch readiness):\n{workspace_context.strip()}\n\n"
            if workspace_context.strip()
            else ""
        )
        scope_rule = (
            "ISOLATION RULE: This user is on an isolated self-registered workspace. Answer ONLY using "
            "their ACTIVE WORKSPACE SNAPSHOT, their USER'S OWN UPLOADED FILES below, and general Policy Pack rules. "
            "Never mention or leak files, workflows, or launch blockers belonging to other accounts."
            if isolated
            else "WORKSPACE SCOPE: This user is on a built-in team workspace (Cloud or Digital Marketing). Prioritize their own uploaded files and ACTIVE WORKSPACE SNAPSHOT, and combine federated Team Agent findings when relevant."
        )

        sys_instruction = (
            f"You are {requester_agent['name']}, the Personal Agent and interactive Help Desk assistant for "
            f"{requester_ldap or 'this user'} in Murph (Multi-Agent Unified Resource & Project Harmonizer), "
            f"bound to {requester_team_agent['name']}.\n\n"
            "HOW TO BEHAVE:\n"
            "1. CONVERSATIONAL & NATURAL: Hold genuine, warm, intelligent multi-turn conversations. If the user greets you "
            "('hey there', 'how are u', 'thanks', etc.) or chats casually, respond naturally like a helpful teammate and briefly "
            "mention how you can help with their current desktop workflows or files. Never say 'I didn\\'t find a specific passage matching...'.\n"
            "2. WORKFLOW & DESKTOP HELP DESK: Use the ACTIVE WORKSPACE SNAPSHOT to answer questions about their visible yellow "
            "workflow folders, what is blocking launch, open Cross-Team Agreement tickets, and desktop Blue files.\n"
            "   Murph's 5 workflow types (yellow folders):\n"
            "   • Claim Fixes (popup '136:468'): 4 Role Agents audit documents against Policy Packs with 1-click auto-fixes.\n"
            "   • Blocker Alerts (popup '136:417'): Resolves hard-stop legal/NDA, benchmark, or budget/FTE overruns.\n"
            "   • Cross-Team Agreement (popup '136:730'): Bilateral agent negotiations over shared files with @tagged teammates.\n"
            "   • Policy & Rates Sync (popup '136:579'): Policy Pack rules, PSO Rate Card SKUs, and What-If simulator.\n"
            "   • Deliverables (popup '136:521'): Zero-drift launch packet export once blockers are resolved.\n"
            "3. FILE & POLICY GROUNDING: When the user asks about content in their uploaded Blue files (e.g. starter_reference.md, PRDs, NDAs) "
            "or policy rules, ground your answer strictly in USER'S OWN UPLOADED FILES and TEAM POLICY PACK RULES, citing filenames "
            "in brackets like [starter_reference.md] and rule IDs like RULE-LG-01. Only list items in `sources` if you actually cited them (use [] for casual chat or general workflow navigation).\n"
            "4. DESKTOP NAVIGATION (`ui_action`): Set `ui_action.action = 'open_popup'` ONLY when the user explicitly asks to open, "
            "show, view, or launch a workflow folder, file, or window (including follow-ups like 'open it' or 'open the claim fix one').\n"
            "5. FORMAT: Plain text for a terminal (no markdown **bold** or ### headers). Keep answers concise (2–6 sentences or compact '•' bullets).\n"
            f"{scope_rule}"
        )

        contents: list[dict[str, Any]] = []
        for turn in (conversation_history or [])[-10:]:
            role = "model" if turn.get("role") == "model" else "user"
            txt = str(turn.get("text", "")).strip()
            if not txt:
                continue
            if not contents and role == "model":
                continue
            if contents and contents[-1]["role"] == role:
                contents[-1]["parts"][0]["text"] += "\n" + txt
            else:
                contents.append({"role": role, "parts": [{"text": txt}]})

        current_turn_prompt = (
            f"{ws_block}"
            f"USER'S OWN UPLOADED FILES:\n{own_files_block}\n\n"
            f"TEAM POLICY PACK RULES:\n{rules_block}\n\n"
            f"CANDIDATE AGENT MESH HOPS:\n{hops_context}\n\n"
            f"USER MESSAGE:\n{question}"
        )
        if contents and contents[-1]["role"] == "user":
            contents[-1]["parts"][0]["text"] += "\n\n" + current_turn_prompt
        else:
            contents.append({"role": "user", "parts": [{"text": current_turn_prompt}]})

        return self.generate_multi_turn_json(
            contents=contents,
            schema=HELPDESK_AGENT_SCHEMA,
            system_instruction=sys_instruction,
            temperature=0.25,
        )
