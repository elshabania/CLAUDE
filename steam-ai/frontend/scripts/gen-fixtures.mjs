// Deterministic synthetic fixtures for VITE_USE_MOCK=1.
// ~200 links in WGS84 around lon 54.4 / lat 24.45 and 15 findings.
// Run: npm run fixtures
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mock', 'fixtures');
mkdirSync(out, { recursive: true });

let seed = 20260922;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + (b - a) * rnd();
const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const RUN = 'run_2035_ref_v4';
const BASE = 'run_2035_ref_v3';
const PERIODS = [
  { code: 'AM', hours: 3, load: 0.78 },
  { code: 'MD', hours: 6, load: 0.42 },
  { code: 'PM', hours: 3, load: 0.84 },
  { code: 'EV', hours: 4, load: 0.36 },
  { code: 'NT', hours: 8, load: 0.11 },
];
const CLASSES = { ALL: 1, CAR: 0.78, TAXI: 0.12, HGV: 0.1 };
const CLASS_SPEC = {
  FWY: { lanes: [3, 4], capPerLane: 2000, ffs: 120 },
  EXP: { lanes: [2, 3], capPerLane: 1800, ffs: 100 },
  ART: { lanes: [2, 3], capPerLane: 900, ffs: 80 },
  COL: { lanes: [1, 2], capPerLane: 700, ffs: 60 },
  LOC: { lanes: [1, 1], capPerLane: 500, ffs: 40 },
};

// --- nodes: 10 x 6 jittered grid --------------------------------------------
const COLS = 10, ROWS = 6;
const lon0 = 54.34, lat0 = 24.42, dlon = 0.0135, dlat = 0.0115;
const nodes = [];
for (let j = 0; j < ROWS; j++) {
  for (let i = 0; i < COLS; i++) {
    nodes.push({
      node_id: String(1000 + j * COLS + i),
      lon: r(lon0 + i * dlon + between(-0.002, 0.002), 6),
      lat: r(lat0 + j * dlat + between(-0.0015, 0.0015), 6),
      area_type: i < 3 ? 'SUBURBAN' : i < 7 ? 'URBAN' : 'CBD',
    });
  }
}
const nodeAt = (i, j) => nodes[j * COLS + i];

// --- links ------------------------------------------------------------------
const links = [];
let linkSeq = 1;
function addPair(a, b, cls, curve) {
  const spec = CLASS_SPEC[cls];
  const lanes = spec.lanes[Math.floor(rnd() * spec.lanes.length)];
  const mid = [(a.lon + b.lon) / 2 + (curve ? curve[0] : 0), (a.lat + b.lat) / 2 + (curve ? curve[1] : 0)];
  const length = haversine(a, b) * (curve ? 1.05 : 1);
  for (const [from, to, flip] of [[a, b, false], [b, a, true]]) {
    const id = String(20000 + linkSeq++);
    const coords = curve ? [[from.lon, from.lat], [mid[0], mid[1]], [to.lon, to.lat]] : [[from.lon, from.lat], [to.lon, to.lat]];
    // offset opposite direction slightly so both carriageways are visible
    const off = flip ? 0.00025 : -0.00025;
    const dx = to.lon - from.lon, dy = to.lat - from.lat, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * off, ny = dx / len * off;
    links.push({
      link_id: id,
      a_node: from.node_id,
      b_node: to.node_id,
      length_m: Math.round(length),
      link_class: cls,
      area_type: from.area_type,
      lanes,
      capacity_vph: lanes * spec.capPerLane,
      ffs_kph: spec.ffs,
      oneway: true,
      toll_point: false,
      junction_type: null,
      sector_id: `S${1 + Math.floor((from.lon - lon0) / (dlon * 3.5))}`,
      coordinates: coords.map(([x, y]) => [r(x + nx, 6), r(y + ny, 6)]),
    });
  }
}
function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// horizontals: row 2 is a freeway, row 4 an expressway, others arterial/collector
for (let j = 0; j < ROWS; j++) {
  for (let i = 0; i < COLS - 1; i++) {
    const cls = j === 2 ? 'FWY' : j === 4 ? 'EXP' : j % 2 ? 'COL' : 'ART';
    addPair(nodeAt(i, j), nodeAt(i + 1, j), cls, j === 2 ? [0, between(-0.001, 0.001)] : null);
  }
}
// verticals: columns 1, 4, 7 arterial; others local/collector (sparser)
for (let i = 0; i < COLS; i++) {
  for (let j = 0; j < ROWS - 1; j++) {
    if (![1, 4, 7].includes(i) && rnd() < 0.2) continue;
    const cls = [1, 4, 7].includes(i) ? 'ART' : rnd() < 0.5 ? 'COL' : 'LOC';
    addPair(nodeAt(i, j), nodeAt(i, j + 1), cls, null);
  }
}

// --- flows ------------------------------------------------------------------
const flows = [];
const planted = { 20014: 1.36, 20037: 1.18, 20051: 1.12, 20088: 0.97, 20103: 0.96, 20122: 0.02 };
for (const l of links) {
  const bias = between(0.55, 1.25);
  for (const p of PERIODS) {
    let vc = p.load * bias * between(0.85, 1.15);
    if (planted[l.link_id] !== undefined && (p.code === 'AM')) vc = planted[l.link_id];
    if (planted[l.link_id] !== undefined && p.code === 'PM') vc = planted[l.link_id] * 0.93;
    const hourly = vc * l.capacity_vph;
    const all = hourly * p.hours;
    let speed = l.ffs_kph / (1 + 0.15 * vc ** 4);
    if (l.link_id === '20166' && p.code === 'AM') speed = l.ffs_kph * 1.12; // speed above free-flow defect
    const congTime = (l.length_m / 1000) / speed * 3600;
    const ffTime = (l.length_m / 1000) / l.ffs_kph * 3600;
    for (const [uc, share] of Object.entries(CLASSES)) {
      flows.push({
        link_id: l.link_id, period: p.code, user_class: uc,
        volume: Math.round(all * share),
        vc_ratio: r(vc * (uc === 'ALL' ? 1 : share), 3),
        cong_time_s: r(congTime, 1),
        cong_speed_kph: r(speed, 1),
        delay_s: r(Math.max(0, congTime - ffTime), 1),
      });
    }
  }
}

