"""Offline copilot: a deterministic grammar + synonym map turning plain-language
instructions into one or more typed commands (spec section 5). This is the
air-gapped default and the fallback when no LLM is configured.

``interpret`` returns a list of {"command", "params"} dicts. Multiple commands
chained with "then"/"and then"/","/"," are split and parsed in order.
"""
from __future__ import annotations

import re
from typing import List, Dict

# synonym -> canonical method
METHOD_WORDS = {
    "equilibrium": "fw", "user equilibrium": "fw", "ue": "fw",
    "frank-wolfe": "fw", "frank wolfe": "fw", "fw": "fw",
    "free-flow": "aon", "free flow": "aon", "all-or-nothing": "aon",
    "all or nothing": "aon", "aon": "aon",
    "incremental": "bpr", "bpr": "bpr",
    "msa": "msa", "averages": "msa",
}
PERIOD_WORDS = {
    "am peak": "am_peak", "am-peak": "am_peak", "morning": "am_peak",
    "off peak": "off_peak", "off-peak": "off_peak",
    "24 hour": "daily", "24-hour": "daily", "daily": "daily", "all day": "daily",
}
DEMAND_WORDS = {
    "matrix": "od", "od": "od", "loaded matrix": "od", "trip table": "od",
    "land use": "gravity", "land-use": "gravity", "gravity": "gravity",
    "all ones": "ones", "all-ones": "ones",
}
BARRIER_WORDS = {
    "freeway": "fwy", "freeways": "fwy", "motorway": "fwy",
    "arterial": "art", "arterials": "art",
    "collector": "coll", "collectors": "coll",
}


def _find(text, table):
    for phrase, val in sorted(table.items(), key=lambda kv: -len(kv[0])):
        if phrase in text:
            return val
    return None


def _num(text, pattern, cast=float, default=None):
    m = re.search(pattern, text)
    return cast(m.group(1)) if m else default


def interpret(text: str) -> List[Dict]:
    text = text.strip()
    parts = re.split(r"\bthen\b|\band then\b|;|, then|, and", text, flags=re.I)
    cmds: List[Dict] = []
    ctx = {"built_gravity": False}        # carried across "then"-split clauses
    for part in parts:
        cmds.extend(_interpret_clause(part.lower().strip(), ctx))
    return cmds


def _interpret_clause(t: str, ctx: dict) -> List[Dict]:
    if not t:
        return []

    # --- navigation (check before assignment: "assignment workspace") ------
    if re.search(r"workspace|\bview\b|\btab\b|go to|open|switch to", t):
        for ws in ("network", "aggregation", "assignment"):
            if ws in t:
                return [{"command": "goto_workspace", "params": {"name": ws}}]
    if "fit" in t and "view" in t:
        return [{"command": "fit_view", "params": {}}]

    # --- queries -----------------------------------------------------------
    if re.search(r"\bvht\b|vehicle hours", t):
        return [{"command": "query", "params": {"metric": "vht"}}]
    if re.search(r"\bvmt\b|vehicle (kil|mil)", t):
        return [{"command": "query", "params": {"metric": "vmt"}}]
    if re.search(r"average speed|avg speed", t):
        return [{"command": "query", "params": {"metric": "avg_speed"}}]
    if re.search(r"over[- ]?capacity", t):
        return [{"command": "query", "params": {"metric": "over_capacity"}}]
    if re.search(r"zone count|how many zones", t):
        return [{"command": "query", "params": {"metric": "zone_count"}}]

    _has_assign = bool(re.search(
        r"assign|equilibrium|free[- ]?flow|frank|\bmsa\b|incremental", t))
    # worst corridors (+ optional recommend). If the same clause also asks to
    # run an assignment, fall through so both commands are emitted in order.
    if (re.search(r"worst|top|most congested", t)
            and re.search(r"corridor|link|road", t) and not _has_assign):
        out = [{"command": "query", "params": {"metric": "top_links"}}]
        if "recommend" in t or "fix" in t:
            out.append({"command": "recommend", "params": {"depth": "quick"}})
        return out
    if "recommend" in t and not _has_assign:
        depth = "deep" if "deep" in t or "thorough" in t else "quick"
        return [{"command": "recommend", "params": {"depth": depth,
                                                     "greedy": "programme" in t or "program" in t}}]

    # --- aggregation -------------------------------------------------------
    if "aggregate" in t or "merge zones" in t or re.search(r"reduce.*zones", t):
        target = _num(t, r"to\s+([\d,]+)\s*zones?", lambda s: int(s.replace(",", "")))
        if target is None:
            target = _num(t, r"([\d,]+)\s*zones?", lambda s: int(s.replace(",", "")))
        barrier = _find(t, BARRIER_WORDS) or "coll"
        # "don't cross collectors" / "avoiding collectors"
        span = _num(t, r"max\s+([\d.]+)\s*km", lambda s: float(s) * 1000)
        if span is None:
            span = _num(t, r"([\d.]+)\s*km", lambda s: float(s) * 1000)
        params = {"barrier": barrier}
        if target is not None:
            params["target"] = target
        if span is not None:
            params["max_span_m"] = span
        return [{"command": "aggregate", "params": params}]

    # --- gravity build -----------------------------------------------------
    cmds: List[Dict] = []
    if re.search(r"demand from land[- ]?use|build.*gravity|land[- ]?use.*demand", t):
        gp = {}
        rpop = _num(t, r"([\d.]+)\s*(?:trips? )?per (?:resident|person|capita)")
        if rpop is not None:
            gp["r_pop"] = rpop
        beta = _num(t, r"beta\s*([\d.]+)")
        if beta is not None:
            gp["beta"] = beta
        cmds.append({"command": "build_gravity_demand", "params": gp})
        ctx["built_gravity"] = True

    # --- assignment --------------------------------------------------------
    if re.search(r"assign|run|equilibrium|free[- ]?flow|frank|msa|incremental", t) \
            and "aggregate" not in t:
        method = _find(t, METHOD_WORDS) or "fw"
        period = _find(t, PERIOD_WORDS)
        demand = _find(t, DEMAND_WORDS)
        if demand is None:
            # default to gravity if gravity demand was built in this or a prior clause
            demand = "gravity" if (cmds or ctx.get("built_gravity")) else "od"
        params = {"method": method, "demand": demand}
        if period:
            params["period"] = period
        sample = _num(t, r"sample\s+(\d+)", int)
        if sample is not None:
            params["sample"] = sample
        cmds.append({"command": "run_assignment", "params": params})
        # same-clause "and show the top N congested corridors" / "recommend"
        if re.search(r"worst|top|most congested", t) and \
                re.search(r"corridor|link|road", t):
            cmds.append({"command": "query", "params": {"metric": "top_links"}})
        if "recommend" in t or "suggest fixes" in t:
            cmds.append({"command": "recommend", "params": {"depth": "quick"}})
        return cmds

    if cmds:
        return cmds

    # --- colour ------------------------------------------------------------
    if re.search(r"colou?r by|show", t):
        for word, mode in (("volume", "volume"), ("v/c", "vc"), ("vc", "vc"),
                           ("los", "los"), ("diff", "diff")):
            if word in t:
                return [{"command": "colour_by", "params": {"mode": mode}}]

    if "demo" in t or "sample network" in t:
        return [{"command": "load_demo", "params": {}}]

    return []  # unrecognised -> caller falls back to LLM or asks to rephrase
