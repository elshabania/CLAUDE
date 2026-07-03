"""Facility classification from the 2040 link-type code (``LTYPE_2040``).

The bands and the protected (non-road) set come straight from Part 1 of the
build spec.  ``FACILITY_CLASSES`` fixes a stable integer code per class so the
network arrays can store the class as a small int rather than a string.
"""

from __future__ import annotations

# Stable order -> integer code used throughout the engine and the cache.
FACILITY_CLASSES = ["fwy", "ramp", "art", "coll", "local", "rural", "junc"]
CLASS_CODE = {name: i for i, name in enumerate(FACILITY_CLASSES)}
CODE_CLASS = {i: name for name, i in CLASS_CODE.items()}

# Link types that are transit / walk / connector / special and must never enter
# the road assignment.
PROTECTED_LTYPES = frozenset({60, 61, 62, 63, 65, 70, 71, 72, 73, 99, 100})

# A sentinel class code for "not a road" so callers can filter on it.
NONROAD = -1


def classify_ltype(ltype: int) -> int:
    """Return the facility-class integer code for an ``LTYPE_2040`` value.

    Returns :data:`NONROAD` for protected/unknown types so the caller can drop
    the link from the routable graph.
    """
    if ltype in PROTECTED_LTYPES:
        return NONROAD
    if 1 <= ltype <= 9:
        return CLASS_CODE["fwy"]
    if 10 <= ltype <= 15:
        return CLASS_CODE["ramp"]
    if 20 <= ltype <= 21:
        return CLASS_CODE["art"]
    if 22 <= ltype <= 27:
        return CLASS_CODE["coll"]
    if 28 <= ltype <= 29:
        return CLASS_CODE["local"]
    if 30 <= ltype <= 39:
        return CLASS_CODE["rural"]
    if 40 <= ltype <= 44:
        return CLASS_CODE["junc"]
    return NONROAD


def class_name(code: int) -> str:
    """Human-readable class name for a class code (or ``"none"``)."""
    return CODE_CLASS.get(int(code), "none")


# Barrier ranking for the aggregation engine: a link is a barrier if its class
# is "at least as major as" the selected threshold.  Lower rank = more major.
BARRIER_RANK = {
    "fwy": 0,
    "ramp": 1,
    "art": 2,
    "coll": 3,
    "rural": 3,
    "local": 4,
    "junc": 5,
}


def barrier_classes_for(threshold: str) -> set[int]:
    """Return the set of class codes that act as barriers for a threshold.

    ``threshold`` is one of ``"fwy"`` (freeways only), ``"art"`` (arterials and
    above) or ``"coll"`` (collectors and above, the default).
    """
    cutoff = BARRIER_RANK[threshold]
    return {CLASS_CODE[name] for name, rank in BARRIER_RANK.items()
            if rank <= cutoff and name in CLASS_CODE}
