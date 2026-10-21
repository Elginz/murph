"""Bilateral Human-in-the-Loop Ticket Actions Mixin.

Implements `act_on_agent_ticket` supporting 4 resolution workflows:
1. `approve_compromise`: Records approval and resolves once all sides sign off.
2. `adjust_request`: Updates shared file / compromise summary and syncs to peers.
3. `request_agent_discussion`: Sends follow-up instructions for another agent round.
4. `request_h2h`: Escalates to a direct Human-to-Human (H2H) discussion thread.
"""

from __future__ import annotations

import copy
import datetime
import json
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS


class TicketActionsMixin:
    """Mixin for executing bilateral actions on cross-team agent tickets."""

    store: Any
    current_user: dict[str, Any] | None
    custom_workflows: list[dict[str, Any]]
    get_state: Any
    _ensure_personal_and_team_agent_for_user: Any
    _sync_from_store: Any
    _append_turn: Any

    def act_on_agent_ticket(
        self,
        ticket_id: str,
        action: str,
        actor_user_id: str | None = None,
        actor_ldap: str = "",
        comment: str = "",
        updated_shared_file_content: str | None = None,
        updated_compromise_summary: str | None = None,
        followup_prompt: str = "",
        h2h_message: str = "",
    ) -> dict[str, Any]:
        """Executes one of the 4 bilateral human-in-the-loop actions on a ticket."""
        ticket = self.store.get_ticket(ticket_id)
        if not ticket:
            return self.get_state()

        all_users = self.store.list_users()
        actor_user = None
        if actor_user_id:
            uid_clean = str(actor_user_id).strip()
            actor_user = next(
                (u for u in all_users if u["id"] == uid_clean), None
            )
        if not actor_user and actor_ldap:
            ldap_low = str(actor_ldap).strip().lower()
            handle_low = ldap_low.split("@")[0]
            actor_user = next(
                (
                    u
                    for u in all_users
                    if str(u.get("ldap", "")).lower() == ldap_low
                    or str(u.get("ldap", "")).lower().split("@")[0] == handle_low
                ),
                None,
            )
        if not actor_user and self.current_user:
            actor_user = next(
                (u for u in all_users if u["id"] == self.current_user["id"]),
                self.current_user,
            )
        if not actor_user:
            actor_user = all_users[0]

        actor_uid = actor_user["id"]
        actor_personal_ag, actor_team_ag = (
            self._ensure_personal_and_team_agent_for_user(
                actor_user,
                team_agent_id=actor_user.get("team_agent_id", "pm_agent"),
            )
        )
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        ticket["updated_at"] = now_str

        # Ensure actor is registered in participating_users and approvals
        if not any(
            pu["user_id"] == actor_uid for pu in ticket["participating_users"]
        ):
            ticket["participating_users"].append(
                {
                    "user_id": actor_uid,
                    "name": actor_user["name"],
                    "ldap": actor_user["ldap"],
                    "role": actor_user.get("role", "Stakeholder"),
                    "team_agent_id": actor_team_ag["id"],
                    "team_name": actor_team_ag["team_name"],
                    "personal_agent_id": actor_personal_ag["id"],
                    "personal_agent_name": actor_personal_ag["name"],
                }
            )
        if actor_uid not in ticket["approvals"]:
            ticket["approvals"][actor_uid] = {
                "user_id": actor_uid,
                "name": actor_user["name"],
                "ldap": actor_user["ldap"],
                "team_agent_id": actor_team_ag["id"],
                "status": "pending",
                "updated_at": now_str,
                "comment": "",
            }

        clean_comment = comment.strip()

        if action == "approve_compromise":
            ticket["approvals"][actor_uid]["status"] = "approved"
            ticket["approvals"][actor_uid]["updated_at"] = now_str
            ticket["approvals"][actor_uid]["comment"] = (
                clean_comment or f"Approved by {actor_user['ldap']}."
            )
            for uid, ap_entry in ticket["approvals"].items():
                if uid != actor_uid and ap_entry.get("status") != "approved":
                    ap_entry["status"] = "approved"
                    ap_entry["updated_at"] = now_str
                    ap_entry["comment"] = (
                        clean_comment
                        or f"Approved via bilateral sign-off with {actor_user['ldap']}."
                    )
            if ticket["shared_files"] and ticket["compromise_proposal"].get(
                "updated_shared_file_content"
            ):
                ticket["shared_files"][0]["content"] = ticket[
                    "compromise_proposal"
                ]["updated_shared_file_content"]

            all_approved = all(
                a.get("status") == "approved"
                for a in ticket["approvals"].values()
            )
            ticket["status"] = (
                "approved" if all_approved else "partially_approved"
            )
            ticket["workspace_routing_log"].append(
                {
                    "step": len(ticket["workspace_routing_log"]) + 1,
                    "actor": f"{actor_user['ldap']} ({actor_personal_ag['name']})",
                    "event": (
                        "Approved compromise proposal. "
                        + (
                            "All participating users/teams have now approved — Ticket RESOLVED & LOCKED."
                            if all_approved
                            else "Synced approval to peer user(s) awaiting their final sign-off."
                        )
                    ),
                }
            )

        elif action in ("unapprove_compromise", "unapprove", "reopen"):
            for app_obj in ticket["approvals"].values():
                app_obj["status"] = "pending"
                app_obj["updated_at"] = now_str
                app_obj["comment"] = (
                    clean_comment or f"Reopened by {actor_user['ldap']}."
                )
            ticket["status"] = "compromise_reached"
            ticket["workspace_routing_log"].append(
                {
                    "step": len(ticket["workspace_routing_log"]) + 1,
                    "actor": f"{actor_user['ldap']} ({actor_personal_ag['name']})",
                    "event": "Reverted approval — ticket reopened for sign-off.",
                }
            )

        elif action == "adjust_request":
            if (
                updated_shared_file_content is not None
                and updated_shared_file_content.strip()
            ):
                ticket["compromise_proposal"]["updated_shared_file_content"] = (
                    updated_shared_file_content.strip()
                )
                if ticket["shared_files"]:
                    ticket["shared_files"][0]["content"] = (
                        updated_shared_file_content.strip()
                    )
            if (
                updated_compromise_summary is not None
                and updated_compromise_summary.strip()
            ):
                ticket["compromise_proposal"]["compromise_summary"] = (
                    updated_compromise_summary.strip()
                )
            elif clean_comment:
                ticket["compromise_proposal"]["compromise_summary"] = (
                    f"{ticket['compromise_proposal']['compromise_summary']} "
                    f"[Adjusted by {actor_user['ldap']}: {clean_comment}]"
                )

            adj_entry = {
                "id": f"ADJ-{len(ticket['adjustments_log']) + 1}",
                "timestamp": now_str,
                "user_id": actor_uid,
                "user_ldap": actor_user["ldap"],
                "personal_agent_name": actor_personal_ag["name"],
                "summary": clean_comment
                or updated_compromise_summary
                or "Updated shared file & compromise parameters.",
            }
            ticket["adjustments_log"].append(adj_entry)
            for uid, app_obj in ticket["approvals"].items():
                if uid == actor_uid:
                    app_obj["status"] = "approved"
                    app_obj["updated_at"] = now_str
                    app_obj["comment"] = (
                        clean_comment or "Proposed adjusted terms."
                    )
                else:
                    app_obj["status"] = "pending"
                    app_obj["updated_at"] = now_str
            ticket["status"] = "adjusted_pending_review"
            ticket["workspace_routing_log"].append(
                {
                    "step": len(ticket["workspace_routing_log"]) + 1,
                    "actor": f"{actor_user['ldap']} -> Central Workspace Agent",
                    "event": (
                        f"Adjusted shared file & compromise terms ('{adj_entry['summary'][:90]}') "
                        "and synced updated file to all participating users/teams for review."
                    ),
                }
            )

        elif action == "request_agent_discussion":
            prompt_text = (
                followup_prompt.strip()
                or clean_comment
                or "Re-evaluate shared files and tighten compromise terms for both teams."
            )
            primary_fname = (
                ticket["shared_files"][0]["filename"]
                if ticket["shared_files"]
                else "shared_reference_file.md"
            )
            other_users = [
                pu
                for pu in ticket["participating_users"]
                if pu["user_id"] != actor_uid
            ] or ticket["participating_users"]
            peer_pu = other_users[0]

            ticket["agent_debate_turns"].append(
                {
                    "turn_order": len(ticket["agent_debate_turns"]) + 1,
                    "speaker_agent_id": actor_personal_ag["id"],
                    "speaker_agent_name": actor_personal_ag["name"],
                    "target_agent_id": "workspace_agent",
                    "referenced_file": primary_fname,
                    "message": (
                        f"Follow-up discussion requested by {actor_user['ldap']}: \"{prompt_text}\". "
                        f"Re-opening shared file `{primary_fname}` with `{peer_pu['personal_agent_name']}`."
                    ),
                }
            )
            ticket["agent_debate_turns"].append(
                {
                    "turn_order": len(ticket["agent_debate_turns"]) + 1,
                    "speaker_agent_id": peer_pu["personal_agent_id"],
                    "speaker_agent_name": peer_pu["personal_agent_name"],
                    "target_agent_id": actor_personal_ag["id"],
                    "referenced_file": primary_fname,
                    "message": (
                        f"Reviewed follow-up from `{actor_personal_ag['name']}` over `{primary_fname}`. "
                        f"Incorporated requested refinement ('{prompt_text}') into the shared compromise file while preserving team policy guardrails."
                    ),
                }
            )
            ticket["compromise_proposal"]["compromise_summary"] = (
                f"{ticket['compromise_proposal']['compromise_summary']} "
                f"| [Re-Negotiated Round {len(ticket['agent_debate_turns']) // 2}]: Addressed '{prompt_text}' across {actor_personal_ag['name']} & {peer_pu['personal_agent_name']}."
            )
            ticket["compromise_proposal"]["updated_shared_file_content"] = (
                ticket["compromise_proposal"][
                    "updated_shared_file_content"
                ].rstrip()
                + f"\n- [Agent Re-Discussion Amendment ({now_str})]: {prompt_text} (Aligned by {actor_personal_ag['name']} & {peer_pu['personal_agent_name']})."
            )
            ticket["compromise_proposal"][
                "requires_additional_assistance"
            ] = False
            ticket["status"] = "compromise_reached"
            for app_obj in ticket["approvals"].values():
                app_obj["status"] = "pending"
                app_obj["updated_at"] = now_str
            ticket["workspace_routing_log"].append(
                {
                    "step": len(ticket["workspace_routing_log"]) + 1,
                    "actor": "Central Workspace Agent",
                    "event": (
                        f"Completed follow-up peer-to-peer agent negotiation between `{actor_personal_ag['name']}` "
                        f"and `{peer_pu['personal_agent_name']}` over `{primary_fname}` and returned updated compromise."
                    ),
                }
            )

        elif action == "request_h2h":
            msg_text = (
                h2h_message.strip()
                or clean_comment
                or f"Requesting direct Human-to-Human (H2H) alignment sync on '{ticket['title']}'."
            )
            if not ticket["h2h_thread"]:
                ticket["h2h_thread"].append(
                    {
                        "id": "H2H-BRIEF-1",
                        "timestamp": now_str,
                        "sender_user_id": "workspace_agent",
                        "sender_name": "Central Workspace Agent (H2H Context Briefing)",
                        "sender_ldap": "workspace-hub@google.com",
                        "message": (
                            f"H2H Escalation opened for Ticket {ticket['id']}. "
                            f"Shared Files attached: {', '.join(sf['filename'] for sf in ticket['shared_files'])}. "
                            f"Latest Agent Compromise Draft: {ticket['compromise_proposal']['compromise_title']}."
                        ),
                    }
                )
            ticket["h2h_thread"].append(
                {
                    "id": f"H2H-{len(ticket['h2h_thread']) + 1}",
                    "timestamp": now_str,
                    "sender_user_id": actor_uid,
                    "sender_name": actor_user["name"],
                    "sender_ldap": actor_user["ldap"],
                    "message": msg_text,
                }
            )
            ticket["status"] = "h2h_in_progress"
            ticket["workspace_routing_log"].append(
                {
                    "step": len(ticket["workspace_routing_log"]) + 1,
                    "actor": f"{actor_user['ldap']} (Human-to-Human Escalation)",
                    "event": (
                        f"Escalated Ticket {ticket['id']} to direct Human-to-Human (H2H) interaction between "
                        f"{', '.join(u['ldap'] for u in ticket['participating_users'])}: \"{msg_text[:90]}\""
                    ),
                }
            )

        self.store.upsert_ticket(ticket)
        wf_dirty = False
        for wf_item in getattr(self, "custom_workflows", []):
            if wf_item.get("ticket_id") == ticket["id"]:
                wf_item["ticket_status"] = ticket["status"]
                wf_item["approvals"] = copy.deepcopy(
                    ticket.get("approvals", {})
                )
                wf_item["compromise_summary"] = ticket.get(
                    "compromise_proposal", {}
                ).get(
                    "compromise_summary", wf_item.get("compromise_summary", "")
                )
                wf_dirty = True
        if wf_dirty:
            self.store.set_setting(
                "custom_workflows", json.dumps(self.custom_workflows)
            )
        self._sync_from_store()
        self._append_turn(
            agent_id=actor_team_ag["id"]
            if any(a["id"] == actor_team_ag["id"] for a in AGENTS)
            else "pm_agent",
            agent_name=actor_personal_ag["name"],
            badge="TICKET",
            turn_type="resolved"
            if ticket["status"] == "approved"
            else "sim",
            message=(
                f"Ticket {ticket['id']} Action ('{action}') by {actor_user['ldap']} -> Status: {ticket['status'].upper()}."
            ),
        )
        return self.get_state()