// --- findings ---------------------------------------------------------------
const byId = Object.fromEntries(links.map((l) => [l.link_id, l]));
const nodeById = Object.fromEntries(nodes.map((n) => [n.node_id, n]));
const flowOf = (id, p) => flows.find((f) => f.link_id === id && f.period === p && f.user_class === 'ALL');
const centre = (l) => { const c = l.coordinates; const m = c[Math.floor(c.length / 2)]; return { lon: m[0], lat: m[1] }; };
const now = '2026-09-22T06:41:12Z';
const SRC = (file, row, table, column) => ({ file, row, table, column });

function linkFinding(fid, linkId, severity, period, extra = {}) {
  const l = byId[linkId], f = flowOf(linkId, period), c = centre(l);
  return {
    finding_id: fid, run_id: RUN, check_id: 'link_volume_outliers', check_name: 'Link volume outliers', severity,
    location: { type: 'link', id: linkId, label: `${l.link_class} ${l.a_node}→${l.b_node}`, lon: c.lon, lat: c.lat },
    executive_line: extra.exec ?? `Link ${linkId} (${l.link_class}, ${l.lanes} lanes) carries ${Math.round(f.vc_ratio * 100)}% of its capacity in the ${period} peak, ${severity === 'Critical' ? 'well beyond' : 'above'} what the road can serve.`,
    modeller_view: `V/C ${f.vc_ratio} on ${l.link_class} link ${linkId} (${l.a_node}→${l.b_node}) in ${period}, user_class ALL: volume ${f.volume} over ${period} (${Math.round(f.volume / PERIODS.find(p => p.code === period).hours)} veh/h) against capacity ${l.capacity_vph} veh/h. Peer group ${l.link_class} x ${l.area_type} x ${period} median V/C 0.71. Congested speed ${f.cong_speed_kph} km/h against free-flow ${l.ffs_kph} km/h.`,
    evidence: {
      values: { vc_ratio: f.vc_ratio, volume: f.volume, capacity_vph: l.capacity_vph, lanes: l.lanes, cong_speed_kph: f.cong_speed_kph, abs_zscore: r(2.1 + f.vc_ratio * 1.4, 2) },
      thresholds: { vc_critical: 1.3, vc_high: 1.1, vc_medium: 0.95, zscore_threshold: 3.0 },
      sources: [SRC('outputs/loaded_AM.dbf', 1300 + Number(linkId) - 20000, 'link_flows', 'volume'), SRC('inputs/network/links.dbf', Number(linkId) - 20000, 'links', 'capacity_vph')],
      period,
      query: `SELECT f.link_id, f.volume, f.vc_ratio, l.capacity_vph, l.lanes\nFROM link_flows f JOIN links l USING (run_id, link_id)\nWHERE f.run_id = '${RUN}' AND f.period = '${period}' AND f.user_class = 'ALL'\n  AND f.link_id = '${linkId}'`,
    },
    likely_cause: extra.cause ?? 'Capacity coded below the observed cross-section, or a parallel route missing from the network so demand funnels onto this link.',
    suggested_action: extra.action ?? 'Verify lanes and capacity_vph against the aerial imagery and the 2035 committed scheme list; check that the parallel corridor is coded and connected.',
    measures: extra.measures ?? [],
    is_significant: extra.sig ?? true,
    created_at: now,
  };
}

