"""Personal-Agent Grounding Mixin for the Terminal Agent (`/api/agent/ask`).

Decides *whose* Personal Agent is answering, whether that account is an
isolated self-registered workspace, gathers the user's OWN uploaded files as
the primary knowledge the agent answers from, and composes the deterministic
(no-Gemini) answer used when live Gemini is unavailable on the server.

Grounding rules (product decision, 2026-10-03):
  - The user's own uploaded Blue files (e.g. the sign-up `starter_reference.md`)
    are the primary source and are always cited by filename.
  - Isolated accounts never see other accounts' files; the 4 Team Agents only
    contribute their Policy Pack rules.
  - Built-in Cloud / DM accounts keep the full federated mesh (other teams'
    federated files may be cited), with own files ranked first.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_agents_mesh
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_agents_mesh
    except ImportError:
        from backend.engine import engine_agents_mesh  # type: ignore

# Keyword routing used to decide which Team Agents a question is relevant to.
A2A_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "pm_agent": [
        "ga", "preview", "region", "singapore", "asia", "latency", "benchmark",
        "tpu", "cmek", "voice", "prd", "vertex", "architecture", "technical",
        "roadmap", "token",
    ],
    "legal_agent": [
        "nda", "legal", "customer", "bank", "apex", "waiver", "logo", "anonym",
        "baa", "hipaa", "snowflake", "comparative", "contract", "clearance",
        "reference", "law",
    ],
    "commercial_agent": [
        "budget", "cost", "spend", "price", "pso", "fte", "capacity", "day",
        "days", "schedule", "deadline", "sap", "mainframe", "wave", "sku",
        "rate", "deal", "commercial", "bench",
    ],
    "brand_agent": [
        "brand", "name", "naming", "gcp", "lockup", "headline", "tone",
        "keynote", "blog", "duet", "bard", "copy", "marketing",
    ],
}

# Context budget handed to Gemini for the user's own files (chars).
MAX_OWN_FILE_CHARS = 6000
MAX_OWN_FILES_TOTAL_CHARS = 24000


class AgentGroundingMixin(engine_agents_mesh.AgentMeshTopologyMixin):
    """Requester resolution, isolation detection, own-file context and fallback answers."""

    store: Any
    current_user: dict[str, Any] | None
    user_files: list[dict[str, Any]]
    account_registry: dict[str, dict[str, Any]]
    active_environment: str

    def _resolve_requester_user(
        self, user_id: str | None = None, ldap: str = ""
    ) -> dict[str, Any]:
        """Finds the asking account by id, then email, then the server-side session, then the first user."""
        all_users = self.store.list_users()
        clean_id = str(user_id or "").strip()
        clean_ldap = str(ldap or "").strip().lower()
        if clean_ldap and "@" not in clean_ldap:
            clean_ldap = f"{clean_ldap}@google.com"
        matched = None
        if clean_id:
            matched = next((u for u in all_users if u["id"] == clean_id), None)
        if not matched and clean_ldap:
            matched = next(
                (u for u in all_users if str(u.get("ldap", "")).lower() == clean_ldap),
                None,
            )
        if not matched and self.current_user:
            matched = next(
                (u for u in all_users if u["id"] == self.current_user["id"]),
                self.current_user,
            )
        return matched or all_users[0]

    def _is_isolated_requester(
        self, requester_user: dict[str, Any], environment: str = ""
    ) -> bool:
        """True for self-registered accounts that own a private workspace (`user:<id>` / `user_<slug>`)."""
        env = str(environment or "").strip().lower()
        if env in ("cloud", "dm"):
            return False
        if env.startswith("user:") or env.startswith("user_"):
            return True
        reg_meta = self.account_registry.get(
            str(requester_user.get("ldap", "")).lower()
        ) or {}
        if reg_meta.get("is_new_account") or requester_user.get("is_new_account"):
            return True
        if (
            self.current_user
            and self.current_user.get("id") == requester_user.get("id")
            and str(self.active_environment or "").startswith("user:")
        ):
            return True
        return False

    def _own_files_for(
        self, requester_user: dict[str, Any], personal_agent_id: str
    ) -> list[dict[str, Any]]:
        """All files uploaded by the asking account (sign-up starter file first, by upload order)."""
        return [
            f
            for f in self.user_files
            if f.get("user_id") == requester_user["id"]
            or f.get("personal_agent_id") == personal_agent_id
        ]

    def _build_own_file_contexts(
        self, own_files: list[dict[str, Any]], tokens: list[str]
    ) -> list[dict[str, Any]]:
        """Full-content contexts (for Gemini) plus top snippets (citations / fallback), best match first."""
        contexts: list[dict[str, Any]] = []
        budget = MAX_OWN_FILES_TOTAL_CHARS
        for f_obj in own_files:
            content = str(f_obj.get("content", ""))
            score, snippets = self._find_top_snippets(content, tokens, limit=3)
            clipped = content[: max(0, min(MAX_OWN_FILE_CHARS, budget))]
            budget -= len(clipped)
            contexts.append(
                {
                    "id": f_obj.get("id", ""),
                    "filename": f_obj.get("filename", "file.md"),
                    "owner_ldap": f_obj.get("user_ldap", ""),
                    "score": score,
                    "snippet": snippets[0] if snippets else "",
                    "snippets": snippets,
                    "content": clipped,
                    "truncated": len(clipped) < len(content),
                }
            )
        contexts.sort(key=lambda c: c["score"], reverse=True)
        return contexts

    @staticmethod
    def _compose_grounded_fallback_answer(
        question: str,
        personal_agent_name: str,
        own_contexts: list[dict[str, Any]],
        rule_summaries: list[str],
        isolated: bool,
    ) -> str:
        """Plain-text answer used when live Gemini is off: quotes the user's own files, then policy notes."""
        lines: list[str] = []
        cited = [c for c in own_contexts if c["snippets"]]
        if cited:
            names = ", ".join(c["filename"] for c in cited[:3])
            lines.append(
                f"{personal_agent_name}: based on your uploaded file(s) {names}, here is what applies to \"{question[:90]}\":"
            )
            for ctx in cited[:3]:
                for snip in ctx["snippets"][:3]:
                    lines.append(f"• [{ctx['filename']}] {snip}")
        else:
            lines.append(
                f"{personal_agent_name}: you have not uploaded any files yet, so I have nothing of yours to ground this in. "
                "Right-click the desktop → New Blue File (or open DRIVE) to upload a reference and ask again."
            )
        if rule_summaries:
            lines.append("Policy notes: " + "; ".join(rule_summaries[:3]))
        if isolated:
            lines.append(
                "Scope: your own files + Team Policy Packs only (nothing from other accounts' workspaces)."
            )
        lines.append(
            "Note: live Gemini is OFF on this server (deterministic fallback). Start main.py with GEMINI_API_KEY set for synthesized answers."
        )
        return "\n".join(lines)
