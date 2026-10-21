"""Agent Mesh Topology, Cross-Team A2A Outreach & Bilateral Tickets Facade Mixin.

Composes:
- `engine_agents_a2a.py` (`AgentA2AMeshMixin`): Cross-team A2A consultation & 12-node mesh topology.
- `engine_tickets_create.py` (`TicketCreateMixin`): Shared-file ticket creation & compromise synthesis.
- `engine_tickets_actions.py` (`TicketActionsMixin`): 4-action bilateral human-in-the-loop ticket workflow.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_agents_a2a
    from google3.experimental.users.efch.murph.backend.engine import engine_tickets_actions
    from google3.experimental.users.efch.murph.backend.engine import engine_tickets_create
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_agents_a2a
        from google3.experimental.users.efch.murph.backend.engine import engine_tickets_actions
        from google3.experimental.users.efch.murph.backend.engine import engine_tickets_create
    except ImportError:
        from backend.engine import engine_agents_a2a  # type: ignore
        from backend.engine import engine_tickets_actions  # type: ignore
        from backend.engine import engine_tickets_create  # type: ignore

AgentA2AMeshMixin = engine_agents_a2a.AgentA2AMeshMixin
TicketCreateMixin = engine_tickets_create.TicketCreateMixin
TicketActionsMixin = engine_tickets_actions.TicketActionsMixin


class AgentMeshAndTicketsMixin(
    AgentA2AMeshMixin, TicketCreateMixin, TicketActionsMixin
):
    """Unified Agent Mesh, Cross-Team A2A & Bilateral Tickets Mixin for PreFlightEngine."""
