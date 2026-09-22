import { lazy, Suspense, type ComponentProps } from 'react';

const Charts = {
  FindingsByCheck: lazy(() => import('./Charts').then((m) => ({ default: m.FindingsByCheckChart }))),
  FlowsByPeriod: lazy(() => import('./Charts').then((m) => ({ default: m.FlowsByPeriodChart }))),
  KpiDelta: lazy(() => import('./Charts').then((m) => ({ default: m.KpiDeltaChart }))),
};

const fallback = <div className="chart muted small">Loading chart…</div>;

export function FindingsByCheckChart(p: ComponentProps<typeof Charts.FindingsByCheck>) {
  return (
    <Suspense fallback={fallback}>
      <Charts.FindingsByCheck {...p} />
    </Suspense>
  );
}
export function FlowsByPeriodChart(p: ComponentProps<typeof Charts.FlowsByPeriod>) {
  return (
    <Suspense fallback={fallback}>
      <Charts.FlowsByPeriod {...p} />
    </Suspense>
  );
}
export function KpiDeltaChart(p: ComponentProps<typeof Charts.KpiDelta>) {
  return (
    <Suspense fallback={fallback}>
      <Charts.KpiDelta {...p} />
    </Suspense>
  );
}
