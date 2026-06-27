"""The in-app AI assistant.

The assistant turns natural language into capability calls.  It has two
interchangeable backends over the *same* capability registry:

* :class:`ClaudeBackend` — uses the Anthropic SDK's tool-use loop with
  ``claude-opus-4-8``.  The model decides which capabilities to call and with
  what arguments; we execute them against the shared :class:`AppState` and feed
  the results back until it produces a final answer.
* :class:`OfflineBackend` — a deterministic keyword/intent parser over the same
  registry, so the assistant still works on an air-gapped machine with no API
  key (the spec requires the app run fully offline).

Both return an :class:`AssistantReply` (text + the list of actions taken), so
the GUI renders them identically.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from steam_assignment import METHODS
from .state import AppState, DEMAND_SOURCES
from .capabilities import CapabilityRegistry, build_registry

MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = """\
You are the assistant inside STEAM 2040 Studio, a desktop traffic-modelling
application for the Abu Dhabi STEAM 2040 network. You help a transport planner
operate the software by calling the provided tools — loading data, changing
settings, running traffic assignments (free-flow, incremental BPR, MSA,
Frank-Wolfe user equilibrium), inspecting KPIs and congested links, testing
scenarios (lane upgrades, new roads), generating improvement recommendations,
and aggregating the zone system under barrier/span contiguity rules.