const findings = [
  linkFinding('F-0001', '20014', 'Critical', 'AM', {
    measures: [
      { measure_id: 'M-0001-a', title: 'Recode capacity to 4 lanes', description: 'Set lanes = 4 and capacity_vph = 8000 on link 20014 to match the committed widening scheme (ITC scheme register #214).', estimated_effect: 'V/C falls from 1.36 to about 1.02 in AM; downstream link 20016 gains around 900 veh over the period.', effect_values: { vc_after: 1.02, delta_volume_20016: 900 }, method: 'sketch_elasticity', confidence: 'medium' },
      { measure_id: 'M-0001-b', title: 'Queue a STEAM rerun with the parallel arterial connected', description: 'Node 1023 to 1024 arterial is coded one-way; a rerun with two-way coding will confirm whether demand reroutes.', estimated_effect: null, effect_values: {}, method: 'steam_rerun', confidence: 'low' },
    ],
  }),
  linkFinding('F-0002', '20037', 'High', 'AM', {
    measures: [{ measure_id: 'M-0002-a', title: 'Check the ramp meter assumption', description: 'The 2035 reference assumes ramp metering on this freeway section; confirm the capacity uplift in the parameter register.', estimated_effect: 'V/C about 1.08 if the uplift is applied.', effect_values: { vc_after: 1.08 }, method: 'surrogate', confidence: 'low' }],
  }),
  linkFinding('F-0003', '20051', 'High', 'PM'),
  {
    finding_id: 'F-0004', run_id: RUN, check_id: 'convergence_and_noise', check_name: 'Convergence and noise band', severity: 'High',
    location: { type: 'run', id: RUN, label: 'PM assignment', lon: null, lat: null },
    executive_line: 'The PM highway assignment stopped before it settled, so PM link flows carry more noise than the other periods.',
    modeller_view: 'Relative gap at the final iteration (40) for PM is 0.0012 against a target of 0.001. AM, MD, EV and NT met the target. 92.4% of links have GEH < 1 between iterations 38 and 40 (target 95%). Noise band widened to +/- 6% for PM link comparisons.',
    evidence: {
      values: { rel_gap: 0.0012, iterations: 40, stable_share: 0.924, period: 'PM' },
      thresholds: { rel_gap_target: 0.001, rel_gap_high: 0.01, geh_stable_share_target: 0.95 },
      sources: [SRC('logs/assign_PM.log', 812, 'convergence', 'value')],
      period: 'PM',
      query: `SELECT period, iteration, value AS rel_gap\nFROM convergence\nWHERE run_id = '${RUN}' AND metric = 'rel_gap' AND stage = 'highway'\nQUALIFY iteration = MAX(iteration) OVER (PARTITION BY period)`,
    },
    likely_cause: 'Iteration cap of 40 reached before the gap target; PM demand is 8% higher than in the base run so more iterations are needed.',
    suggested_action: 'Raise the PM iteration cap to 60 or tighten the step size; rerun PM only.',
    measures: [{ measure_id: 'M-0004-a', title: 'Rerun PM with 60 iterations', description: 'Assignment-only rerun; roughly 25 minutes on the modelling server.', estimated_effect: 'Relative gap expected below 0.001; PM noise band narrows to +/- 3%.', effect_values: { rel_gap_after: 0.0008 }, method: 'steam_rerun', confidence: 'high' }],
    is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0005', run_id: RUN, check_id: 'unrealistic_speeds_times', check_name: 'Unrealistic speeds and times', severity: 'Medium',
    location: { type: 'link', id: '20166', label: 'COL 1043→1053', ...centre(byId['20166']) },
    executive_line: 'One collector road is modelled as faster than its own speed limit in the AM peak, which points to a coding error rather than real traffic.',
    modeller_view: `Congested speed ${flowOf('20166', 'AM').cong_speed_kph} km/h exceeds free-flow speed ${byId['20166'].ffs_kph} km/h by ${Math.round(((flowOf('20166', 'AM').cong_speed_kph / byId['20166'].ffs_kph) - 1) * 100)}% (limit 5%). Volume-delay function VDF 7 applied where VDF 3 is used on all other COL links.`,
    evidence: {
      values: { cong_speed_kph: flowOf('20166', 'AM').cong_speed_kph, ffs_kph: byId['20166'].ffs_kph, ratio: r(flowOf('20166', 'AM').cong_speed_kph / byId['20166'].ffs_kph, 3), vdf: 7 },
      thresholds: { max_speed_over_ffs_ratio: 1.05 },
      sources: [SRC('outputs/loaded_AM.dbf', 1466, 'link_flows', 'cong_speed_kph'), SRC('inputs/network/links.dbf', 166, 'links', 'ffs_kph')],
      period: 'AM',
      query: `SELECT f.link_id, f.cong_speed_kph, l.ffs_kph, f.cong_speed_kph / l.ffs_kph AS ratio\nFROM link_flows f JOIN links l USING (run_id, link_id)\nWHERE f.run_id = '${RUN}' AND f.period = 'AM' AND f.user_class = 'ALL'\n  AND f.cong_speed_kph > 1.05 * l.ffs_kph`,
    },
    likely_cause: 'Wrong volume-delay function assigned to the link.', suggested_action: 'Set VDF 3 on link 20166 and rerun AM.', measures: [], is_significant: true, created_at: now,
  },
  linkFinding('F-0006', '20088', 'Medium', 'AM', { exec: 'Link 20088 is close to its capacity in the AM peak; worth a look but not unusual for an urban arterial.' }),
  linkFinding('F-0007', '20103', 'Medium', 'PM', { exec: 'Link 20103 runs near capacity in the PM peak, in line with its neighbours.' }),
  linkFinding('F-0008', '20122', 'Medium', 'AM', {
    exec: 'Link 20122 carries almost no traffic although the roads around it are busy, which suggests it is disconnected or mis-coded.',
    cause: 'Turn prohibition or missing connector at node ' + byId['20122'].a_node + ' leaves the link unreachable.',
    action: 'Inspect turn penalties at the A node and confirm the link direction.',
  }),
  {
    finding_id: 'F-0009', run_id: RUN, check_id: 'centroid_connectors', check_name: 'Centroid connectors', severity: 'Medium',
    location: { type: 'node', id: '1027', label: 'Zone 412 centroid', lon: nodeById['1027'].lon, lat: nodeById['1027'].lat },
    executive_line: 'Zone 412 loads its traffic straight onto the freeway, which is not how people would actually reach the road network.',
    modeller_view: 'Centroid connector from zone 412 attaches at node 1027, which is a node of FWY link 20045. Connectors must attach to ART, COL or LOC links (high_class_links = FWY, EXP).',
    evidence: {
      values: { zone_id: '412', node_id: '1027', attached_link_class: 'FWY', connector_length_m: 1840 },
      thresholds: { high_class_links: ['FWY', 'EXP'], max_connector_length_m: 5000 },
      sources: [SRC('inputs/network/links.dbf', 45, 'links', 'link_class'), SRC('inputs/network/nodes.dbf', 27, 'nodes', 'is_centroid')],
      period: null,
      query: `SELECT c.link_id, c.a_node, l.link_class\nFROM links c JOIN nodes n ON n.node_id = c.a_node AND n.is_centroid\nJOIN links l ON l.a_node = c.b_node OR l.b_node = c.b_node\nWHERE c.run_id = '${RUN}' AND l.link_class IN ('FWY','EXP')`,
    },
    likely_cause: 'Connector snapped to the nearest node during network editing.', suggested_action: 'Move the connector end to node 1017 on the parallel arterial.', measures: [], is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0010', run_id: RUN, check_id: 'land_use_control_totals', check_name: 'Land use control totals', severity: 'High',
    location: { type: 'sector', id: 'S3', label: 'Sector 3 (Reem and Maryah)', lon: 54.395, lat: 24.475 },
    executive_line: 'Sector 3 has 6.4% more jobs than the agreed 2035 planning total, so its traffic will be overstated.',
    modeller_view: 'Sum of employment over zones in sector S3 = 212,400 against control total 199,600 (diff share 0.064, tolerance 0.02). Population within tolerance (diff share 0.007).',
    evidence: {
      values: { variable: 'employment', zone_sum: 212400, control_total: 199600, abs_diff_share: 0.064 },
      thresholds: { tolerance_share: 0.02, high: 0.05, critical: 0.1 },
      sources: [SRC('inputs/landuse/land_use_2035.csv', 118, 'land_use', 'value'), SRC('inputs/landuse/control_totals_2035.csv', 3, 'land_use', 'control_total')],
      period: null,
      query: `SELECT z.sector_id, lu.variable, SUM(lu.value) AS zone_sum, MAX(lu.control_total) AS control_total\nFROM land_use lu JOIN zones z USING (run_id, zone_id)\nWHERE lu.run_id = '${RUN}'\nGROUP BY 1, 2\nHAVING ABS(zone_sum / control_total - 1) > 0.02`,
    },
    likely_cause: 'The 2035 employment file predates the revised Reem Island phasing.', suggested_action: 'Replace land_use_2035.csv rows for sector S3 with the revised phasing (DMT letter 2026-07-14) and rerun demand.',
    measures: [{ measure_id: 'M-0010-a', title: 'Scale sector S3 employment to the control total', description: 'Apply a uniform factor 0.94 to employment in sector S3 zones.', estimated_effect: 'About 4,100 fewer AM trips attracted to S3; V/C on the Reem bridge links falls by 0.05.', effect_values: { delta_trips_am: -4100, delta_vc_bridge: -0.05 }, method: 'sketch_elasticity', confidence: 'medium' }],
    is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0011', run_id: RUN, check_id: 'transit_line_integrity', check_name: 'Transit line integrity', severity: 'Medium',
    location: { type: 'line', id: 'B056', label: 'Bus 56', lon: 54.372, lat: 24.441 },
    executive_line: 'Bus route 56 is coded with a 150 minute gap between buses, far above anything the operator runs.',
    modeller_view: 'headway_p1 (AM) = 150 min for line B056, mode BUS. Allowed range 2 to 120 min; mode maximum for BUS is 120 min.',
    evidence: {
      values: { line_id: 'B056', mode: 'BUS', headway_p1: 150 },
      thresholds: { headway_min_range: [2, 120], modes_headway_max_BUS: 120 },
      sources: [SRC('inputs/transit/lines_2035.lin', 1421, 'transit_lines', 'headway_p1')],
      period: 'AM',
      query: `SELECT line_id, mode, headway_p1\nFROM transit_lines\nWHERE run_id = '${RUN}' AND (headway_p1 < 2 OR headway_p1 > 120)`,
    },
    likely_cause: 'Headway typed in seconds-per-two-buses or a placeholder left in the line file.', suggested_action: 'Confirm the AM headway with the ITC bus service plan (likely 15 min) and correct the .lin file.', measures: [], is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0012', run_id: RUN, check_id: 'unused_transit_services', check_name: 'Unused transit services', severity: 'Medium',
    location: { type: 'line', id: 'B112', label: 'Bus 112', lon: 54.43, lat: 24.428 },
    executive_line: 'Bus route 112 runs almost empty although it passes through busy areas.',
    modeller_view: 'Load factor 0.038 (AM) for line B112 against a minimum of 0.05; catchment demand within 1 km = 3,900 trips. Change vs base run is inside the noise band (+/- 0.01).',
    evidence: {
      values: { line_id: 'B112', load_factor: 0.038, catchment_demand: 3900, base_load_factor: 0.041 },
      thresholds: { min_load_factor: 0.05, min_catchment_demand: 500 },
      sources: [SRC('outputs/transit_loads_AM.csv', 2210, 'line_loads', 'load')],
      period: 'AM',
      query: `SELECT line_id, SUM(load) / SUM(vehicle_capacity * 60.0 / headway_p1) AS load_factor\nFROM line_loads JOIN transit_lines USING (run_id, line_id)\nWHERE run_id = '${RUN}' AND period = 'AM'\nGROUP BY line_id HAVING load_factor < 0.05`,
    },
    likely_cause: 'Also below threshold in the base run; a known low-demand service.', suggested_action: 'No action for this run; review in the service plan.', measures: [], is_significant: false, created_at: now,
  },
  {
    finding_id: 'F-0013', run_id: RUN, check_id: 'null_and_id_integrity', check_name: 'Null and ID integrity', severity: 'Medium',
    location: { type: 'run', id: RUN, label: 'nodes table', lon: null, lat: null },
    executive_line: 'A small number of network nodes are missing a junction type, which affects how delays are computed at those points.',
    modeller_view: '14 of 3,812 node rows (0.37%) have NULL junction_control. No missing node or zone references.',
    evidence: {
      values: { table: 'nodes', column: 'junction_control', null_rows: 14, rows: 3812, null_share: 0.0037, missing_node_refs: 0, missing_zone_refs: 0 },
      thresholds: { null_share_high: 0.01, null_share_medium: 0 },
      sources: [SRC('inputs/network/nodes.dbf', null, 'nodes', 'junction_control')],
      period: null,
      query: `SELECT COUNT(*) FILTER (WHERE junction_control IS NULL) AS null_rows, COUNT(*) AS rows\nFROM nodes WHERE run_id = '${RUN}'`,
    },
    likely_cause: 'Nodes added for the 2035 schemes were not given a junction type.', suggested_action: 'Fill junction_control for the 14 nodes listed in the modeller view.', measures: [], is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0014', run_id: RUN, check_id: 'matrix_sanity', check_name: 'Matrix sanity', severity: 'Info',
    location: { type: 'matrix', id: 'DEMAND/HBW/CAR/AM', label: 'Home-based work, car, AM', lon: null, lat: null },
    executive_line: 'The AM car commuting matrix contains many tiny fractional values, a harmless side effect of the way trips are split between modes.',
    modeller_view: '61% of non-zero cells in DEMAND HBW CAR AM are below 0.01 trips. No negative cells; intrazonal share 0.07.',
    evidence: {
      values: { matrix_kind: 'DEMAND', purpose: 'HBW', mode: 'CAR', period: 'AM', share_cells_below_0_01: 0.61, negative_cells: 0, intrazonal_share: 0.07 },
      thresholds: { intrazonal_share_max: 0.15 },
      sources: [SRC('outputs/demand_AM.mat', null, 'od', 'trips')],
      period: 'AM',
      query: `SELECT AVG(CASE WHEN trips < 0.01 THEN 1.0 ELSE 0.0 END) AS share_small\nFROM od WHERE run_id = '${RUN}' AND matrix_kind = 'DEMAND' AND purpose = 'HBW' AND mode = 'CAR' AND period = 'AM'`,
    },
    likely_cause: 'Mode choice applied to a full matrix without a floor.', suggested_action: 'None needed; consider rounding below 0.001 at export to reduce file size.', measures: [], is_significant: true, created_at: now,
  },
  {
    finding_id: 'F-0015', run_id: RUN, check_id: 'trip_length_distribution', check_name: 'Trip length distribution', severity: 'Info',
    location: { type: 'matrix', id: 'DEMAND/HBO/PT/MD', label: 'Home-based other, PT, midday', lon: null, lat: null },
    executive_line: 'Midday public transport trips are about 4% longer than in the base run, a change too small to matter.',
    modeller_view: 'Mean trip length 9.8 km vs 9.4 km in run_2035_ref_v3 (diff share 0.043; medium threshold 0.15). Within the noise band estimated from base-vs-base reruns (+/- 5%).',
    evidence: {
      values: { mean_km: 9.8, base_mean_km: 9.4, mean_diff_share: 0.043 },
      thresholds: { max_mean_diff_share: 0.15, max_mean_diff_share_high: 0.3 },
      sources: [SRC('outputs/demand_MD.mat', null, 'od', 'trips'), SRC('outputs/skims_MD_PT.mat', null, 'skims', 'value')],
      period: 'MD',
      query: `SELECT SUM(o.trips * s.value) / SUM(o.trips) AS mean_km\nFROM od o JOIN skims s ON s.skim_kind = 'DIST' AND s.mode = o.mode AND s.period = o.period\n  AND s.origin = o.origin AND s.destination = o.destination\nWHERE o.run_id = '${RUN}' AND o.purpose = 'HBO' AND o.mode = 'PT' AND o.period = 'MD'`,
    },
    likely_cause: 'Longer bus route 56 after the Saadiyat extension.', suggested_action: 'None.', measures: [], is_significant: false, created_at: now,
  },
];
// High count so far: F-0002, F-0003, F-0004, F-0010 = 4 -> make F-0003 Medium to keep 1C/3H
findings[2].severity = 'Medium';
findings[2].executive_line = 'Link 20051 is over capacity in the PM peak, though by a margin common on this corridor.';

