"""Cross-Team Ticket Creation & Shared-File Negotiation Mixin.

Implements `create_agent_ticket` which routes a user's request and reference
files through their Personal Agent -> Central Workspace Agent -> Peer Personal
Agents, synthesizing a bilateral compromise proposal over shared files.
"""

from __future__ import annotations

import datetime
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_registration
    from google3.experimental.users.efch.murph.backend.engine import engine_tickets_compromise
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_registration
        from google3.experimental.users.efch.murph.backend.engine import engine_tickets_compromise
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.engine import engine_registration  # type: ignore
        from backend.engine import engine_tickets_compromise  # type: ignore
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS

DISPLAY_NAME_TO_SEED_FILE_ID: dict[str, str] = {
    "demo launch brief.md": "FILE-OWNER-105",
    "launch brief.md": "FILE-OWNER-105",
    "demo launch brief": "FILE-OWNER-105",
    "launch brief": "FILE-OWNER-105",
    "cloud_next_keynote_run_of_show.md": "FILE-OWNER-105",
    "demo product prd.md": "FILE-PM-101",
    "product prd.md": "FILE-PM-101",
    "demo product prd": "FILE-PM-101",
    "product prd": "FILE-PM-101",
    "vertex_v24_prd_and_regional_roadmap.md": "FILE-PM-101",
    "demo nda vault.md": "FILE-LEGAL-102",
    "nda vault.md": "FILE-LEGAL-102",
    "demo nda vault": "FILE-LEGAL-102",
    "nda vault": "FILE-LEGAL-102",
    "customer_nda_clearance_vault_2026.md": "FILE-LEGAL-102",
    "pso rate card.csv": "FILE-DEAL-103",
    "rate card.csv": "FILE-DEAL-103",
    "pso rate card": "FILE-DEAL-103",
    "rate card": "FILE-DEAL-103",
    "q4_pso_rate_card_and_bench_capacity.md": "FILE-DEAL-103",
    "demo brand rules.md": "FILE-BRAND-104",
    "brand rules.md": "FILE-BRAND-104",
    "demo brand rules": "FILE-BRAND-104",
    "brand rules": "FILE-BRAND-104",
    "gcp_brand_voice_and_messaging_rules.md": "FILE-BRAND-104",
}


def _matches_exact_handle(user: dict[str, Any], handle: str) -> bool:
    """True if `handle` is exactly the user's id, email or email username."""
    ldap = str(user.get("ldap", "")).lower()
    return handle in (str(user.get("id", "")).lower(), ldap, ldap.split("@")[0])


