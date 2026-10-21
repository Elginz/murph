"""Seed Data & Enterprise Templates Facade (`seed_data.py`).

Modularized into 3 focused seed submodules:
1. `seed_agents_and_files.py`: `AGENTS`, `PERSONAS`, `INITIAL_USER_AGENTS`,
   and `INITIAL_USER_FILES`.
2. `seed_tickets_and_a2a.py`: `INITIAL_A2A_MESSAGES` and `INITIAL_AGENT_TICKETS`.
3. `seed_policies_and_scenarios.py`: `PSO_RATE_CARD`, `POLICY_PACKS`, `SCENARIOS`,
   `WHAT_IF_PRESETS`, `INITIAL_MEMORY_LOG`, and `_default_debate_turns()`.

Re-exports all symbols so `from seed_data import ...` and `seed_data.<SYMBOL>`
work seamlessly across the entire backend.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.seed import seed_agents_and_files
    from google3.experimental.users.efch.murph.backend.seed import seed_policies_and_scenarios
    from google3.experimental.users.efch.murph.backend.seed import seed_tickets_and_a2a
else:
    try:
        from google3.experimental.users.efch.murph.backend.seed import seed_agents_and_files
        from google3.experimental.users.efch.murph.backend.seed import seed_policies_and_scenarios
        from google3.experimental.users.efch.murph.backend.seed import seed_tickets_and_a2a
    except ImportError:
        from backend.seed import seed_agents_and_files  # type: ignore
        from backend.seed import seed_policies_and_scenarios  # type: ignore
        from backend.seed import seed_tickets_and_a2a  # type: ignore


AGENTS = seed_agents_and_files.AGENTS
PERSONAS = seed_agents_and_files.PERSONAS
INITIAL_USER_AGENTS = seed_agents_and_files.INITIAL_USER_AGENTS
INITIAL_USER_FILES = seed_agents_and_files.INITIAL_USER_FILES
CLOUD_ACCOUNT_LDAP = seed_agents_and_files.CLOUD_ACCOUNT_LDAP
DM_ACCOUNT_LDAP = seed_agents_and_files.DM_ACCOUNT_LDAP
DEMO_ACCOUNT_PASSWORD = seed_agents_and_files.DEMO_ACCOUNT_PASSWORD
DEMO_ACCOUNT_LDAPS = seed_agents_and_files.DEMO_ACCOUNT_LDAPS
LEGACY_ACCOUNT_LDAP_MAP = seed_agents_and_files.LEGACY_ACCOUNT_LDAP_MAP
is_dm_account_ldap = seed_agents_and_files.is_dm_account_ldap

INITIAL_A2A_MESSAGES = seed_tickets_and_a2a.INITIAL_A2A_MESSAGES
INITIAL_AGENT_TICKETS = seed_tickets_and_a2a.INITIAL_AGENT_TICKETS

PSO_RATE_CARD = seed_policies_and_scenarios.PSO_RATE_CARD
POLICY_PACKS = seed_policies_and_scenarios.POLICY_PACKS
SCENARIOS = seed_policies_and_scenarios.SCENARIOS
WHAT_IF_PRESETS = seed_policies_and_scenarios.WHAT_IF_PRESETS
INITIAL_MEMORY_LOG = seed_policies_and_scenarios.INITIAL_MEMORY_LOG
_default_debate_turns = seed_policies_and_scenarios._default_debate_turns

__all__ = [
    "AGENTS",
    "PERSONAS",
    "INITIAL_USER_AGENTS",
    "INITIAL_USER_FILES",
    "CLOUD_ACCOUNT_LDAP",
    "DM_ACCOUNT_LDAP",
    "DEMO_ACCOUNT_PASSWORD",
    "DEMO_ACCOUNT_LDAPS",
    "LEGACY_ACCOUNT_LDAP_MAP",
    "is_dm_account_ldap",
    "INITIAL_A2A_MESSAGES",
    "INITIAL_AGENT_TICKETS",
    "PSO_RATE_CARD",
    "POLICY_PACKS",
    "SCENARIOS",
    "WHAT_IF_PRESETS",
    "INITIAL_MEMORY_LOG",
    "_default_debate_turns",
]
