// Layer-aware DXF road classifier.
//
// A DXF carries something the PDF threw away: NAMED LAYERS. A polyline on
// layer `RD_CL_ROW_MAJOR` IS a centerline; on `BRIDGE_RAMP` it's a bridge
// ramp. So instead of reverse-engineering structure from rasterised fills
// (the PDF pipeline), we just read the layer name and look it up.
//
// Patterns are intentionally LOOSE (case-insensitive regex, common
// abbreviations) because every consultant's CAD standard differs slightly.
// A user-editable `extraPatterns` argument can override or extend the defaults
// without touching the table here.
//
// Output is just a `Record<layerName, RoadCategory | null>`. `null` means
// "matched no rule" — the layer is non-road (or unrecognised) and the user
// can re-tag it in the UI. Nothing crashes when patterns miss.

import type { RoadCategory } from "@/lib/road-detect";

/** Hint to the network builder for what a matched layer's polylines mean. */
export type LayerRole =
  | "centerline" // polyline on this layer IS the road centerline → use directly
  | "edge" // road edge / kerb polyline → feed to extractor as boundary
  | "polygon" // closed road footprint polygon → fill-mode skeletonize
  | "junction" // block-insert location is a junction node
  | "ignore"; // not road geometry (annotation, dimensions, hatch)

export interface LayerRule {
  /** Compiled regex tested against the layer name (case-insensitive). */
  pattern: RegExp;
  /** Road category the layer maps to. */
  category: RoadCategory;
  /** What the polylines on this layer SEMANTICALLY are. */
  role: LayerRole;
  /** Optional lane count baked into the layer name (e.g. `RD_4LN`). */
  lanesPerDirHint?: number;
  /** Human-readable origin of this rule, shown in the layer table. */
  source: "default" | "user";
}

export interface LayerMatch {
  layer: string;
  category: RoadCategory;
  role: LayerRole;
  lanesPerDirHint?: number;
  /** Index of the matched rule (for diagnostics in the UI table). */
  ruleIndex: number;
  /** Source pattern (for diagnostics). */
  rulePattern: string;
}

/**
 * Default patterns covering the layer-naming conventions I have seen on
 * masterplan/transport CAD deliverables. Order matters: first match wins, so
 * MORE-SPECIFIC patterns come before MORE-GENERAL ones (e.g. bridge_ramp
 * before bridge, plot_access before access). When in doubt, add a more
 * specific rule via `extraPatterns` in the call rather than reordering here.
 */
export const DEFAULT_LAYER_RULES: ReadonlyArray<Omit<LayerRule, "source">> = [
  // --- bridges & tunnels (specific first) ---
  { pattern: /(?:^|[_\-\s])(?:br(?:idge)?[_\-\s]?ramp|brg[_\-\s]?ramp)/i, category: "bridge_ramp", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:br(?:idge)?|brg)(?:[_\-\s]|$)/i, category: "bridge", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:tu?n(?:nel)?[_\-\s]?ramp|tn[_\-\s]?ramp)/i, category: "tunnel_ramp", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:tu?n(?:nel)?|tn)(?:[_\-\s]|$)/i, category: "tunnel", role: "centerline" },

  // --- access classes (specific first: emergency / apartment / taxi / shuttle / plot) ---
  { pattern: /(?:em(?:erg(?:ency)?)?)[_\-\s]?(?:acc(?:ess)?|rd)/i, category: "emergency_access", role: "centerline" },
  { pattern: /(?:ap(?:t|artment)|res(?:i(?:dential)?)?)[_\-\s]?(?:acc(?:ess)?|rd)/i, category: "apartment_access", role: "centerline" },
  { pattern: /(?:taxi|tx)[_\-\s]?(?:la?yby|stop|drop)/i, category: "taxi_layby", role: "centerline" },
  { pattern: /(?:shuttle|sh|bus)[_\-\s]?(?:la?yby|stop|bay)/i, category: "shuttle_layby", role: "centerline" },
  { pattern: /(?:plot|pl)[_\-\s]?(?:acc(?:ess)?|rd)/i, category: "plot_access", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:acc(?:ess)?[_\-\s]?(?:rd|road)?)(?:[_\-\s]|$)/i, category: "plot_access", role: "centerline" },

  // --- main carriageway: right-of-way / plot road / generic road ---
  { pattern: /(?:^|[_\-\s])(?:rd|road)[_\-\s]?(?:cl|centerline|centreline|cline)[_\-\s]?(?:row|ro?w)/i, category: "road_row", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:rd|road)[_\-\s]?(?:cl|centerline|centreline|cline)[_\-\s]?(?:plot|pl)/i, category: "road_plot", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:rd|road)[_\-\s]?(?:cl|centerline|centreline|cline)/i, category: "road_row", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:row|right[_\-\s]?of[_\-\s]?way)(?:[_\-\s]|$)/i, category: "road_row", role: "centerline" },
  { pattern: /(?:^|[_\-\s])(?:rd|road)(?:[_\-\s]|$)/i, category: "road_plot", role: "centerline" },
  { pattern: /(?:carriageway|carriage[_\-\s]?way|cway)/i, category: "road_plot", role: "polygon" },

  // --- kerb / edge of pavement → feed to skeletonizer as boundary ---
  { pattern: /(?:^|[_\-\s])(?:kerb|curb|eop|edge[_\-\s]?of[_\-\s]?(?:pa?ve?ment|road))/i, category: "road_plot", role: "edge" },

  // --- junctions (block-references) ---
  { pattern: /(?:^|[_\-\s])(?:rndabt|roundabt|roundabout|ra)(?:[_\-\s]|$)/i, category: "road_row", role: "junction" },
  { pattern: /(?:^|[_\-\s])(?:signal|sig|tjunc|junc(?:tion)?|intersect)(?:[_\-\s]|$)/i, category: "road_row", role: "junction" },

  // --- explicit ignore (annotation / dimensions / hatch / text) ---
  { pattern: /(?:^|[_\-\s])(?:dim|text|annot(?:ation)?|note|hatch|grid|north|title|border|leg(?:end)?)(?:[_\-\s]|$)/i, category: "other", role: "ignore" },
];

