// Headless test harness for lib/dxf-layer-rules.ts.
// Runs the matcher against a corpus of layer names taken from common CAD
// naming conventions in masterplan/transport CAD deliverables, and reports
// hit-rate per category. No DXF needed.
import { DEFAULT_LAYER_RULES, classifyLayers, parseLaneHint } from "@/lib/dxf-layer-rules";

// Each entry: [layerName, expectedCategoryOrNull, optionalExpectedRole].
// `null` expectedCategory means "intentionally non-road, should not match".
type Case = [string, string | null, string?];
const cases: Case[] = [
  // --- bridges & tunnels ---
  ["BR_RAMP",                 "bridge_ramp", "centerline"],
  ["BRG_RAMP_N",              "bridge_ramp", "centerline"],
  ["BRIDGE-RAMP-E",           "bridge_ramp", "centerline"],
  ["RD_BRIDGE",               "bridge",      "centerline"],
  ["BRG_OVERPASS",            "bridge",      "centerline"],
  ["TN_RAMP_S",               "tunnel_ramp", "centerline"],
  ["TUNNEL_RAMP",             "tunnel_ramp", "centerline"],
  ["TN_MAIN",                 "tunnel",      "centerline"],
  ["TUNNEL_NORTH",            "tunnel",      "centerline"],
  // --- access classes ---
  ["EMERG_ACCESS",            "emergency_access", "centerline"],
  ["EM_RD",                   "emergency_access", "centerline"],
  ["APT_ACCESS",              "apartment_access", "centerline"],
  ["RES_ACC_RD",              "apartment_access", "centerline"],
  ["TX_LAYBY",                "taxi_layby",       "centerline"],
  ["TAXI_STOP",               "taxi_layby",       "centerline"],
  ["BUS_BAY",                 "shuttle_layby",    "centerline"],
  ["SH_LAYBY",                "shuttle_layby",    "centerline"],
  ["PLOT_ACCESS",             "plot_access",      "centerline"],
  ["PL_ACC_RD",               "plot_access",      "centerline"],
  ["ACCESS_ROAD",             "plot_access",      "centerline"],
  // --- main carriageway ---
  ["RD_CL_ROW_MAJOR",         "road_row",  "centerline"],
  ["RD-CL-ROW-2",             "road_row",  "centerline"],
  ["ROAD_CENTRELINE_ROW",     "road_row",  "centerline"],
  ["RD_CENTERLINE_PLOT",      "road_plot", "centerline"],
  ["RD_CL_PL_N",              "road_plot", "centerline"],
  ["ROAD_CL",                 "road_row",  "centerline"],
  ["ROW",                     "road_row",  "centerline"],
  ["RIGHT_OF_WAY",            "road_row",  "centerline"],
  ["RD_MAIN",                 "road_plot", "centerline"],
  ["ROAD_LOCAL",              "road_plot", "centerline"],
  ["CARRIAGEWAY",             "road_plot", "polygon"],
  ["CWAY_E",                  "road_plot", "polygon"],
  // --- kerbs / edges ---
  ["KERB_LINE",               "road_plot", "edge"],
  ["CURB",                    "road_plot", "edge"],
  ["EOP_N",                   "road_plot", "edge"],
  ["EDGE_OF_PAVEMENT",        "road_plot", "edge"],
  // --- junctions ---
  ["RNDABT_25M",              "road_row",  "junction"],
  ["ROUNDABOUT_MAIN",         "road_row",  "junction"],
  ["RA_N",                    "road_row",  "junction"],
  ["SIGNAL_HEADS",            "road_row",  "junction"],
  ["JUNCTION_T1",             "road_row",  "junction"],
  ["INTERSECT_E",             "road_row",  "junction"],
  // --- ignored ---
  ["DIM_LAYER",               "other",     "ignore"],
  ["TEXT_NOTES",              "other",     "ignore"],
  ["HATCH_GREEN",             "other",     "ignore"],
  ["LEGEND",                  "other",     "ignore"],
  ["TITLE_BLOCK",             "other",     "ignore"],
  ["NORTH_ARROW",             "other",     "ignore"],
  ["GRID",                    "other",     "ignore"],
  // --- truly unrelated (should NOT match) ---
  ["BUILDING_OUTLINES",       null],
  ["LANDSCAPE_TREES",         null],
  ["WATER_BODIES",            null],
  ["PARCEL_BOUNDARY",         null],
  ["UTILITIES_ELECTRIC",      null],
];

const { byLayer } = classifyLayers(cases.map((c) => c[0]));

let pass = 0;
let fail = 0;
const failures: string[] = [];
for (const [layer, expectedCat, expectedRole] of cases) {
  const m = byLayer.get(layer);
  const actualCat = m ? m.category : null;
  const actualRole = m ? m.role : null;
  const catOk = actualCat === expectedCat;
  const roleOk = !expectedRole || actualRole === expectedRole;
  if (catOk && roleOk) {
    pass++;
  } else {
    fail++;
    failures.push(
      `  ${layer.padEnd(28)} expected=${String(expectedCat).padEnd(18)}/${expectedRole ?? "-"} ` +
        `got=${String(actualCat).padEnd(18)}/${actualRole ?? "-"}` +
        (m ? `  (rule#${m.ruleIndex} ${m.rulePattern})` : "  (no match)")
    );
  }
}

console.log(`Layer-rule matcher: ${pass}/${cases.length} pass, ${fail} fail`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log(f);
}

// Lane-hint parser.
const laneCases: Array<[string, number | null]> = [
  ["RD_4LN_DUAL", 2],
  ["RD_2LN", 1],
  ["MAIN_6LN_DUAL", 3],
  ["A_3L", 2],
  ["RD_8LANE_DUAL", 4],
  ["NO_NUMBERS_HERE", null],
];
let lanePass = 0;
for (const [name, exp] of laneCases) {
  const got = parseLaneHint(name);
  const ok = got === exp;
  if (ok) lanePass++;
  console.log(`  lanes ${name.padEnd(22)} exp=${exp}\tgot=${got}\t${ok ? "OK" : "FAIL"}`);
}
console.log(`Lane hint: ${lanePass}/${laneCases.length}`);
console.log(`Default rule count: ${DEFAULT_LAYER_RULES.length}`);

process.exit(fail === 0 && lanePass === laneCases.length ? 0 : 1);