class TicketCreateMixin(
    engine_tickets_compromise.TicketCompromiseBuilderMixin
):
    """Mixin for creating cross-team shared-file tickets and agent negotiations."""
    _ensure_personal_and_team_agent_for_user: Any
    _extract_query_tokens: Any

    store: Any
    llm_client: Any
    current_user: dict[str, Any] | None
    user_files: list[dict[str, Any]]
    file_environments: dict[str, str]

    def _resolve_reference_file_ids(
        self,
        raw_refs: list[str] | None,
        creator_user: dict[str, Any] | None = None,
        creator_env: str = "",
    ) -> list[str]:
        """Resolves desktop display names, leaf filenames, or file IDs to user_files IDs.

        Files of other private (Sign-Up) accounts are never candidates.
        """
        resolved_ids: list[str] = []
        uid = str((creator_user or {}).get("id", "")).strip()
        uldap = str((creator_user or {}).get("ldap", "")).strip().lower()
        c_env = (creator_env or "").strip().lower()
        file_envs = getattr(self, "file_environments", {}) or {}
        visible_files = [
            uf
            for uf in self.user_files
            if uf.get("user_id") == uid
            or not engine_registration.is_private_account_id(uf.get("user_id"))
        ]

        for raw in raw_refs or []:
            clean_ref = re.sub(r"^[^\w@./-]+", "", str(raw or "").strip()).strip()
            if not clean_ref:
                continue
            clean_low = clean_ref.lower()
            leaf_low = clean_ref.split("/")[-1].strip().lower()

            # 1. Exact ID match
            id_hit = next((uf["id"] for uf in visible_files if uf["id"].lower() == clean_low), None)
            if id_hit:
                if id_hit not in resolved_ids:
                    resolved_ids.append(id_hit)
                continue

            # 2. Active user / environment exact or leaf filename match (latest saved/edited wins)
            user_hit = None
            for uf in reversed(visible_files):
                fn_low = str(uf.get("filename", "")).strip().lower()
                fn_leaf = fn_low.split("/")[-1].strip()
                if fn_low != clean_low and fn_leaf != leaf_low:
                    continue
                uf_env = str(uf.get("environment") or file_envs.get(uf["id"]) or "").lower()
                if (
                    (uid and uf.get("user_id") == uid)
                    or (uldap and str(uf.get("user_ldap", "")).lower() == uldap)
                    or (c_env and uf_env == c_env)
                ):
                    user_hit = uf["id"]
                    break
            if user_hit:
                if user_hit not in resolved_ids:
                    resolved_ids.append(user_hit)
                continue

            # 3. Canonical desktop display-name to seed file ID map
            seed_id = DISPLAY_NAME_TO_SEED_FILE_ID.get(clean_low) or DISPLAY_NAME_TO_SEED_FILE_ID.get(leaf_low)
            if seed_id and any(uf["id"] == seed_id for uf in visible_files):
                if seed_id not in resolved_ids:
                    resolved_ids.append(seed_id)
                continue

            # 4. Global exact or leaf filename match across user_files
            global_hit = next(
                (
                    uf["id"]
                    for uf in reversed(visible_files)
                    if str(uf.get("filename", "")).strip().lower() == clean_low
                    or str(uf.get("filename", "")).split("/")[-1].strip().lower() == leaf_low
                ),
                None,
            )
            if global_hit and global_hit not in resolved_ids:
                resolved_ids.append(global_hit)

        return resolved_ids

    def _format_ticket_shared_file(
        self, f_match: dict[str, Any], owner_agent_name: str = ""
    ) -> dict[str, Any]:
        """Packages a user file for a ticket, redacting raw private files into a Personal-Agent-vetted summary."""
        vis = str(f_match.get("visibility", "federated") or "federated").lower()
        agent_label = owner_agent_name or f"{str(f_match.get('user_ldap', 'owner')).split('@')[0]}@'s Personal Agent"
        if vis == "private":
            raw_lines = [ln.strip() for ln in str(f_match.get("content", "")).splitlines() if ln.strip()]
            redacted_content = (
                f"[PRIVATE FILE VETTED SUMMARY · Grounded by {agent_label}]\n"
                f"- Source File: `{f_match['filename']}` (Owner: {f_match['user_ldap']} · Visibility: Private to Personal Agent)\n"
                f"- Vetted Constraints: {agent_label} audited {len(raw_lines)} private line(s) locally and verified alignment "
                "guardrails without exposing confidential raw text to peer agents."
            )
            return {
                "id": f_match["id"], "filename": f_match["filename"], "owner_ldap": f_match["user_ldap"],
                "personal_agent_id": f_match["personal_agent_id"], "visibility": "private_vetted_summary",
                "raw_redacted": True, "content": redacted_content,
            }
        return {
            "id": f_match["id"], "filename": f_match["filename"], "owner_ldap": f_match["user_ldap"],
            "personal_agent_id": f_match["personal_agent_id"], "visibility": vis,
            "raw_redacted": False, "content": f_match["content"],
        }

    def create_agent_ticket(
        self,
        title: str,
        request_summary: str,
        reference_file_ids: list[str] | None = None,
        custom_file_name: str = "",
        custom_file_content: str = "",
        target_user_ids: list[str] | None = None,
        target_team_agent_ids: list[str] | None = None,
        user_id: str | None = None,
        force_needs_assistance: bool = False,
    ) -> dict[str, Any]:
        """Creates a cross-team ticket via the user's Personal Agent -> Central Workspace Agent -> Peer Personal Agents over shared files."""
        clean_title = title.strip() or "Cross-Team Launch & Scope Alignment Ticket"
        clean_req = request_summary.strip() or clean_title

        all_users = self.store.list_users()
        requester_user = None
        if user_id:
            requester_user = next(
                (u for u in all_users if u["id"] == user_id or u["ldap"].lower() == str(user_id).lower()), None
            )
        if not requester_user and self.current_user:
            requester_user = next(
                (u for u in all_users if u["id"] == self.current_user["id"]),
                self.current_user,
            )
        if not requester_user:
            requester_user = all_users[0]

        req_personal_ag, req_team_ag = self._ensure_personal_and_team_agent_for_user(
            requester_user, team_agent_id=requester_user.get("team_agent_id", "pm_agent")
        )

        # If inline custom reference file content was supplied, upload and index it under requester's Personal Agent
        newly_created_file_id: str | None = None
        if custom_file_content.strip():
            slug = re.sub(r"[^a-z0-9_]", "_", requester_user["ldap"].split("@")[0].lower()).strip("_")
            fname = custom_file_name.strip() or f"{slug}_ticket_ref_{len(self.user_files) + 1}.md"
            now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            newly_created_file_id = f"FILE-{slug.upper()[:8]}-{len(self.store.list_user_files()) + 1}"
            self.store.add_user_file(
                {
                    "id": newly_created_file_id, "user_id": requester_user["id"], "user_ldap": requester_user["ldap"],
                    "personal_agent_id": req_personal_ag["id"], "team_agent_id": req_team_ag["id"],
                    "team_name": req_team_ag["team_name"], "filename": fname, "content": custom_file_content.strip(),
                    "visibility": "federated", "uploaded_at": now_str,
                }
            )
            self._sync_from_store()

        # Gather requester's reference file(s) to share in the ticket
        selected_file_ids = self._resolve_reference_file_ids(reference_file_ids, creator_user=requester_user)
        if newly_created_file_id and newly_created_file_id not in selected_file_ids:
            selected_file_ids.insert(0, newly_created_file_id)

        shared_files: list[dict[str, Any]] = []
        for fid in selected_file_ids:
            f_match = next((f for f in self.user_files if f["id"] == fid), None)
            if f_match:
                shared_files.append(self._format_ticket_shared_file(f_match, req_personal_ag["name"]))

        if not shared_files:
            own_files = [
                f for f in self.user_files
                if f["user_id"] == requester_user["id"] or f["personal_agent_id"] == req_personal_ag["id"]
            ]
            if own_files:
                shared_files.append(self._format_ticket_shared_file(own_files[0], req_personal_ag["name"]))
            else:
                shared_files.append(
                    {
                        "id": "FILE-TICKET-INLINE",
                        "filename": custom_file_name.strip() or "ticket_shared_reference_spec.md",
                        "owner_ldap": requester_user["ldap"],
                        "personal_agent_id": req_personal_ag["id"],
                        "visibility": "federated",
                        "raw_redacted": False,
                        "content": clean_req,
                    }
                )

        # Match relevant peer users & their Personal Agents via Central Workspace Agent
        combined_text = f"{clean_title}\n{clean_req}\n" + "\n".join(sf["content"] for sf in shared_files)
        tokens = self._extract_query_tokens(combined_text)
        text_lower = combined_text.lower()

        domain_keywords: dict[str, list[str]] = {
            "legal_agent": ["nda", "legal", "apex", "bank", "waiver", "logo", "customer", "anonym", "snowflake", "baa", "hipaa", "clearance", "contract"],
            "commercial_agent": ["budget", "cost", "spend", "pso", "fte", "capacity", "sap", "mainframe", "sow", "rate", "sku", "deal", "wave", "82,000", "82k", "60,000", "60k"],
            "pm_agent": ["ga", "preview", "region", "singapore", "asia", "latency", "benchmark", "tpu", "cmek", "voice", "prd", "vertex", "roadmap"],
            "brand_agent": ["brand", "naming", "gcp", "lockup", "headline", "keynote", "blog", "copy"],
        }

        # Private (Sign-Up) accounts other than the requester are reached only by
        # an exact id/email/username tag: never by name, prefix or auto-routing.
        req_id = requester_user["id"]
        private_others = {
            u["id"]
            for u in all_users
            if u["id"] != req_id and engine_registration.is_private_account_id(u["id"])
        }
        # Every visitor can sign in as the two demo accounts, so a private
        # requester's work reaches them only when it tags them explicitly.
        no_auto_route = set(private_others)
        if engine_registration.is_private_account_id(req_id):
            no_auto_route |= {
                u["id"] for u in all_users if u["ldap"].lower() in seed_data.DEMO_ACCOUNT_LDAPS
            }

        matched_peer_users: list[dict[str, Any]] = []
        explicit_peer_ids: set[str] = set()
        if target_user_ids:
            for raw_uid in target_user_ids:
                uid_clean = str(raw_uid).strip().lstrip("@").lower()
                if not uid_clean:
                    continue
                u_obj = next(
                    (
                        u for u in all_users
                        if u["id"] != req_id
                        and (
                            _matches_exact_handle(u, uid_clean)
                            or (u["id"] not in private_others and u["name"].lower() == uid_clean)
                        )
                    ),
                    None,
                )
                if u_obj:
                    explicit_peer_ids.add(u_obj["id"])
                    if u_obj not in matched_peer_users:
                        matched_peer_users.append(u_obj)

        # Also detect @ldap mentions in title or request_summary
        mentioned_handles = re.findall(r"@([a-zA-Z0-9._-]+)", f"{clean_title} {clean_req}")
        for handle in mentioned_handles:
            h_low = handle.lower().rstrip(".")
            u_obj = next(
                (
                    u for u in all_users
                    if u["id"] != req_id
                    and (
                        _matches_exact_handle(u, h_low)
                        or (
                            u["id"] not in private_others
                            and (
                                u["ldap"].lower().startswith(h_low)
                                or (u["name"].lower().split() or [""])[0] == h_low
                            )
                        )
                    )
                ),
                None,
            )
            if u_obj:
                explicit_peer_ids.add(u_obj["id"])
                if u_obj not in matched_peer_users:
                    matched_peer_users.append(u_obj)

        if target_team_agent_ids:
            for tid in target_team_agent_ids:
                for u_obj in all_users:
                    if (
                        u_obj.get("team_agent_id") == tid
                        and u_obj["id"] != req_id
                        and u_obj["id"] not in no_auto_route
                        and u_obj not in matched_peer_users
                    ):
                        matched_peer_users.append(u_obj)
                        break

        if not matched_peer_users:
            scored_peers: list[tuple[int, dict[str, Any]]] = []
            for u_obj in all_users:
                if u_obj["id"] == req_id or u_obj["id"] in no_auto_route:
                    continue
                t_id = u_obj.get("team_agent_id", "pm_agent")
                score = sum(5 for kw in domain_keywords.get(t_id, []) if kw in text_lower)
                u_files = [
                    f for f in self.user_files
                    if (f["user_id"] == u_obj["id"] or f["team_agent_id"] == t_id)
                    and f["user_id"] not in private_others
                    and str(f.get("visibility", "federated")).lower() != "private"
                ]
                for uf in u_files:
                    f_score, _ = self._find_best_snippet(uf["filename"] + "\n" + uf["content"], tokens)
                    score += f_score
                if t_id != req_team_ag["id"]:
                    score += 2
                scored_peers.append((score, u_obj))
            scored_peers.sort(key=lambda x: x[0], reverse=True)
            matched_peer_users = [u for s, u in scored_peers if s > 2][:2] or [u for _, u in scored_peers[:1]]

        participating_users: list[dict[str, Any]] = [
            {
                "user_id": requester_user["id"], "name": requester_user["name"], "ldap": requester_user["ldap"],
                "role": "Requester", "routing_mode": "requester", "team_agent_id": req_team_ag["id"],
                "team_name": req_team_ag["team_name"], "personal_agent_id": req_personal_ag["id"],
                "personal_agent_name": req_personal_ag["name"],
            }
        ]
        participating_agents: list[str] = ["workspace_agent", req_personal_ag["id"], req_team_ag["id"]]

        peer_agent_objs: list[dict[str, Any]] = []
        for peer_u in matched_peer_users:
            p_ag, p_team_ag = self._ensure_personal_and_team_agent_for_user(
                peer_u, team_agent_id=peer_u.get("team_agent_id", "pm_agent")
            )
            peer_agent_objs.append(p_ag)
            participating_users.append(
                {
                    "user_id": peer_u["id"], "name": peer_u["name"], "ldap": peer_u["ldap"],
                    "role": peer_u.get("role", "Cross-Team Reviewer"),
                    "routing_mode": "tagged" if peer_u["id"] in explicit_peer_ids else "auto_routed",
                    "team_agent_id": p_team_ag["id"], "team_name": p_team_ag["team_name"],
                    "personal_agent_id": p_ag["id"], "personal_agent_name": p_ag["name"],
                }
            )
            for aid in (p_ag["id"], p_team_ag["id"]):
                if aid not in participating_agents:
                    participating_agents.append(aid)

            peer_files = [
                f for f in self.user_files
                if (f["personal_agent_id"] == p_ag["id"] or f["team_agent_id"] == p_team_ag["id"])
                and (f["user_id"] == peer_u["id"] or f["user_id"] not in private_others)
                and str(f.get("visibility", "federated")).lower() != "private"
            ]
            if peer_files:
                ranked_pf = sorted(
                    peer_files,
                    key=lambda pf: self._find_best_snippet(pf["content"], tokens)[0],
                    reverse=True,
                )
                top_pf = ranked_pf[0]
                if not any(sf["id"] == top_pf["id"] for sf in shared_files):
                    shared_files.append(self._format_ticket_shared_file(top_pf, p_ag["name"]))

        return self._build_and_save_settled_ticket(
            clean_title=clean_title,
            clean_req=clean_req,
            text_lower=text_lower,
            tokens=tokens,
            requester_user=requester_user,
            req_personal_ag=req_personal_ag,
            req_team_ag=req_team_ag,
            peer_agent_objs=peer_agent_objs,
            participating_users=participating_users,
            participating_agents=participating_agents,
            shared_files=shared_files,
            force_needs_assistance=force_needs_assistance,
        )