// --- health -----------------------------------------------------------------
const sig = findings.filter((f) => f.is_significant);
const cnt = (list, s) => list.filter((f) => f.severity === s).length;
const counts = Object.fromEntries(['Critical', 'High', 'Medium', 'Info'].map((s) => [s, cnt(findings, s)]));
const findingsComponent = Math.max(0, 100 - 25 * cnt(sig, 'Critical') - 8 * cnt(sig, 'High') - 2 * cnt(sig, 'Medium'));
const convergenceComponent = r((1 - (0.0012 - 0.001) / (0.01 - 0.001)) * 100, 1);
const score = r(0.7 * findingsComponent + 0.3 * convergenceComponent, 1);
const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E';
const DEFINITION = 'Health = 0.7 x Findings component + 0.3 x Convergence component. Findings component = max(0, 100 - 25 x Critical - 8 x High - 2 x Medium - 0 x Info), counting significant findings only. Convergence component = 100 if every assignment period met the relative gap target, scaled down linearly to 0 at ten times the target. Grade: A >= 90, B >= 75, C >= 60, D >= 40, E below 40.';
const health = {
  run_id: RUN, score, grade,
  components: [
    { name: 'Findings', score: findingsComponent, weight: 0.7, detail: `${cnt(sig, 'Critical')} Critical x 25 + ${cnt(sig, 'High')} High x 8 + ${cnt(sig, 'Medium')} Medium x 2 = ${100 - findingsComponent} points deducted (significant findings only).` },
    { name: 'Convergence', score: convergenceComponent, weight: 0.3, detail: 'AM, MD, EV, NT met the 0.001 relative gap target; PM reached 0.0012.' },
  ],
  counts, definition: DEFINITION,
};
const baseHealth = {
  run_id: BASE, score: 81.4, grade: 'B',
  components: [
    { name: 'Findings', score: 74, weight: 0.7, detail: '0 Critical x 25 + 2 High x 8 + 5 Medium x 2 = 26 points deducted (significant findings only).' },
    { name: 'Convergence', score: 98.6, weight: 0.3, detail: 'AM, MD, EV, NT met the target; PM reached 0.00113.' },
  ],
  counts: { Critical: 0, High: 2, Medium: 6, Info: 3 }, definition: DEFINITION,
};

