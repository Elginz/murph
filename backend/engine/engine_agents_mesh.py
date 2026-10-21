"""Agent Mesh Topology & Token/Snippet Scoring Mixin.

Provides token extraction (`_extract_query_tokens`), file snippet scoring
(`_find_best_snippet`), and the 12-node All-to-All Agent Mesh builder
(`_build_all_to_all_agent_mesh`).
"""

from __future__ import annotations

import copy
import re
from typing import Any


class AgentMeshTopologyMixin:
    """Mixin for query token extraction, snippet scoring, and all-to-all agent mesh."""

    user_agents: list[dict[str, Any]]
    user_files: list[dict[str, Any]]

    def _extract_query_tokens(self, text: str) -> list[str]:
        stopwords = {
            "what",
            "when",
            "where",
            "which",
            "who",
            "whom",
            "whose",
            "why",
            "how",
            "can",
            "could",
            "would",
            "should",
            "will",
            "does",
            "did",
            "are",
            "is",
            "was",
            "were",
            "have",
            "has",
            "had",
            "the",
            "and",
            "for",
            "with",
            "that",
            "this",
            "from",
            "into",
            "about",
            "our",
            "your",
            "their",
            "there",
            "need",
            "know",
            "tell",
            "ask",
            "agent",
            "team",
            "teams",
            "other",
            "any",
            "all",
            "some",
            "under",
            "over",
        }
        raw_words = re.findall(r"[a-z0-9_$-]{2,}", text.lower())
        return [w for w in raw_words if w not in stopwords]

    def _find_best_snippet(
        self, content: str, tokens: list[str]
    ) -> tuple[int, str]:
        """Scores a file's content against query tokens and returns (match_score, best_snippet)."""
        lines = [
            ln.strip(" -*\t")
            for ln in content.splitlines()
            if ln.strip(" -*\t") and not ln.strip().startswith("#")
        ]
        if not lines:
            lines = [content.strip()[:240]]

        best_line = lines[0]
        best_score = 0
        for ln in lines:
            ln_lower = ln.lower()
            score = sum(3 for t in tokens if t in ln_lower)
            if score > best_score:
                best_score = score
                best_line = ln

        total_doc_score = sum(2 for t in tokens if t in content.lower())
        return best_score + total_doc_score, best_line[:280]

    def _find_top_snippets(
        self, content: str, tokens: list[str], limit: int = 3
    ) -> tuple[int, list[str]]:
        """Like `_find_best_snippet` but returns up to `limit` relevant lines (in document order).

        Lines that match at least one query token win; if nothing matches, the
        first non-heading lines of the document are returned so a short file
        (e.g. a sign-up starter reference) is still surfaced in full.
        """
        lines = [
            ln.strip(" -*\t")
            for ln in content.splitlines()
            if ln.strip(" -*\t") and not ln.strip().startswith("#")
        ]
        if not lines:
            lines = [content.strip()[:240]] if content.strip() else []
        # Short function words ("to", "of") substring-match inside unrelated
        # words ("cus-to-mer"); only digit-bearing short tokens like "q4" count.
        sig_tokens = [
            t for t in tokens if len(t) >= 3 or any(ch.isdigit() for ch in t)
        ] or tokens
        scored = [
            (sum(3 for t in sig_tokens if t in ln.lower()), idx, ln)
            for idx, ln in enumerate(lines)
        ]
        matched = sorted(
            (s for s in scored if s[0] > 0), key=lambda s: (-s[0], s[1])
        )[:limit]
        chosen = sorted(matched, key=lambda s: s[1]) if matched else scored[:limit]
        best_line_score = max((s[0] for s in scored), default=0)
        total_doc_score = sum(2 for t in sig_tokens if t in content.lower())
        return best_line_score + total_doc_score, [s[2][:280] for s in chosen]

    def _build_all_to_all_agent_mesh(self) -> dict[str, Any]:
        """Builds the all-to-all connected agent mesh topology coordinated by the Central Workspace Agent."""
        agents_list = copy.deepcopy(self.user_agents)
        central = next(
            (a for a in agents_list if a["id"] == "workspace_agent"),
            {
                "id": "workspace_agent",
                "agent_type": "workspace",
                "name": "Central Workspace Agent",
                "owner_user_id": "persona_creator",
                "owner_ldap": "workspace-hub@google.com",
                "team_id": "team_workspace_hub",
                "team_name": "Murph Central Workspace Orchestration Hub",
                "parent_team_agent_id": "workspace_agent",
                "specialty": "Central Matchmaker & Shared-File Session Broker",
                "badge": "HUB-AG",
            },
        )
        nodes: list[dict[str, Any]] = []
        for ag in agents_list:
            f_count = sum(
                1
                for f in self.user_files
                if f["personal_agent_id"] == ag["id"]
                or f["team_agent_id"] == ag["id"]
            )
            nodes.append(
                {
                    "id": ag["id"],
                    "name": ag["name"],
                    "agent_type": ag["agent_type"],
                    "owner_user_id": ag["owner_user_id"],
                    "owner_ldap": ag["owner_ldap"],
                    "team_id": ag["team_id"],
                    "team_name": ag["team_name"],
                    "parent_team_agent_id": ag["parent_team_agent_id"],
                    "badge": ag["badge"],
                    "specialty": ag["specialty"],
                    "file_count": f_count,
                }
            )

        edges: list[dict[str, str]] = []
        n_count = len(nodes)
        for i in range(n_count):
            for j in range(i + 1, n_count):
                a1 = nodes[i]
                a2 = nodes[j]
                if "workspace_agent" in (a1["id"], a2["id"]):
                    edge_type = "hub_link"
                elif (
                    a1["parent_team_agent_id"] == a2["id"]
                    or a2["parent_team_agent_id"] == a1["id"]
                ):
                    edge_type = "team_binding"
                else:
                    edge_type = "peer_mesh"
                edges.append(
                    {
                        "from_agent_id": a1["id"],
                        "to_agent_id": a2["id"],
                        "edge_type": edge_type,
                    }
                )

        return {
            "central_agent": central,
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
