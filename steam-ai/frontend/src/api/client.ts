/**
 * Typed fetch wrapper for the STEAM-AI REST API (docs/api.md).
 * With VITE_USE_MOCK=1 the request is answered by src/mock/handler.ts.
 */
import type {
  CheckDefinition,
  CheckResult,
  FindingsPage,
  FindingsQuery,
  Finding,
  HealthDefinition,
  HealthScore,
  KPI,
  LinkCollection,
  LinkProfile,
  RunChanges,
  RunDetail,
  RunSummary,
} from './types';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || '/api/v1';
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === '1' || import.meta.env.VITE_USE_MOCK === 'true';

export class ApiError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let mockFetch: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

async function getFetch() {
  if (!USE_MOCK) return fetch;
  if (!mockFetch) {
    const mod = await import('../mock/handler');
    mockFetch = mod.mockFetch;
  }
  return mockFetch;
}

export async function apiGet<T>(path: string, query?: Query, init?: RequestInit): Promise<T> {
  const url = buildUrl(path, query);
  const doFetch = await getFetch();
  let res: Response;
  try {
    res = await doFetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  } catch (e) {
    throw new ApiError(0, url, `Network error: ${(e as Error).message}`);
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => (d as { msg?: string }).msg ?? '').join('; ');
    } catch {
      /* body not JSON */
    }
    throw new ApiError(res.status, url, detail);
  }
  return (await res.json()) as T;
}

/** Absolute URL for a binary download served by the API (reports). */
export function fileUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export const api = {
  runs: () => apiGet<RunSummary[]>('/runs'),
  run: (runId: string) => apiGet<RunDetail>(`/runs/${encodeURIComponent(runId)}`),
  health: (runId: string) => apiGet<HealthScore>(`/runs/${encodeURIComponent(runId)}/health`),
  findings: (runId: string, q: FindingsQuery = {}) =>
    apiGet<FindingsPage>(`/runs/${encodeURIComponent(runId)}/findings`, {
      severity: q.severity || undefined,
      check_id: q.check_id || undefined,
      location_type: q.location_type || undefined,
      significant_only: q.significant_only ? 'true' : undefined,
      limit: q.limit,
      offset: q.offset,
    }),
  finding: (runId: string, findingId: string) =>
    apiGet<Finding>(`/runs/${encodeURIComponent(runId)}/findings/${encodeURIComponent(findingId)}`),
  checks: (runId: string) => apiGet<CheckResult[]>(`/runs/${encodeURIComponent(runId)}/checks`),
  changes: (runId: string) => apiGet<RunChanges>(`/runs/${encodeURIComponent(runId)}/changes`),
  kpis: (runId: string) => apiGet<KPI[]>(`/runs/${encodeURIComponent(runId)}/kpis`),
  links: (runId: string, period: string, metric?: string) =>
    apiGet<LinkCollection>(`/runs/${encodeURIComponent(runId)}/links`, { period, metric }),
  link: (runId: string, linkId: string) =>
    apiGet<LinkProfile>(`/runs/${encodeURIComponent(runId)}/links/${encodeURIComponent(linkId)}`),
  checkCatalogue: () => apiGet<CheckDefinition[]>('/checks'),
  healthDefinition: () => apiGet<HealthDefinition>('/config/health'),
  reportUrl: (runId: string, kind: 'docx' | 'pdf') =>
    fileUrl(`/runs/${encodeURIComponent(runId)}/report.${kind}`),
};