/** Compiled-with-source variant for the working ruleset. */
function withSource(rules: ReadonlyArray<Omit<LayerRule, "source">>, source: "default" | "user"): LayerRule[] {
  return rules.map((r) => ({ ...r, source }));
}

/**
 * Match a layer name against the rules, returning the first hit (or null if
 * no rule matched). Also attempts to parse a lane-count hint from the layer
 * name independently (e.g. `RD_4LN_DUAL` → lanesPerDirHint = 2 for a dual
 * 4-lane carriageway, or 4 if `DUAL` is absent → conservatively `Math.max(1,
 * round(total/2))`).
 */
export function matchLayer(layer: string, rules: ReadonlyArray<LayerRule>): LayerMatch | null {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.pattern.test(layer)) {
      const lanes = parseLaneHint(layer);
      return {
        layer,
        category: r.category,
        role: r.role,
        lanesPerDirHint: r.lanesPerDirHint ?? lanes ?? undefined,
        ruleIndex: i,
        rulePattern: String(r.pattern),
      };
    }
  }
  return null;
}

/**
 * Parse a lane-count hint from common naming conventions:
 *   `RD_4LN_DUAL` → 2 lanes/direction (4 total, halved)
 *   `RD_2LN`      → 1 lane/direction
 *   `_3L_`        → 3 lanes total → 2 per direction (round up half)
 * Returns null when the layer has no such marker.
 */
export function parseLaneHint(layer: string): number | null {
  const m = layer.match(/[_\-\s](\d)\s?(?:LN|L|LANE|LANES)[_\-\s]?(DUAL|2WAY|TWOWAY|2W)?/i);
  if (!m) return null;
  const total = parseInt(m[1], 10);
  if (!Number.isFinite(total) || total < 1 || total > 8) return null;
  const isDual = Boolean(m[2]);
  // "4LN_DUAL" = 4 lanes total, 2 per direction. Bare "3L" = 3 total, 2/dir.
  return isDual ? Math.max(1, Math.round(total / 2)) : Math.max(1, Math.ceil(total / 2));
}

export interface BuildRulesArgs {
  /** Extra rules added BEFORE the defaults so user patterns can override. */
  extraPatterns?: ReadonlyArray<Omit<LayerRule, "source">>;
  /** Suppress a subset of the defaults by their position in DEFAULT_LAYER_RULES. */
  disableDefaultIndexes?: ReadonlyArray<number>;
}

/** Build the working rule list: user patterns first, then defaults. */
export function buildRules(args: BuildRulesArgs = {}): LayerRule[] {
  const user = withSource(args.extraPatterns ?? [], "user");
  const disabled = new Set(args.disableDefaultIndexes ?? []);
  const def = withSource(
    DEFAULT_LAYER_RULES.filter((_, i) => !disabled.has(i)),
    "default"
  );
  return [...user, ...def];
}

/**
 * Classify every distinct layer name in a DXF in one pass. Returns a
 * Record keyed by the raw layer name (so the caller can look up per-entity
 * without re-running the regex sweep) plus a summary table for the UI.
 */
export function classifyLayers(
  layerNames: Iterable<string>,
  args: BuildRulesArgs = {}
): {
  /** Per-layer match (null for unmatched / non-road). */
  byLayer: Map<string, LayerMatch | null>;
  /** Sorted summary suitable for a layer-rules table in the UI. */
  summary: Array<{ layer: string; match: LayerMatch | null }>;
  /** The rules that were actually used (for showing in the UI). */
  rules: LayerRule[];
} {
  const rules = buildRules(args);
  const byLayer = new Map<string, LayerMatch | null>();
  for (const name of layerNames) {
    if (byLayer.has(name)) continue;
    byLayer.set(name, matchLayer(name, rules));
  }
  const summary = Array.from(byLayer.entries())
    .map(([layer, match]) => ({ layer, match }))
    .sort((a, b) => a.layer.localeCompare(b.layer));
  return { byLayer, summary, rules };
}