// --- runs / manifests -------------------------------------------------------
const files = [
  { path: 'inputs/network/links.dbf', size: 18342112, sha256: '3f9c1a...b21e', table: 'links' },
  { path: 'inputs/network/nodes.dbf', size: 2214880, sha256: '8ad0e2...77c1', table: 'nodes' },
  { path: 'inputs/landuse/land_use_2035.csv', size: 812340, sha256: 'c11f9b...0a4d', table: 'land_use' },
  { path: 'inputs/transit/lines_2035.lin', size: 1290011, sha256: '5e6b77...d9f0', table: 'transit_lines' },
  { path: 'outputs/loaded_AM.dbf', size: 41200340, sha256: 'a9e4c0...14b2', table: 'link_flows' },
  { path: 'outputs/loaded_PM.dbf', size: 41198802, sha256: 'e1d2a3...9c07', table: 'link_flows' },
  { path: 'outputs/demand_AM.mat', size: 522110400, sha256: '07bb1e...e2aa', table: 'od' },
  { path: 'logs/assign_PM.log', size: 91233, sha256: '6c6c6c...1234', table: 'convergence' },
];
const manifests = {
  [RUN]: {
    run_id: RUN, scenario_name: '2035 Reference Case v4', horizon_year: 2035, policy_set: 'REF', base_run_id: BASE,
    ingested_at: '2026-09-22T06:38:04Z', source_root: 'D:/STEAM/runs/2035_REF_v4', steam_version: '4.2.1', is_synthetic: true, status: 'ingested',
    files, tables: { links: 148912, nodes: 3812, zones: 3688, land_use: 25816, transit_lines: 214, transit_segments: 18930, link_flows: 2978240, line_loads: 94650, od: 41211900, skims: 68002000, convergence: 200, parameters: 88 },
    periods: ['AM', 'MD', 'PM', 'EV', 'NT'], report_generated_at: '2026-09-22T06:41:40Z',
  },
  [BASE]: {
    run_id: BASE, scenario_name: '2035 Reference Case v3', horizon_year: 2035, policy_set: 'REF', base_run_id: null,
    ingested_at: '2026-09-15T09:12:51Z', source_root: 'D:/STEAM/runs/2035_REF_v3', steam_version: '4.2.1', is_synthetic: true, status: 'ingested',
    files: files.slice(0, 6), tables: { links: 148870, nodes: 3812, zones: 3688, land_use: 25816, transit_lines: 212, transit_segments: 18744, link_flows: 2977400, line_loads: 93800, od: 41000120, skims: 68002000, convergence: 200, parameters: 88 },
    periods: ['AM', 'MD', 'PM', 'EV', 'NT'], report_generated_at: '2026-09-15T09:16:02Z',
  },
};
const runs = [
  { run_id: RUN, scenario_name: manifests[RUN].scenario_name, horizon_year: 2035, base_run_id: BASE, ingested_at: manifests[RUN].ingested_at, status: 'ingested', is_synthetic: true, health: { score, grade } },
  { run_id: BASE, scenario_name: manifests[BASE].scenario_name, horizon_year: 2035, base_run_id: null, ingested_at: manifests[BASE].ingested_at, status: 'ingested', is_synthetic: true, health: { score: 81.4, grade: 'B' } },
];

