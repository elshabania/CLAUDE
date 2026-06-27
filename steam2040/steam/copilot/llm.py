"""Optional LLM copilot hook (spec section 5).

If an OpenAI-compatible base URL + API key are configured in Settings, free-form
phrasing is routed through tool/function calling with the command schema as the
tool list. Every produced command is still validated against the schema before
dispatch, and the offline interpreter remains the air-gapped default — the LLM
is never required.

This module deliberately keeps the network call thin and dependency-free
(uses urllib) so it adds nothing to the offline bundle.
"""
from __future__ import annotations

import json
import urllib.request
from typing import List, Dict, Optional

from ..commands import COMMAND_SCHEMA


def _tools_from_schema():
    tools = []
    for name, params in COMMAND_SCHEMA.items():
        props = {k: {"type": _json_type(v)} for k, v in params.items()}
        tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": f"STEAM 2040 command '{name}'.",
                "parameters": {"type": "object", "properties": props},
            },
        })
    return tools


def _json_type(py):
    return {str: "string", int: "integer", float: "number",
            bool: "boolean", dict: "object", list: "array"}.get(py, "string")


def interpret_llm(text: str, base_url: str, api_key: str,
                  model: str = "gpt-4o-mini") -> Optional[List[Dict]]:
    """Return a list of {command, params} from the LLM, or None on any failure
    (caller then falls back to the offline interpreter)."""
    if not base_url or not api_key:
        return None
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content":
             "You translate transportation-modelling requests into STEAM 2040 "
             "commands by calling the provided tools. Call one tool per action; "
             "chain multiple tool calls for multi-step requests."},
            {"role": "user", "content": text},
        ],
        "tools": _tools_from_schema(),
        "tool_choice": "auto",
    }).encode()
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions", data=body,
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        calls = data["choices"][0]["message"].get("tool_calls") or []
        out = []
        for c in calls:
            fn = c["function"]
            out.append({"command": fn["name"],
                        "params": json.loads(fn.get("arguments") or "{}")})
        return out or None
    except Exception:
        return None
