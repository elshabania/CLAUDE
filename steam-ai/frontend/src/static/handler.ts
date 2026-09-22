/**
 * Static mode (VITE_STATIC_DATA=<url prefix>): answers the API from files written
 * by `steam-ai snapshot`, so the web app can be hosted without a server. Every
 * number comes from the API's own saved response; nothing is computed here except
 * list filtering and link profiles, which are assembled from links.bin, the run's
 * link_flows.json and its findings (the fields the API's link profile returns).
 */
import type { Finding, LinkFlow, LinkProfile, SourceRef } from '../api/types';
import { SEVERITY_RANK } from '../api/types';
import { decodeLinkBinary, type LinkBinary, type LinkBinMeta } from '../map/binary';

export const STATIC_BASE: string = ((import.meta.env.VITE_STATIC_DATA as string | undefined) || '').replace(/\/$/, '');

interface SnapshotIndex {
  runs: Record<string, { links: number; files: string[] }>;
}

/** link_flows.json: rows are [period, user_class, volume, vc, speed, delay, cong_time, file_idx, row]. */
interface FlowsFile {
  files: string[];
  links: Record<string, [string, string, number | null, number | null, number | null, number | null, number | null, number | null, number | null][]>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const notFound = (what: string) => json({ detail: `${what} not found` }, 404);

const cache = new Map<string, Promise<unknown>>();

/** Fetch a snapshot JSON file; null when absent (a host may answer 404 or an HTML fallback). */
function load<T>(path: string): Promise<T | null> {
  let p = cache.get(path) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(`${STATIC_BASE}/${path}`).then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      return (await r.json()) as T;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

const index = () => load<SnapshotIndex>('snapshot.json');

async function findingsFor(runId: string): Promise<Finding[]> {
  const page = await load<{ items: Finding[] }>(`runs/${runId}/findings.json`);
  return page?.items ?? [];
}

/** Snapshot file holding the run's links for a period. */
async function linksFile(runId: string, period: string | null): Promise<string | null> {
  const files = (await index())?.runs[runId]?.files ?? [];
  if (period && files.includes(`links_${period}.bin.gz`)) return `links_${period}.bin.gz`;
  if (files.includes('links.bin.gz')) return 'links.bin.gz';
  return files.find((f) => f.startsWith('links_')) ?? null;
}

const binCache = new Map<string, Promise<LinkBinary & { meta: LinkBinMeta }>>();

/** Decoded links for a run and period (shared by the map and link profiles). */
export async function linkBinary(runId: string, period: string | null): Promise<LinkBinary & { meta: LinkBinMeta }> {
  const file = await linksFile(runId, period);
  if (!file) throw new Error(`No links in the snapshot for run ${runId}`);
  const key = `${runId}/${file}`;
  let p = binCache.get(key);
  if (!p) {
    p = fetch(`${STATIC_BASE}/runs/${runId}/${file}`).then(async (r) => {
      if (!r.ok) throw new Error(`links: HTTP ${r.status}`);
      return decodeLinkBinary(await r.arrayBuffer());
    });
    p.catch(() => binCache.delete(key));
    binCache.set(key, p);
  }
  return p;
}

async function composedProfile(runId: string, linkId: string): Promise<LinkProfile | null> {
  const b = await linkBinary(runId, null);
  const i = b.indexById.get(linkId);
  if (i === undefined) return null;
  const pr = b.prop(i);
  const coords: [number, number][] = [];
  for (let v = b.startIndices[i]; v < b.startIndices[i + 1]; v++) {
    coords.push([b.positions[v * 3] + b.origin[0], b.positions[v * 3 + 1] + b.origin[1]]);
  }
  const findings = (await findingsFor(runId)).filter((f) => f.location.type === 'link' && f.location.id === linkId);
  const hasFlowsFile = (await index())?.runs[runId]?.files.includes('link_flows.json');
  const ff = hasFlowsFile ? await load<FlowsFile>(`runs/${runId}/link_flows.json`) : null;
  const rows = ff?.links[linkId] ?? [];
  const flows: LinkFlow[] = rows.map((r) => ({
    period: r[0],
    user_class: r[1],
    volume: r[2] ?? 0,
    vc_ratio: r[3],
    cong_speed_kph: r[4],
    delay_s: r[5],
    cong_time_s: r[6],
  }));
  const sources: SourceRef[] = [
    { file: b.meta.sourceFile ?? 'links', row: b.meta.sourceRowIsLinkId ? Number(linkId) : null, table: 'links', column: null },
    ...rows.map((r) => ({ file: r[7] != null ? ff!.files[r[7]] : 'link_flows', row: r[8], table: 'link_flows', column: 'volume' })),
  ];
  return {
    link_id: linkId,
    attributes: {
      link_id: linkId,
      a_node: pr.a_node,
      b_node: pr.b_node,
      length_m: b.meta.lengthM(i),
      link_class: pr.link_class,
      area_type: pr.area_type,
      lanes: pr.lanes,
      capacity_vph: pr.capacity_vph,
      ffs_kph: pr.ffs_kph,
      sector_id: b.meta.sector(i),
    },
    flows,
    findings,
    sources,
    geometry: { type: 'LineString', coordinates: coords },
  };
}

export async function staticFetch(input: string): Promise<Response> {
  const url = new URL(input, 'http://static.local');
  const path = url.pathname.replace(/^.*?\/api\/v1/, '');
  const q = url.searchParams;
  const seg = path.split('/').filter(Boolean);
  const file = async (p: string, what: string) => {
    const body = await load<unknown>(p);
    return body === null ? notFound(what) : json(body);
  };

  if (path === '/health') return json({ status: 'ok', static: true });
  if (path === '/checks') return file('checks.json', 'Check catalogue');
  if (path === '/config/health') return file('config/health.json', 'Health definition');
  if (path === '/runs') return file('runs.json', 'Runs');

  if (seg[0] === 'runs' && seg[1]) {
    const runId = decodeURIComponent(seg[1]);
    const rest = seg.slice(2);
    if (rest.length === 0) return file(`runs/${runId}.json`, `Run ${runId}`);
    if (['health', 'checks', 'kpis', 'changes', 'zones'].includes(rest[0]) && rest.length === 1) {
      return file(`runs/${runId}/${rest[0]}.json`, rest[0]);
    }
    if (rest[0] === 'findings' && rest.length === 1) {
      let items = await findingsFor(runId);
      const sev = q.get('severity');
      const check = q.get('check_id');
      const lt = q.get('location_type');
      const sig = q.get('significant_only');
      if (sev) items = items.filter((f) => f.severity === sev);
      if (check) items = items.filter((f) => f.check_id === check);
      if (lt) items = items.filter((f) => f.location.type === lt);
      if (sig === 'true' || sig === '1') items = items.filter((f) => f.is_significant);
      // Stable: keeps each check's own ranking, as the API does.
      items = [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.check_id.localeCompare(b.check_id));
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 200);
      return json({ total: items.length, items: items.slice(offset, offset + limit) });
    }
    if (rest[0] === 'findings' && rest[1]) {
      const id = decodeURIComponent(rest[1]);
      const f = (await findingsFor(runId)).find((x) => x.finding_id === id);
      return f ? json(f) : notFound('Finding');
    }
    if (rest[0] === 'links' && rest[1]) {
      const linkId = decodeURIComponent(rest[1]);
      const p = await composedProfile(runId, linkId);
      return p ? json(p) : notFound(`Link ${linkId}`);
    }
  }
  return notFound(`Route ${path}`);
}