// --- check results ----------------------------------------------------------
const CATALOGUE = [
  ['null_and_id_integrity', 'Null and ID integrity', 'Required columns present and non-null; every link references an existing node and every land-use row an existing zone.'],
  ['network_connectivity', 'Network connectivity', 'No zero-capacity or zero-speed links, no orphan nodes, no one-way dead ends.'],
  ['centroid_connectors', 'Centroid connectors', 'Zone connectors attach to local roads, not freeways or expressways, and are not unreasonably long.'],
  ['transit_line_integrity', 'Transit line integrity', 'Line node sequences form a path in the network and headways are within the operator range for the mode.'],
  ['land_use_control_totals', 'Land use control totals', 'Zone land-use sums match the agreed sector and region control totals within tolerance.'],
  ['link_volume_outliers', 'Link volume outliers', 'Links over capacity or statistically unusual within their class, area type and period peer group.'],
  ['convergence_and_noise', 'Convergence and noise band', 'Assignment relative gap met per period; final-iteration stability sets the noise band for comparisons.'],
  ['matrix_sanity', 'Matrix sanity', 'No negative cells, plausible intrazonal shares and production/attraction balance per zone.'],
  ['trip_length_distribution', 'Trip length distribution', 'Mean trip length per purpose and mode stays close to the base run.'],
  ['unrealistic_speeds_times', 'Unrealistic speeds and times', 'Congested speeds not above free-flow nor below a floor; no extreme delays.'],
  ['parameter_drift', 'Parameter drift', 'Model parameters match the approved register.'],
  ['unexplained_demand_shift', 'Unexplained demand shift', 'Sector-to-sector demand changes have a nearby input change that explains them.'],
  ['unused_transit_services', 'Unused transit services', 'Lines with very low load factors despite demand in their catchment.'],
];
const PARAMS = {
  null_and_id_integrity: { required_columns: { links: ['link_id', 'a_node', 'b_node', 'length_m', 'link_class', 'capacity_vph', 'ffs_kph'], nodes: ['node_id', 'x', 'y'], zones: ['zone_id'], link_flows: ['link_id', 'period', 'user_class', 'volume'] } },
  network_connectivity: { min_capacity_vph: 1.0, min_ffs_kph: 5.0 },
  centroid_connectors: { high_class_links: ['FWY', 'EXP'], max_connector_length_m: 5000 },
  transit_line_integrity: { headway_min_range: [2, 120], modes_headway_max: { METRO: 20, LRT: 30, BRT: 30, BUS: 120, RAIL: 120, TRAM: 30, FERRY: 120 } },
  land_use_control_totals: { tolerance_share: 0.02 },
  link_volume_outliers: { vc_critical: 1.3, vc_high: 1.1, vc_medium: 0.95, zscore_threshold: 3.0, min_group_size: 20, low_volume_share_of_group_median: 0.02, user_class: 'ALL', periods: ['AM', 'PM'] },
  convergence_and_noise: { rel_gap_target: 0.001, rel_gap_high: 0.01, geh_stable: 1.0, geh_stable_share_target: 0.95, noise_band_iterations: 3 },
  matrix_sanity: { intrazonal_share_max: 0.15, row_col_ratio_max: 5.0, min_zone_total_for_ratio: 50 },
  trip_length_distribution: { max_mean_diff_share: 0.15, max_mean_diff_share_high: 0.3, distance_bins_km: [0, 2, 5, 10, 20, 40, 80, 200] },
  unrealistic_speeds_times: { min_cong_speed_kph: 5.0, max_speed_over_ffs_ratio: 1.05, max_delay_s: 900, periods: ['AM', 'PM'] },
  parameter_drift: {},
  unexplained_demand_shift: { sector_shift_share: 0.1, catchment_km: 5.0 },
  unused_transit_services: { min_load_factor: 0.05, min_catchment_demand: 500, catchment_km: 1.0 },
};
const RULES = {
  null_and_id_integrity: [['missing_node_refs > 0', 'Critical'], ['missing_zone_refs > 0', 'Critical'], ['null_share > 0.01', 'High'], ['null_share > 0', 'Medium']],
  network_connectivity: [["issue == 'zero_capacity' or issue == 'zero_speed'", 'Critical'], ["issue == 'orphan_node'", 'Medium'], ["issue == 'oneway_dead_end'", 'High']],
  centroid_connectors: [["issue == 'connector_on_high_class'", 'High'], ["issue == 'connector_too_long'", 'Medium']],
  transit_line_integrity: [["issue == 'broken_sequence'", 'Critical'], ["issue == 'headway_out_of_range'", 'High'], ["issue == 'node_not_in_network'", 'Critical']],
  land_use_control_totals: [['abs_diff_share > 0.10', 'Critical'], ['abs_diff_share > 0.05', 'High'], ['abs_diff_share > 0.02', 'Medium']],
  link_volume_outliers: [['vc_ratio >= 1.30', 'Critical'], ['vc_ratio >= 1.10', 'High'], ['abs_zscore >= 4.0', 'High'], ['vc_ratio >= 0.95 or abs_zscore >= 3.0', 'Medium']],
  convergence_and_noise: [['rel_gap > 0.01', 'Critical'], ['rel_gap > 0.001', 'High'], ['stable_share < 0.95', 'Medium']],
  matrix_sanity: [["issue == 'negative_cells'", 'Critical'], ["issue == 'row_col_imbalance'", 'High'], ["issue == 'intrazonal_share'", 'Medium'], ["issue == 'fractional_artefact'", 'Info']],
  trip_length_distribution: [['mean_diff_share > 0.30', 'High'], ['mean_diff_share > 0.15', 'Medium']],
  unrealistic_speeds_times: [["issue == 'speed_above_ffs'", 'High'], ["issue == 'speed_below_floor'", 'High'], ["issue == 'delay_outlier'", 'Medium']],
  parameter_drift: [['drifted', 'High']],
  unexplained_demand_shift: [['shift_share > 0.25', 'High'], ['shift_share > 0.10', 'Medium']],
  unused_transit_services: [['load_factor < 0.02', 'High'], ['load_factor < 0.05', 'Medium']],
};
const catalogue = CATALOGUE.map(([id, name, description]) => ({
  check_id: id, name, description, enabled: true, params: PARAMS[id], severity: RULES[id].map(([when, severity]) => ({ when, severity })),
}));
const rowsFor = { null_and_id_integrity: 3212, network_connectivity: 152724, centroid_connectors: 7376, transit_line_integrity: 19144, land_use_control_totals: 25816, link_volume_outliers: 297824, convergence_and_noise: 200, matrix_sanity: 41211900, trip_length_distribution: 41211900, unrealistic_speeds_times: 297824, parameter_drift: 88, unexplained_demand_shift: 1936, unused_transit_services: 214 };
function checkResults(runId, list, skipped) {
  return CATALOGUE.map(([id, name]) => {
    const mine = list.filter((f) => f.check_id === id);
    const c = Object.fromEntries(['Critical', 'High', 'Medium', 'Info'].map((s) => [s, mine.filter((f) => f.severity === s).length]));
    const status = skipped[id] ? 'skipped' : 'ok';
    return {
      check_id: id, check_name: name, status,
      message: skipped[id] ?? (mine.length ? `${mine.length} finding${mine.length > 1 ? 's' : ''}` : 'No findings'),
      duration_s: r(between(0.4, 38), 2), rows_examined: skipped[id] ? 0 : rowsFor[id],
      counts: { ...c, total: mine.length },
    };
  });
}
const checksRun = checkResults(RUN, findings, { parameter_drift: 'Required table parameters missing: no parameter register exported for this run.' });
const checksBase = checkResults(BASE, findings.filter((f) => ['F-0006', 'F-0007', 'F-0009', 'F-0011', 'F-0012', 'F-0013', 'F-0014'].includes(f.finding_id)).map((f) => ({ ...f, run_id: BASE })), {
  parameter_drift: 'Required table parameters missing.', trip_length_distribution: 'No base run declared; comparison checks skipped.', unexplained_demand_shift: 'No base run declared; comparison checks skipped.',
});

