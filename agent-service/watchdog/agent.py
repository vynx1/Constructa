"""Compliance Watchdog — the single Fetch.ai uAgent (BUILD_PLAN §6).

One job: given a project's condition list and a step number, return which
conditions are active or at risk. Deterministic and fast; in production this
runs continuously in Agentverse, the demo surfaces its output per step.

The uAgent wiring (uagents.Agent) drops in here; `active_conditions` is the
pure function the agent and the HTTP endpoint both call.
"""
from __future__ import annotations


def active_conditions(project_id: str, step: int) -> tuple[list[dict], list[dict]]:
    """Return (conditions, alerts) active at the given build step.

    Stub: replace with a lookup against the project's cached condition list in
    Redis (`project:{id}:sequence`).
    """
    conditions: list[dict] = []
    alerts: list[dict] = []
    return conditions, alerts
