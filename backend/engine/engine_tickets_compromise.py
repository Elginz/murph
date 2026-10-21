"""Bilateral Ticket Compromise Synthesis & Settlement Builder Mixin.

Synthesizes cross-team agent debate turns, shared-file compromise proposals,
and bilateral notifications for both the initial creator and tagged users.
"""

from __future__ import annotations

import datetime
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS


class TicketCompromiseBuilderMixin:
    """Mixin for synthesizing and persisting bilateral agent-settled tickets."""

    store: Any
    llm_client: Any
    _find_best_snippet: Any
    _sync_from_store: Any
    _append_turn: Any
    get_state: Any

    def _build_and_save_settled_ticket(
        self,
        clean_title: str,
        clean_req: str,
        text_lower: str,
        tokens: list[str],
        requester_user: dict[str, Any],
        req_personal_ag: dict[str, Any],
        req_team_ag: dict[str, Any],
        peer_agent_objs: list[dict[str, Any]],
        participating_users: list[dict[str, Any]],
        participating_agents: list[str],
        shared_files: list[dict[str, Any]],
        force_needs_assistance: bool = False,
    ) -> dict[str, Any]:
        """Runs multi-agent negotiation over shared files, updates creator & tagged users, and saves the ticket."""
        primary_file = shared_files[0]
        peer_agent_names = ", ".join(pa["name"] for pa in peer_agent_objs)
        shared_filenames_str = ", ".join(
            f"`{sf['filename']}`" for sf in shared_files
        )

        routing_log = [
            {
                "step": 1,
                "actor": req_personal_ag["name"],
                "event": (
                    f"Analyzed {requester_user['ldap']}'s request ('{clean_title}'), packaged reference file "
                    f"`{primary_file['filename']}`, and forwarded ticket to Central Workspace Agent (`workspace_agent`)."
                ),
            },
            {
                "step": 2,
                "actor": "Central Workspace Agent",
                "event": (
                    f"Matched cross-team dependencies and linked `{req_personal_ag['name']}` with "
                    f"`{peer_agent_names}` into a shared session over {shared_filenames_str}."
                ),
            },
        ]

        debate_turns: list[dict[str, Any]] = [
            {
                "turn_order": 1,
                "speaker_agent_id": req_personal_ag["id"],
                "speaker_agent_name": req_personal_ag["name"],
                "target_agent_id": "workspace_agent",
                "referenced_file": primary_file["filename"],
                "message": f'Request: "{clean_req}"',
            },
            {
                "turn_order": 2,
                "speaker_agent_id": "workspace_agent",
                "speaker_agent_name": "Central Workspace Agent",
                "target_agent_id": peer_agent_objs[0]["id"],
                "referenced_file": primary_file["filename"],
                "message": f"Connected with {peer_agent_names}.",
            },
        ]

        compromise_clauses: list[str] = []
        updated_lines: list[str] = [
            f"# {clean_title} (Updated Shared File)",
            f"- Requested by: {requester_user['ldap']} ({req_personal_ag['name']})",
            f"- Reviewed with: {peer_agent_names}",
            "",
            "## Original Content",
            primary_file["content"].strip(),
            "",
            "## Agreed Team Changes",
        ]

        needs_assistance = bool(force_needs_assistance)
        assistance_reasons: list[str] = []

        for pa in peer_agent_objs:
            peer_file = next(
                (
                    sf
                    for sf in shared_files
                    if sf["personal_agent_id"] == pa["id"]
                ),
                shared_files[-1],
            )
            _, best_snip = self._find_best_snippet(peer_file["content"], tokens)
            team_id = pa["parent_team_agent_id"]
            if team_id == "legal_agent":
                proposal_line = (
                    "Say 'a major global bank' (NDA) and keep the 68% stat."
                )
            elif team_id == "commercial_agent":
                proposal_line = (
                    "Ship $54k SAP Demo for Oct 18; move $28k Mainframe to Wave 2."
                )
                if (
                    "override" in text_lower
                    or "exception" in text_lower
                    or "unresolvable" in text_lower
                ):
                    needs_assistance = True
                    assistance_reasons.append(
                        "Going over the $66k budget limit requires VP sign-off."
                    )
            elif team_id == "pm_agent":
                proposal_line = (
                    "US & Europe live now; Singapore in Preview until Nov 15 (3.2x faster)."
                )
            else:
                proposal_line = (
                    "Use 'Google Cloud' and 'Vertex AI Agent Builder'."
                )

            compromise_clauses.append(proposal_line)
            updated_lines.append(
                f"- [{pa['name']} via `{peer_file['filename']}`]: {proposal_line}"
            )
            debate_turns.append(
                {
                    "turn_order": len(debate_turns) + 1,
                    "speaker_agent_id": pa["id"],
                    "speaker_agent_name": pa["name"],
                    "target_agent_id": req_personal_ag["id"],
                    "referenced_file": peer_file["filename"],
                    "message": proposal_line,
                }
            )

        debate_turns.append(
            {
                "turn_order": len(debate_turns) + 1,
                "speaker_agent_id": req_personal_ag["id"],
                "speaker_agent_name": req_personal_ag["name"],
                "target_agent_id": "workspace_agent",
                "referenced_file": primary_file["filename"],
                "message": (
                    "Waiting on human sign-off."
                    if needs_assistance
                    else "Updated shared file and sent for sign-off."
                ),
            }
        )

        compromise_title = (
            f"Team Agreement Across {req_personal_ag['name']} & {peer_agent_names}"
        )
        compromise_summary = " | ".join(compromise_clauses)
        updated_shared_content = "\n".join(updated_lines)

        live_neg = self.llm_client.run_workspace_ticket_negotiation(
            title=clean_title,
            request_summary=clean_req,
            requester_agent=req_personal_ag,
            target_agents=peer_agent_objs,
            shared_files=shared_files,
        )
        if live_neg:
            if live_neg.get("compromise_title"):
                compromise_title = str(live_neg["compromise_title"])
            if live_neg.get("compromise_summary"):
                compromise_summary = str(live_neg["compromise_summary"])
            if live_neg.get("updated_shared_file_content"):
                updated_shared_content = str(
                    live_neg["updated_shared_file_content"]
                )
            if live_neg.get("requires_additional_assistance") is not None:
                needs_assistance = bool(
                    live_neg["requires_additional_assistance"]
                )
            if live_neg.get("assistance_reason"):
                assistance_reasons = [str(live_neg["assistance_reason"])]

        ticket_status = (
            "needs_assistance" if needs_assistance else "settled_by_agents"
        )
        tagged_user_ldaps = [
            pu["ldap"] for pu in participating_users[1:] if pu.get("ldap")
        ]
        creator_update_msg = (
            f"Agreed across {req_personal_ag['name']} & {peer_agent_names}: {compromise_summary}"
        )
        tagged_updates_list = [
            {
                "user_id": pu["user_id"],
                "name": pu["name"],
                "ldap": pu["ldap"],
                "agent_name": pu["personal_agent_name"],
                "update_message": (
                    f"{pu['personal_agent_name']} checked `{primary_file['filename']}` — ready for {pu['ldap']}'s sign-off."
                ),
            }
            for pu in participating_users[1:]
        ]
        routing_log.append(
            {
                "step": 3,
                "actor": "Central Workspace Agent",
                "event": (
                    f"Agents prepared a Team Agreement on `{primary_file['filename']}` for {requester_user['ldap']} "
                    f"and {', '.join(tagged_user_ldaps) or 'peer reviewers'}."
                ),
            }
        )
        debate_turns.append(
            {
                "turn_order": len(debate_turns) + 1,
                "speaker_agent_id": "workspace_agent",
                "speaker_agent_name": "Central Workspace Agent",
                "target_agent_id": req_personal_ag["id"],
                "referenced_file": primary_file["filename"],
                "message": f"Team Agreement ready for {', '.join(tagged_user_ldaps) or 'reviewers'}: {compromise_summary}",
            }
        )

        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        approvals: dict[str, dict[str, Any]] = {}
        for idx, pu in enumerate(participating_users):
            is_requester = (
                idx == 0
                or pu["user_id"] == requester_user["id"]
                or pu.get("routing_mode") == "requester"
            )
            approvals[pu["user_id"]] = {
                "user_id": pu["user_id"],
                "name": pu["name"],
                "ldap": pu["ldap"],
                "team_agent_id": pu["team_agent_id"],
                "status": "approved" if is_requester else "pending",
                "updated_at": now_str,
                "comment": (
                    f"Initiated workflow & vetted by {pu['personal_agent_name']}"
                    if is_requester
                    else f"Vetted by {pu['personal_agent_name']} — awaiting {pu['ldap']} human sign-off"
                ),
            }

        existing_ids = {t["id"] for t in self.store.list_tickets()}
        seq_num = len(existing_ids) + 101
        while f"TKT-{seq_num}" in existing_ids:
            seq_num += 1
        ticket_id = f"TKT-{seq_num}"

        new_ticket: dict[str, Any] = {
            "id": ticket_id,
            "created_at": now_str,
            "updated_at": now_str,
            "status": ticket_status,
            "title": clean_title,
            "request_summary": clean_req,
            "requester_user_id": requester_user["id"],
            "requester_user_name": requester_user["name"],
            "requester_ldap": requester_user["ldap"],
            "requester_personal_agent_id": req_personal_ag["id"],
            "requester_personal_agent_name": req_personal_ag["name"],
            "requester_team_agent_id": req_team_ag["id"],
            "requester_team_name": req_team_ag["team_name"],
            "workspace_agent_id": "workspace_agent",
            "workspace_agent_name": "Central Workspace Agent",
            "participating_users": participating_users,
            "participating_agents": participating_agents,
            "shared_files": shared_files,
            "workspace_routing_log": routing_log,
            "agent_debate_turns": debate_turns,
            "compromise_proposal": {
                "compromise_title": compromise_title,
                "compromise_summary": compromise_summary,
                "updated_shared_file_name": primary_file["filename"],
                "updated_shared_file_content": updated_shared_content,
                "initial_creator_update": creator_update_msg,
                "tagged_people_updates": tagged_updates_list,
                "requires_additional_assistance": needs_assistance,
                "assistance_reason": "; ".join(assistance_reasons)
                if assistance_reasons
                else (
                    "Requires bilateral human sign-off or adjustment across participating teams."
                    if needs_assistance
                    else ""
                ),
            },
            "approvals": approvals,
            "adjustments_log": [],
            "h2h_thread": [],
        }

        self.store.upsert_ticket(new_ticket)
        self._sync_from_store()
        self._append_turn(
            agent_id=req_team_ag["id"]
            if any(a["id"] == req_team_ag["id"] for a in AGENTS)
            else "pm_agent",
            agent_name="Central Workspace Agent",
            badge="TICKET",
            turn_type="resolved" if not needs_assistance else "hard_stop",
            message=(
                f"Created Ticket {ticket_id} ('{clean_title}'): {req_personal_ag['name']} -> Central Workspace Agent "
                f"linked [{peer_agent_names}] over shared files ({shared_filenames_str}) -> {ticket_status.upper()}."
            ),
        )
        return self.get_state()