// --- KPIs and changes -------------------------------------------------------
const KPIS = [
  ['total_vkt_am', 'Vehicle-km travelled, AM', 'veh-km', 'AM', 'Sum of link volume x length for user_class ALL in the AM period.', 18_432_600, 17_910_200],
  ['share_links_over_capacity_am', 'Share of links with V/C above 1.0, AM', 'share', 'AM', 'Links with vc_ratio > 1.0 divided by all links carrying flow, AM, user_class ALL.', 0.061, 0.052],
  ['mean_cong_speed_am', 'Volume-weighted congested speed, AM', 'km/h', 'AM', 'Sum(volume x congested speed) / Sum(volume) for AM, user_class ALL.', 47.8, 49.1],
  ['total_trips_am', 'Total demand trips, AM', 'trips', 'AM', 'Sum of all DEMAND matrix cells in the AM period, all purposes and modes.', 1_284_300, 1_241_900],
  ['pt_share_am', 'PT mode share, AM', 'share', 'AM', 'PT demand trips divided by all demand trips, AM.', 0.118, 0.121],
  ['mean_trip_length_km', 'Mean trip length, all periods', 'km', null, 'Trip-weighted mean of the DIST skim over DEMAND matrix cells.', 12.6, 12.4],
];
const kpis = KPIS.map(([kpi_id, name, unit, period, definition, value]) => ({
  kpi_id, name, value, unit, period, definition,
  sources: [SRC('config/kpis.yaml', null, kpi_id, 'sql'), SRC(period ? `outputs/loaded_${period}.dbf` : 'outputs/demand_*.mat', null, kpi_id.includes('trip') || kpi_id.includes('pt_') ? 'od' : 'link_flows', null)],
}));
const kpisBase = KPIS.map(([kpi_id, name, unit, period, definition, , base]) => ({ kpi_id, name, value: base, unit, period, definition, sources: [SRC('config/kpis.yaml', null, kpi_id, 'sql')] }));
const changes = {
  base_run_id: BASE,
  inputs: [
    { file: 'inputs/network/links.dbf', table: 'links', change: 'modified', rows_changed: 42, detail: 'Lanes and capacity on 42 links (Saadiyat link road, Reem bridge widening).' },
    { file: 'inputs/landuse/land_use_2035.csv', table: 'land_use', change: 'modified', rows_changed: 18, detail: 'Employment in 18 zones of sector S3.' },
    { file: 'inputs/transit/lines_2035.lin', table: 'transit_lines', change: 'modified', rows_changed: 2, detail: 'Lines B056 and B112 extended to Saadiyat.' },
    { file: 'inputs/parameters/register.csv', table: 'parameters', change: 'removed', rows_changed: null, detail: 'Parameter register not exported for v4.' },
  ],
  findings: {
    new: findings.filter((f) => ['F-0001', 'F-0002', 'F-0004', 'F-0010'].includes(f.finding_id)),
    resolved: [
      { ...findings[8], finding_id: 'F-0009b', run_id: BASE, location: { type: 'node', id: '1041', label: 'Zone 388 centroid', lon: nodeById['1041'].lon, lat: nodeById['1041'].lat }, executive_line: 'Zone 388 loaded its traffic straight onto the expressway.' },
      { ...findings[6], finding_id: 'F-0007b', run_id: BASE, location: { type: 'link', id: '20066', label: 'ART 1013→1023', ...centre(byId['20066']) }, executive_line: 'Link 20066 was over capacity in the PM peak in v3.' },
    ],
    unchanged: findings.filter((f) => !['F-0001', 'F-0002', 'F-0004', 'F-0010'].includes(f.finding_id)),
  },
  kpis: KPIS.map(([kpi_id, name, unit, , , value, base]) => ({ kpi_id, name, unit, base_value: base, value, delta: r(value - base, 4), delta_share: r((value - base) / base, 4), is_significant: Math.abs((value - base) / base) > 0.025 })),
};

