"""Deterministic Feasibility Math, Escalation Governance & Deliverable Compiler Facade Mixin.

Composes:
- `engine_feasibility.py` (`FeasibilityAndWhatIfMixin`): Deterministic PSO Rate Card math & What-If simulator.
- `engine_scrub.py` (`GovernanceAndDeliverablesMixin`): 4-agent document scrubbing, auto-fix, escalation sign-off & deliverables.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_feasibility
    from google3.experimental.users.efch.murph.backend.engine import engine_scrub
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_feasibility
        from google3.experimental.users.efch.murph.backend.engine import engine_scrub
    except ImportError:
        from backend.engine import engine_feasibility  # type: ignore
        from backend.engine import engine_scrub  # type: ignore

FeasibilityAndWhatIfMixin = engine_feasibility.FeasibilityAndWhatIfMixin
GovernanceAndDeliverablesMixin = engine_scrub.GovernanceAndDeliverablesMixin


class FeasibilityAndAnalysisMixin(
    FeasibilityAndWhatIfMixin, GovernanceAndDeliverablesMixin
):
    """Unified Feasibility, What-If, Document Scrub & Deliverables Mixin for PreFlightEngine."""
