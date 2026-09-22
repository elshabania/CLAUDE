import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { FindingsQuery } from './types';

const STALE = 60_000;

export const useRuns = () => useQuery({ queryKey: ['runs'], queryFn: api.runs, staleTime: STALE });

export const useRun = (runId?: string) =>
  useQuery({ queryKey: ['run', runId], queryFn: () => api.run(runId!), enabled: !!runId, staleTime: STALE });

export const useHealth = (runId?: string) =>
  useQuery({ queryKey: ['health', runId], queryFn: () => api.health(runId!), enabled: !!runId, staleTime: STALE });

export const useFindings = (runId?: string, q: FindingsQuery = {}) =>
  useQuery({
    queryKey: ['findings', runId, q],
    queryFn: () => api.findings(runId!, q),
    enabled: !!runId,
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });

export const useFinding = (runId?: string, findingId?: string) =>
  useQuery({
    queryKey: ['finding', runId, findingId],
    queryFn: () => api.finding(runId!, findingId!),
    enabled: !!runId && !!findingId,
    staleTime: STALE,
  });

export const useRunChecks = (runId?: string) =>
  useQuery({ queryKey: ['run-checks', runId], queryFn: () => api.checks(runId!), enabled: !!runId, staleTime: STALE });

export const useChanges = (runId?: string) =>
  useQuery({ queryKey: ['changes', runId], queryFn: () => api.changes(runId!), enabled: !!runId, staleTime: STALE });

export const useKpis = (runId?: string) =>
  useQuery({ queryKey: ['kpis', runId], queryFn: () => api.kpis(runId!), enabled: !!runId, staleTime: STALE });

export const useLinks = (runId?: string, period?: string) =>
  useQuery({
    queryKey: ['links', runId, period],
    queryFn: () => api.links(runId!, period!),
    enabled: !!runId && !!period,
    staleTime: 5 * STALE,
    gcTime: 10 * STALE,
  });

export const useLinkProfile = (runId?: string, linkId?: string | null) =>
  useQuery({
    queryKey: ['link', runId, linkId],
    queryFn: () => api.link(runId!, linkId!),
    enabled: !!runId && !!linkId,
    staleTime: STALE,
  });

export const useCheckCatalogue = () =>
  useQuery({ queryKey: ['check-catalogue'], queryFn: api.checkCatalogue, staleTime: 10 * STALE });