// --- write ------------------------------------------------------------------
const write = (name, data, compact = false) => writeFileSync(join(out, name), JSON.stringify(data, null, compact ? 0 : 1) + '\n');
write('runs.json', runs);
write('manifests.json', manifests);
write('health.json', { [RUN]: health, [BASE]: baseHealth });
write('findings.json', { [RUN]: findings, [BASE]: checksBase.length ? findings.filter((f) => ['F-0006', 'F-0007', 'F-0009', 'F-0011', 'F-0012', 'F-0013', 'F-0014'].includes(f.finding_id)).map((f) => ({ ...f, run_id: BASE })) : [] });
write('checks.json', { [RUN]: checksRun, [BASE]: checksBase });
write('catalogue.json', catalogue);
write('kpis.json', { [RUN]: kpis, [BASE]: kpisBase });
write('changes.json', { [RUN]: changes, [BASE]: { base_run_id: null } });
write('links.json', links, true);
write('link_flows.json', flows, true);
write('health_definition.json', { definition: DEFINITION, penalties: { Critical: 25, High: 8, Medium: 2, Info: 0 }, weights: { findings: 0.7, convergence: 0.3 }, grades: { A: 90, B: 75, C: 60, D: 40, E: 0 } });
console.log(`links=${links.length} flows=${flows.length} findings=${findings.length} health=${score} ${grade}`);
