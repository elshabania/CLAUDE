import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRuns } from '../api/queries';
import type { RunSummary } from '../api/types';

const STORAGE_KEY = 'steam-ai.run';

export interface RunContextValue {
  runId: string | undefined;
  run: RunSummary | undefined;
  runs: RunSummary[];
  isLoading: boolean;
  error: Error | null;
  selectRun: (runId: string) => void;
  /** Build a path for the current (or given) run. */
  pathFor: (suffix: '' | 'findings' | 'map' | 'reports', runId?: string) => string;
}

const Ctx = createContext<RunContextValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function RunProvider({ children }: { children: ReactNode }) {
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const { data: runs = [], isLoading, error } = useRuns();
  const navigate = useNavigate();
  const location = useLocation();

  const runId = useMemo(() => {
    if (routeRunId) return routeRunId;
    const stored = readStored();
    if (stored && runs.some((r) => r.run_id === stored)) return stored;
    return runs[0]?.run_id;
  }, [routeRunId, runs]);

  useEffect(() => {
    if (!runId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, runId);
    } catch {
      /* private mode */
    }
  }, [runId]);

  // On "/" once runs are known, settle on a canonical URL so the run is shareable.
  useEffect(() => {
    if (location.pathname === '/' && runId) navigate(`/runs/${encodeURIComponent(runId)}`, { replace: true });
  }, [location.pathname, runId, navigate]);

  const value = useMemo<RunContextValue>(() => {
    const pathFor: RunContextValue['pathFor'] = (suffix, id = runId) => {
      if (!id) return suffix ? `/${suffix}` : '/';
      const base = `/runs/${encodeURIComponent(id)}`;
      return suffix ? `${base}/${suffix}` : base;
    };
    const selectRun = (id: string) => {
      const m = /^\/runs\/[^/]+(\/(findings|map|reports))?/.exec(location.pathname);
      const suffix = (m?.[2] as 'findings' | 'map' | 'reports' | undefined) ?? '';
      if (location.pathname.startsWith('/checks')) {
        try {
          window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* ignore */
        }
        navigate(`/checks?run=${encodeURIComponent(id)}`, { replace: true });
        return;
      }
      navigate(pathFor(suffix, id));
    };
    return {
      runId,
      run: runs.find((r) => r.run_id === runId),
      runs,
      isLoading,
      error: (error as Error | null) ?? null,
      selectRun,
      pathFor,
    };
  }, [runId, runs, isLoading, error, navigate, location.pathname]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentRun(): RunContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCurrentRun outside RunProvider');
  return v;
}
