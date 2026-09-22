/**
 * Lightweight mock of the STEAM-AI API (no MSW). Enabled with VITE_USE_MOCK=1.
 * Answers the same paths as docs/api.md from the JSON fixtures in ./fixtures.
 */
import type {
  CheckDefinition,
  CheckResult,
  Finding,
  HealthDefinition,
  HealthScore,
  KPI,
  LinkAttributes,
  LinkCollection,
  LinkFeature,
  LinkFlow,
  LinkProfile,
  RunChanges,
  RunManifest,
  RunSummary,
  Severity,
} from '../api/types';
import { SEVERITY_RANK } from '../api/types';
import runsJson from './fixtures/runs.json';
import manifestsJson from './fixtures/manifests.json';
import healthJson from './fixtures/health.json';
import findingsJson from './fixtures/findings.json';
import checksJson from './fixtures/checks.json';
import catalogueJson from './fixtures/catalogue.json';
import kpisJson from './fixtures/kpis.json';
import changesJson from './fixtures/changes.json';
import linksJson from './fixtures/links.json';
import flowsJson from './fixtures/link_flows.json';
import healthDefinitionJson from './fixtures/health_definition.json';

type LinkRow = LinkAttributes & { coordinates: [number, number][] };

const runs = runsJson as RunSummary[];
const manifests = manifestsJson as Record<string, RunManifest>;
const health = healthJson as Record<string, HealthScore>;
const findings = findingsJson as unknown as Record<string, Finding[]>;
const checks = checksJson as unknown as Record<string, CheckResult[]>;
const catalogue = catalogueJson as unknown as CheckDefinition[];
const kpis = kpisJson as Record<string, KPI[]>;
const changes = changesJson as unknown as Record<string, RunChanges>;
const links = linksJson as unknown as LinkRow[];
const flows = flowsJson as unknown as (LinkFlow & { link_id: string })[];
const healthDefinition = healthDefinitionJson as HealthDefinition;

const flowsByLink = new Map<string, (LinkFlow & { link_id: string })[]>();
for (const f of flows) {
  const arr = flowsByLink.get(f.link_id);
  if (arr) arr.push(f);
  else flowsByLink.set(f.link_id, [f]);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const notFound = (what: string) => json({ detail: `${what} not found` }, 404);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findingsForRun(runId: string): Finding[] {
  return findings[runId] ?? [];
}

function linkFindingStats(runId: string) {
  const m = new Map<string, { n: number; max: Severity | null }>();
  for (const f of findingsForRun(runId)) {
    if (f.location.type !== 'link') continue;
    const cur = m.get(f.location.id) ?? { n: 0, max: null };
    cur.n += 1;
    if (!cur.max || SEVERITY_RANK[f.severity] < SEVERITY_RANK[cur.max]) cur.max = f.severity;
    m.set(f.location.id, cur);
  }
  return m;
}

function linksCollection(runId: string, period: string): LinkCollection {
  const stats = linkFindingStats(runId);
  const features: LinkFeature[] = [];
  for (const l of links) {
    const flow = flowsByLink.get(l.link_id)?.find((f) => f.period === period && f.user_class === 'ALL');
    if (!flow) continue;
    const s = stats.get(l.link_id);
    features.push({
      type: 'Feature',
      id: l.link_id,
      geometry: { type: 'LineString', coordinates: l.coordinates },
      properties: {
        link_id: l.link_id,
        a_node: l.a_node,
        b_node: l.b_node,
        link_class: l.link_class,
        area_type: l.area_type,
        lanes: l.lanes,
        capacity_vph: l.capacity_vph,
        ffs_kph: l.ffs_kph,
        volume: flow.volume,
        vc_ratio: flow.vc_ratio ?? 0,
        cong_speed_kph: flow.cong_speed_kph ?? 0,
        delay_s: flow.delay_s ?? 0,
        n_findings: s?.n ?? 0,
        max_severity: s?.max ?? null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function linkProfile(runId: string, linkId: string): LinkProfile | null {
  const l = links.find((x) => x.link_id === linkId);
  if (!l) return null;
  const { coordinates, ...attributes } = l;
  return {
    link_id: linkId,
    attributes,
    flows: (flowsByLink.get(linkId) ?? []).map(({ link_id: _id, ...rest }) => rest),
    findings: findingsForRun(runId).filter((f) => f.location.type === 'link' && f.location.id === linkId),
    sources: [
      { file: 'inputs/network/links.dbf', row: Number(linkId) - 20000, table: 'links', column: null },
      { file: 'outputs/loaded_AM.dbf', row: 1300 + Number(linkId) - 20000, table: 'link_flows', column: null },
      { file: 'outputs/loaded_PM.dbf', row: 1300 + Number(linkId) - 20000, table: 'link_flows', column: null },
    ],
    geometry: { type: 'LineString', coordinates },
  };
}

export async function mockFetch(input: string, _init?: RequestInit): Promise<Response> {
  await delay(60);
  const url = new URL(input, 'http://mock.local');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const q = url.searchParams;
  const seg = path.split('/').filter(Boolean);

  if (path === '/health') return json({ status: 'ok', mock: true });
  if (path === '/checks') return json(catalogue);
  if (path === '/config/health') return json(healthDefinition);
  if (path === '/runs') return json(runs);

  if (seg[0] === 'runs' && seg[1]) {
    const runId = decodeURIComponent(seg[1]);
    const manifest = manifests[runId];
    if (!manifest) return notFound(`Run ${runId}`);
    const rest = seg.slice(2);

    if (rest.length === 0) return json({ ...manifest, health: health[runId] ?? null });
    if (rest[0] === 'health') return health[runId] ? json(health[runId]) : notFound('Health');
    if (rest[0] === 'checks') return json(checks[runId] ?? []);
    if (rest[0] === 'kpis') return json(kpis[runId] ?? []);
    if (rest[0] === 'changes') return json(changes[runId] ?? { base_run_id: null });
    if (rest[0] === 'findings' && rest.length === 1) {
      let items = findingsForRun(runId);
      const sev = q.get('severity');
      const check = q.get('check_id');
      const lt = q.get('location_type');
      const sig = q.get('significant_only');
      if (sev) items = items.filter((f) => f.severity === sev);
      if (check) items = items.filter((f) => f.check_id === check);
      if (lt) items = items.filter((f) => f.location.type === lt);
      if (sig === 'true' || sig === '1') items = items.filter((f) => f.is_significant);
      items = [...items].sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.check_id.localeCompare(b.check_id),
      );
      const total = items.length;
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 200);
      return json({ total, items: items.slice(offset, offset + limit) });
    }
    if (rest[0] === 'findings' && rest[1]) {
      const f = findingsForRun(runId).find((x) => x.finding_id === decodeURIComponent(rest[1]));
      return f ? json(f) : notFound('Finding');
    }
    if (rest[0] === 'links' && rest.length === 1) {
      const period = q.get('period') ?? manifest.periods[0] ?? 'AM';
      if (!manifest.periods.includes(period)) return json({ detail: `Unknown period ${period}` }, 422);
      return json(linksCollection(runId, period));
    }
    if (rest[0] === 'links' && rest[1]) {
      const p = linkProfile(runId, decodeURIComponent(rest[1]));
      return p ? json(p) : notFound('Link');
    }
    if (rest[0] === 'report.docx' || rest[0] === 'report.pdf') {
      return new Response('mock report', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    }
  }
  return notFound(`Route ${path}`);
}