Guidance:
- Prefer calling tools to actually perform the work rather than just describing it.
- If the user asks for an outcome ("which corridors are worst?", "make the ring
  road 3 lanes and tell me the benefit"), chain the necessary tool calls.
- Frank-Wolfe is the most rigorous assignment; use it unless the user asks
  otherwise. Use the loaded OD matrix when available, else the land-use gravity
  model.
- After acting, give a concise, planner-friendly summary of what changed and the
  key numbers. Don't invent values the tools didn't return.
"""


@dataclass
class Action:
    capability: str
    params: dict
    result: str


@dataclass
class AssistantReply:
    text: str
    actions: list = field(default_factory=list)
    backend: str = ""


# ---------------------------------------------------------------------------
# Claude backend
# ---------------------------------------------------------------------------

class ClaudeBackend:
    """Anthropic tool-use loop over the capability registry."""

    name = "claude"

    def __init__(self, state: AppState, registry: CapabilityRegistry,
                 api_key: str | None = None, model: str = MODEL,
                 max_steps: int = 12):
        import anthropic  # raises if the SDK is unavailable
        self.state = state
        self.registry = registry
        self.model = model
        self.max_steps = max_steps
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
        self._history: list[dict] = []

    def respond(self, user_text: str) -> AssistantReply:
        self._history.append({"role": "user", "content": user_text})
        tools = self.registry.tools()
        actions: list[Action] = []
        final_text: list[str] = []

        for _ in range(self.max_steps):
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=tools,
                messages=self._history,
            )
            # Record the assistant turn verbatim so tool_use ids line up.
            self._history.append({"role": "assistant", "content": resp.content})

            for block in resp.content:
                if block.type == "text":
                    final_text.append(block.text)

            if resp.stop_reason != "tool_use":
                break

            tool_results = []
            for block in resp.content:
                if block.type != "tool_use":
                    continue
                result = self.registry.invoke(self.state, block.name, dict(block.input))
                actions.append(Action(block.name, dict(block.input), result))
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
            self._history.append({"role": "user", "content": tool_results})

        return AssistantReply("\n".join(final_text).strip(), actions, self.name)


# ---------------------------------------------------------------------------
# Offline backend
# ---------------------------------------------------------------------------

class OfflineBackend:
    """Deterministic intent parser — no network required."""

    name = "offline"

    def __init__(self, state: AppState, registry: CapabilityRegistry):
        self.state = state
        self.registry = registry

    def respond(self, user_text: str) -> AssistantReply:
        t = user_text.lower().strip()
        plan = self._plan(t, user_text)
        if not plan:
            return AssistantReply(
                "I couldn't map that to an action. Try: 'run frank-wolfe', "
                "'show KPIs', 'top congested links', 'aggregate to 1800 zones', "
                "'upgrade link 12345 by 2 lanes', or 'status'.",
                backend=self.name)
        actions = []
        replies = []
        for name, params in plan:
            result = self.registry.invoke(self.state, name, params)
            actions.append(Action(name, params, result))
            replies.append(result)
        return AssistantReply("\n".join(replies), actions, self.name)

    # ---- intent matching -------------------------------------------------
    def _plan(self, t: str, raw: str) -> list[tuple[str, dict]]:
        plan: list[tuple[str, dict]] = []

        if any(w in t for w in ("status", "what's loaded", "what is loaded", "summary")):
            plan.append(("status", {}))
            return plan

        if "connectivity" in t or "disconnected" in t:
            return [("connectivity_check", {})]

        # QA audit on its own (don't re-aggregate).
        if ("qa" in t or "audit" in t) and not re.search(r"\d", t) \
                and self.state.aggregation is not None:
            return [("aggregation_qa", {})]

        # Aggregation.
        if "aggregat" in t or ("merge" in t and "zone" in t):
            params = {}
            m = re.search(r"(\d[\d,]{2,})\s*(?:zones|clusters)?", t)
            if m:
                params["target_zone_count"] = int(m.group(1).replace(",", ""))
            if "freeway" in t or "fwy" in t:
                params["barrier_threshold"] = "fwy"
            elif "arterial" in t or "art" in t:
                params["barrier_threshold"] = "art"
            elif "collector" in t or "coll" in t:
                params["barrier_threshold"] = "coll"
            sp = re.search(r"(\d+(?:\.\d+)?)\s*km", t)
            if sp:
                params["max_span_m"] = float(sp.group(1)) * 1000.0
            if "dynamic" in t:
                params["method"] = "dynamic"
            plan.append(("aggregate_zones", params))
            if "qa" in t or "audit" in t:
                plan.append(("aggregation_qa", {}))
            return plan

        # Recommendations.
        if "recommend" in t or "find solution" in t or "improvement" in t:
            return [("recommend", {"method": self._method(t)})]

        # Scenario.
        if "upgrade" in t and "link" in t:
            lid = re.search(r"link\s*(\d+)", t)
            lanes = re.search(r"(\d+)\s*lane", t)
            if lid:
                params = {"link_id": int(lid.group(1))}
                if lanes:
                    params["add_lanes"] = int(lanes.group(1))
                plan.append(("upgrade_link", params))
                if "run" in t or "scenario" in t or "benefit" in t:
                    plan.append(("run_scenario", {"method": self._method(t)}))
                return plan
        if "scenario" in t and "run" in t:
            return [("run_scenario", {"method": self._method(t)})]
        if t.startswith("undo"):
            return [("undo_edit", {})]

        # Settings.
        m = re.search(r"set\s+([a-z_]+)\s+(?:to\s+)?(-?\d+(?:\.\d+)?)", t)
        if m:
            return [("set_setting", {"name": m.group(1), "value": float(m.group(2))})]

        # KPIs / top links.
        if "top" in t and ("congest" in t or "link" in t):
            n = re.search(r"top\s*(\d+)", t)
            return [("top_congested_links", {"n": int(n.group(1)) if n else 10})]
        if "kpi" in t or "vht" in t or "vmt" in t or "speed" in t:
            plan.append(("network_kpis", {}))

        # Assignment.
        if "assign" in t or "run" in t or any(m in t for m in
                ("frank", "wolfe", "msa", "incremental", "free-flow", "free flow", "equilibrium")):
            params = {"method": self._method(t)}
            src = self._source(t)
            if src:
                params["demand_source"] = src
            plan.insert(0, ("run_assignment", params))
            if not plan or plan[-1][0] != "network_kpis":
                plan.append(("network_kpis", {}))

        # de-dup consecutive
        deduped = []
        for item in plan:
            if not deduped or deduped[-1] != item:
                deduped.append(item)
        return deduped

    @staticmethod
    def _method(t: str) -> str:
        if "frank" in t or "wolfe" in t or "equilibrium" in t or "ue" in t:
            return METHODS[3]
        if "msa" in t:
            return METHODS[2]
        if "increment" in t:
            return METHODS[1]
        if "free" in t or "all-or-nothing" in t or "aon" in t:
            return METHODS[0]
        return METHODS[3]

    @staticmethod
    def _source(t: str) -> str | None:
        if "gravity" in t or "land-use" in t or "land use" in t:
            return DEMAND_SOURCES[1]
        if "all-ones" in t or "all ones" in t or "ones" in t:
            return DEMAND_SOURCES[2]
        if "matrix" in t or "od" in t:
            return DEMAND_SOURCES[0]
        return None


# ---------------------------------------------------------------------------
# Facade
# ---------------------------------------------------------------------------

class Assistant:
    """Picks a backend automatically and exposes one ``chat`` method."""

    def __init__(self, state: AppState, registry: CapabilityRegistry | None = None,
                 prefer: str = "auto", api_key: str | None = None):
        self.state = state
        self.registry = registry or build_registry()
        self.backend = self._make_backend(prefer, api_key)

    def _make_backend(self, prefer: str, api_key: str | None):
        want_claude = prefer in ("auto", "claude")
        have_key = bool(api_key or os.environ.get("ANTHROPIC_API_KEY"))
        if want_claude and have_key:
            try:
                return ClaudeBackend(self.state, self.registry, api_key=api_key)
            except Exception:
                if prefer == "claude":
                    raise
        return OfflineBackend(self.state, self.registry)

    @property
    def backend_name(self) -> str:
        return self.backend.name

    def chat(self, text: str) -> AssistantReply:
        return self.backend.respond(text)
