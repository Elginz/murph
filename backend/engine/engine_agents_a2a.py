"""Cross-Team A2A Outreach Mixin.

Implements the terminal agent's natural-language consultation
(`ask_user_agent`): the asking account's Personal Agent answers grounded in the
user's OWN uploaded files first, consults the 4 Team Agents (Policy Pack rules,
plus other teams' federated files only for the built-in Cloud / DM accounts),
and lets live Gemini synthesize the final answer when a key is configured.

Requester resolution, isolation detection and the no-Gemini fallback live in
`engine_agents_grounding.AgentGroundingMixin`; token/snippet scoring and the
12-node All-to-All Agent Mesh come from `engine_agents_mesh`.
"""

from __future__ import annotations

import datetime
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_agents_grounding
    from google3.experimental.users.efch.murph.backend.engine import engine_registration
    from google3.experimental.users.efch.murph.backend.seed import seed_data
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_agents_grounding
        from google3.experimental.users.efch.murph.backend.engine import engine_registration
        from google3.experimental.users.efch.murph.backend.seed import seed_data
    except ImportError:
        from backend.engine import engine_agents_grounding  # type: ignore
        from backend.engine import engine_registration  # type: ignore
        from backend.seed import seed_data  # type: ignore

AGENTS = seed_data.AGENTS
A2A_DOMAIN_KEYWORDS = engine_agents_grounding.A2A_DOMAIN_KEYWORDS


class AgentA2AMeshMixin(engine_agents_grounding.AgentGroundingMixin):
    """Mixin for Cross-Team Agent-to-Agent (A2A) consultation and mesh topology."""

    store: Any
    llm_client: Any
    current_user: dict[str, Any] | None
    user_agents: list[dict[str, Any]]
    user_files: list[dict[str, Any]]
    a2a_messages: list[dict[str, Any]]
    policy_packs: Any
    _ensure_personal_and_team_agent_for_user: Any
    _compute_feasibility: Any
    _append_turn: Any
    get_state: Any

    def _matched_policy_rules(
        self, team_agent_id: str, tokens: list[str]
    ) -> tuple[list[str], list[str]]:
        """Returns (rule_ids, 'RULE-ID: summary' strings) of a Team Agent's enabled rules matching the query."""
        pack = next(
            (p for p in self.policy_packs if p["agent_id"] == team_agent_id), None
        )
        if not pack:
            return [], []
        ids: list[str] = []
        summaries: list[str] = []
        for r in pack.get("rules", []):
            if not r.get("enabled", True):
                continue
            if any(t in (r["summary"] + " " + r["constraint"]).lower() for t in tokens):
                ids.append(r["id"])
                summaries.append(f"{r['id']}: {r['summary']}")
        if not ids and pack.get("rules"):
            top_r = pack["rules"][0]
            ids.append(top_r["id"])
            summaries.append(f"{top_r['id']}: {top_r['summary']}")
        return ids, summaries

    def _score_team_agent(
        self,
        t_ag: dict[str, Any],
        q_lower: str,
        tokens: list[str],
        team_files: list[dict[str, Any]],
        own_team_id: str,
    ) -> int:
        score = sum(5 for kw in A2A_DOMAIN_KEYWORDS.get(t_ag["id"], []) if kw in q_lower)
        for f_obj in team_files:
            f_score, _ = self._find_best_snippet(
                f_obj["filename"] + "\n" + f_obj["content"], tokens
            )
            score += f_score
        pack = next(
            (p for p in self.policy_packs if p["agent_id"] == t_ag["id"]), None
        )
        if pack:
            for r in pack.get("rules", []):
                if any(t in (r["summary"] + " " + r["constraint"]).lower() for t in tokens):
                    score += 3
        if score > 0 and t_ag["id"] != own_team_id:
            score += 2
        return score

    def ask_user_agent(
        self,
        question: str,
        target_team_agent_ids: list[str] | None = None,
        user_id: str | None = None,
        ldap: str = "",
        environment: str = "",
        workspace_context: str = "",
        conversation_history: list[dict[str, str]] | None = None,
        model: str = "",
    ) -> dict[str, Any]:
        """Handles a user asking their Personal Agent a question across the federated agent mesh.

        `user_id` / `ldap` / `environment` identify the asking browser account so
        the answer is grounded in *that* user's files (the server-side session is
        only a fallback). Isolated self-registered accounts never receive other
        accounts' files; the Team Agents contribute Policy Pack rules only.
        """
        clean_q = question.strip()
        if not clean_q:
            return self.get_state()

        if model and model.strip():
            self.llm_client.set_api_key(model=model.strip())
            self.store.set_setting("llm_model", self.llm_client.model)

        requester_user = self._resolve_requester_user(user_id=user_id, ldap=ldap)
        isolated = self._is_isolated_requester(requester_user, environment)
        personal_ag, own_team_ag = self._ensure_personal_and_team_agent_for_user(
            requester_user,
            team_agent_id=requester_user.get("team_agent_id", "pm_agent"),
        )
        tokens = self._extract_query_tokens(clean_q)
        q_lower = clean_q.lower()
        req_id = requester_user["id"]

        def _private_other(owner_id: Any) -> bool:
            """True when the owner is another private (Sign-Up) account."""
            return owner_id != req_id and engine_registration.is_private_account_id(owner_id)

        all_team_agents = [
            a
            for a in self.user_agents
            if a["agent_type"] == "team"
            and (a["id"] == own_team_ag["id"] or not _private_other(a.get("owner_user_id")))
        ]
        all_personal_agents = [
            a
            for a in self.user_agents
            if a["agent_type"] == "personal" and not _private_other(a.get("owner_user_id"))
        ]

        hops: list[dict[str, Any]] = []
        hop_counter = 1

        # 1. The user's OWN uploaded files are always the primary source.
        own_files = self._own_files_for(requester_user, personal_ag["id"])
        own_contexts = self._build_own_file_contexts(own_files, tokens)
        own_cited_files = [
            {
                "id": c["id"],
                "filename": c["filename"],
                "owner_ldap": c["owner_ldap"],
                "snippet": c["snippet"],
            }
            for c in own_contexts
            if c["score"] > 0
        ]
        if own_cited_files:
            hops.append(
                {
                    "hop_order": hop_counter,
                    "from_agent_id": personal_ag["id"],
                    "from_agent_name": personal_ag["name"],
                    "via_team_agent_id": own_team_ag["id"],
                    "via_team_agent_name": own_team_ag["name"],
                    "to_agent_id": personal_ag["id"],
                    "to_agent_name": f"{personal_ag['name']} (Your Uploaded Files)",
                    "to_team_name": own_team_ag["team_name"],
                    "peer_agents_consulted": [
                        f"{personal_ag['name']} ({requester_user['ldap']})"
                    ],
                    "request_message": f"Reading {requester_user['ldap']}'s own uploaded files first.",
                    "cited_files": own_cited_files,
                    "cited_rules": [],
                    "response_message": "Found in your files: "
                    + " | ".join(
                        f'`{cf["filename"]}`: "{cf["snippet"]}"' for cf in own_cited_files
                    ),
                }
            )
            hop_counter += 1

        # 2. Team Agents: Policy Pack rules for everyone; other teams' federated files only for
        # Cloud / DM, and never another private (Sign-Up) account's files.
        def _team_files(t_id: str) -> list[dict[str, Any]]:
            if isolated:
                return []
            return [
                f
                for f in self.user_files
                if f["team_agent_id"] == t_id
                and (f["visibility"] == "federated" or f["user_id"] == requester_user["id"])
                and f["user_id"] != requester_user["id"]
                and not _private_other(f.get("user_id"))
            ]

        scored_teams: list[tuple[int, dict[str, Any]]] = []
        for t_ag in all_team_agents:
            if target_team_agent_ids and t_ag["id"] in target_team_agent_ids:
                scored_teams.append((100, t_ag))
                continue
            scored_teams.append(
                (
                    self._score_team_agent(
                        t_ag, q_lower, tokens, _team_files(t_ag["id"]), own_team_ag["id"]
                    ),
                    t_ag,
                )
            )
        scored_teams.sort(key=lambda item: item[0], reverse=True)
        selected_teams = [t for s, t in scored_teams if s > 0]

        all_rule_ids: list[str] = []
        all_rule_summaries: list[str] = []
        for t_ag in selected_teams:
            t_id = t_ag["id"]
            ranked_files: list[tuple[int, dict[str, Any], str]] = []
            for f_obj in _team_files(t_id):
                f_score, snippet = self._find_best_snippet(f_obj["content"], tokens)
                ranked_files.append((f_score, f_obj, snippet))
            ranked_files.sort(key=lambda x: x[0], reverse=True)
            chosen_files = [item for item in ranked_files if item[0] > 0] or ranked_files[:1]

            cited_files_list: list[dict[str, str]] = []
            peer_agents_used: list[str] = []
            for _, f_obj, snippet in chosen_files[:3]:
                cited_files_list.append(
                    {
                        "id": f_obj["id"],
                        "filename": f_obj["filename"],
                        "owner_ldap": f_obj["user_ldap"],
                        "snippet": snippet,
                    }
                )
                peer_ag = next(
                    (pa for pa in all_personal_agents if pa["id"] == f_obj["personal_agent_id"]),
                    None,
                )
                peer_label = (
                    f"{peer_ag['name']} ({f_obj['user_ldap']})"
                    if peer_ag
                    else f"User Agent ({f_obj['user_ldap']})"
                )
                if peer_label not in peer_agents_used:
                    peer_agents_used.append(peer_label)
            if not peer_agents_used:
                if isolated:
                    peer_agents_used = [f"{t_ag['name']} (Policy Pack only)"]
                else:
                    team_peers = [
                        f"{pa['name']} ({pa['owner_ldap']})"
                        for pa in all_personal_agents
                        if pa["parent_team_agent_id"] == t_id
                    ]
                    owner_label = (
                        t_ag["name"]
                        if _private_other(t_ag.get("owner_user_id"))
                        else t_ag["owner_ldap"]
                    )
                    peer_agents_used = team_peers[:2] or [owner_label]

            matched_rule_ids, matched_rule_summaries = self._matched_policy_rules(t_id, tokens)
            for rid, rsum in zip(matched_rule_ids, matched_rule_summaries):
                if rid not in all_rule_ids:
                    all_rule_ids.append(rid)
                    all_rule_summaries.append(rsum)

            response_parts: list[str] = [
                f'From `{cf["filename"]}` (uploaded by {cf["owner_ldap"]}): "{cf["snippet"]}"'
                for cf in cited_files_list
            ]
            if matched_rule_summaries:
                response_parts.append(
                    "Policy Pack Rules: " + "; ".join(matched_rule_summaries[:2])
                )
            if t_id == "commercial_agent" and not isolated:
                feas = self._compute_feasibility()
                response_parts.append(
                    f"Live Envelope Telemetry: Budget ${feas['projected_spend']:,}/${feas['allocated_budget']:,} "
                    f"(Tolerance ${feas['tolerance_limit']:,}), Capacity {feas['required_fte']}/{feas['available_fte']} FTE, "
                    f"Schedule {feas['projected_days']}d/{feas['target_launch_days']}d."
                )
            cross_team_tag = (
                "Cross-Team A2A Request" if t_id != own_team_ag["id"] else "Intra-Team Agent Sync"
            )
            hops.append(
                {
                    "hop_order": hop_counter,
                    "from_agent_id": personal_ag["id"],
                    "from_agent_name": personal_ag["name"],
                    "via_team_agent_id": own_team_ag["id"],
                    "via_team_agent_name": own_team_ag["name"],
                    "to_agent_id": t_ag["id"],
                    "to_agent_name": t_ag["name"],
                    "to_team_name": t_ag["team_name"],
                    "peer_agents_consulted": peer_agents_used,
                    "request_message": (
                        f"[{cross_team_tag}] {personal_ag['name']} (tied to {own_team_ag['name']}) -> {t_ag['name']}: "
                        f'Requesting {"policy guidance" if isolated else "information"} from {t_ag["team_name"]} regarding: "{clean_q}"'
                    ),
                    "cited_files": cited_files_list,
                    "cited_rules": matched_rule_ids,
                    "response_message": " | ".join(response_parts)
                    if response_parts
                    else f"{t_ag['name']} confirmed no blocking constraints for this query.",
                }
            )
            hop_counter += 1

        # 3. Final answer: live Gemini when configured, otherwise the deterministic grounded fallback.
        if not hops:
            own_names = ", ".join(c["filename"] for c in own_contexts[:3]) or "none uploaded yet"
            final_answer = (
                f"{personal_ag['name']} ({requester_user.get('ldap', '')}): I'm online at your Agent Help Desk! "
                f"I didn't find a specific passage matching \"{clean_q[:80]}\" in your files ({own_names}).\n"
                "Try asking \"My workflows\", \"What is blocking launch?\", \"Open tickets\", \"Explain workflow types\", "
                "or ask a question about a specific topic in your uploaded Blue files."
            )
        elif isolated:
            final_answer = self._compose_grounded_fallback_answer(
                clean_q, personal_ag["name"], own_contexts, all_rule_summaries, isolated=True
            )
        else:
            summary_bullets = []
            for h in hops:
                files_str = (
                    ", ".join(f"`{c['filename']}`" for c in h["cited_files"])
                    if h["cited_files"]
                    else "Policy Pack"
                )
                summary_bullets.append(
                    f"- **{h['to_agent_name']}** (*{h['to_team_name']}* · consulted "
                    f"{', '.join(h['peer_agents_consulted'])} via {files_str}): {h['response_message']}"
                )
            final_answer = (
                f"**{personal_ag['name']}** (bound to **{own_team_ag['name']}**) reached out to "
                f"**{len(hops)} agent node(s)** across teams to answer your question:\n\n"
                + "\n".join(summary_bullets)
            )

        source_files = [c["filename"] for c in own_cited_files]
        for h in hops:
            for cf in h.get("cited_files", []):
                if cf["filename"] not in source_files:
                    source_files.append(cf["filename"])

        clipped_ws_ctx = str(workspace_context or "").strip()[:1500]
        live_a2a = self.llm_client.run_federated_a2a_consultation(
            question=clean_q,
            requester_agent=personal_ag,
            requester_team_agent=own_team_ag,
            candidate_hops=hops,
            own_files=own_contexts,
            policy_rules=all_rule_summaries,
            isolated=isolated,
            requester_ldap=requester_user.get("ldap", ""),
            workspace_context=clipped_ws_ctx,
            conversation_history=conversation_history,
        )
        suggested_chips: list[str] = []
        ui_action: dict[str, str] = {"action": "none", "popup_id": "", "target_title": ""}
        if live_a2a:
            if live_a2a.get("final_answer"):
                final_answer = str(live_a2a["final_answer"])
            suggested_chips = [
                str(c).strip()
                for c in live_a2a.get("suggested_chips", [])
                if str(c).strip()
            ][:4]
            if isinstance(live_a2a.get("ui_action"), dict):
                raw_act = live_a2a["ui_action"]
                ui_action = {
                    "action": str(raw_act.get("action", "none")),
                    "popup_id": str(raw_act.get("popup_id", "")),
                    "target_title": str(raw_act.get("target_title", "")),
                }
            live_sources = [str(s).strip() for s in live_a2a.get("sources", []) if str(s).strip()]
            if live_sources:
                source_files = [s for s in live_sources if not s.upper().startswith("RULE-")]
                all_rule_ids = [s for s in live_sources if s.upper().startswith("RULE-")]
            else:
                ans_lower = final_answer.lower()
                source_files = [f for f in source_files if f.lower() in ans_lower]
                all_rule_ids = [r for r in all_rule_ids if r.lower() in ans_lower]
                if not source_files and not all_rule_ids:
                    hops = []
            overrides_map = {
                ov.get("to_agent_id"): ov
                for ov in live_a2a.get("hop_Overrides", [])
                if isinstance(ov, dict)
            }
            for h in hops:
                ov = overrides_map.get(h["to_agent_id"])
                if ov:
                    if ov.get("request_message"):
                        h["request_message"] = str(ov["request_message"])
                    if ov.get("response_message"):
                        h["response_message"] = str(ov["response_message"])

        now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        a2a_record = {
            "id": f"A2A-{len(self.a2a_messages) + 1:02d}",
            "timestamp": now_str,
            "user_id": requester_user["id"],
            "user_name": requester_user["name"],
            "user_ldap": requester_user.get("ldap", ""),
            "environment": environment.strip().lower()
            or (f"user:{requester_user['id']}" if isolated else str(self.active_environment or "all")),
            "grounding_mode": "own_files" if isolated else "federated_mesh",
            "llm_live": bool(live_a2a),
            "model": self.llm_client.model,
            "personal_agent_id": personal_ag["id"],
            "personal_agent_name": personal_ag["name"],
            "team_agent_id": own_team_ag["id"],
            "team_agent_name": own_team_ag["name"],
            "question": clean_q,
            "hops": hops,
            "sources": {"files": source_files, "rules": all_rule_ids},
            "suggested_chips": suggested_chips,
            "ui_action": ui_action,
            "final_answer": final_answer,
        }
        self.store.insert_a2a_message(a2a_record)
        self.a2a_messages = self.store.get_a2a_messages()

        contacted_names = ", ".join(h["to_agent_name"] for h in hops)
        self._append_turn(
            agent_id=own_team_ag["id"]
            if any(a["id"] == own_team_ag["id"] for a in AGENTS)
            else "pm_agent",
            agent_name=personal_ag["name"],
            badge="A2A",
            turn_type="sim",
            message=(
                f"Terminal Agent Query ('{clean_q[:70]}'): {personal_ag['name']} answered from "
                f"{len(own_cited_files)} of {requester_user['ldap']}'s own file(s) and consulted [{contacted_names}]"
                f"{' (Policy Packs only — isolated workspace)' if isolated else ' including their uploaded files & Policy Packs'}."
            ),
        )
        return self.get_state()
