import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useChanges, useFindings, useHealth, useKpis, useRun } from '../api/queries';
import type { Finding, HealthScore, KPI, RunChanges, Severity } from '../api/types';
import { SEVERITIES, SEVERITY_RANK } from '../api/types';
import { useCurrentRun } from '../app/RunContext';
import { Disclosure } from '../components/Disclosure';
import { ModellerView } from '../components/FindingDetail';
import { SeverityBadge } from '../components/SeverityBadge';
import { SourcesList } from '../components/Sources';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FindingsByCheckChart, KpiDeltaChart } from '../components/charts';
import { fmtDateTime, fmtDelta, fmtKpi, fmtNumber, locationLabel } from '../lib/format';

export default function HomePage() {
  const { runId, runs, isLoading, error } = useCurrentRun();
  const run = useRun(runId);
  const health = useHealth(runId);
  const findings = useFindings(runId, { limit: 500 });
  const changes = useChanges(runId);
  const kpis = useKpis(runId);

  if (error) return <ErrorState error={error} what="runs" />;
  if (isLoading) return <Loading what="runs" />;
  if (!runId) return <EmptyState>No runs have been ingested yet. Use <code>POST /runs/ingest</code> or the CLI to add one.</EmptyState>;

  return (
    <>
      <div className="section__head" style={{ marginBlockEnd: 'var(--space-5)' }}>
        <div>
          <h1>{run.data?.scenario_name ?? runs.find((r) => r.run_id === runId)?.scenario_name ?? runId}</h1>
          <div className="section__meta">
            <code>{runId}</code>
            {run.data ? (
              <>
                {' '}· horizon {run.data.horizon_year} · policy set {run.data.policy_set} · STEAM {run.data.steam_version} · ingested{' '}
                {fmtDateTime(run.data.ingested_at)}
                {run.data.base_run_id ? (
                  <>
                    {' '}· base <Link to={`/runs/${encodeURIComponent(run.data.base_run_id)}`}>{run.data.base_run_id}</Link>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="home-grid">
        <div>
          <section className="section" aria-labelledby="h-health">
            <div className="section__head">
              <h2 id="h-health">Run health</h2>
            </div>
            {health.isLoading ? <Loading what="health" /> : health.error ? <ErrorState error={health.error} what="health" /> : health.data ? <HealthBlock h={health.data} /> : null}
          </section>

          <section className="section" aria-labelledby="h-counts">
            <div className="section__head">
              <h2 id="h-counts">Findings by severity</h2>
              <Link to={`/runs/${encodeURIComponent(runId)}/findings`} className="small">
                All findings
              </Link>
            </div>
            {health.data ? <SeverityCounts counts={health.data.counts} runId={runId} /> : findings.data ? <SeverityCounts counts={countBy(findings.data.items)} runId={runId} /> : null}
            {findings.data?.items.length ? <ByCheck items={findings.data.items} /> : null}
          </section>
        </div>

        <div>
          <section className="section" aria-labelledby="h-top">
            <div className="section__head">
              <h2 id="h-top">Top five issues</h2>
              {findings.data ? <span className="section__meta">{findings.data.total} findings in total</span> : null}
            </div>
            {findings.isLoading ? (
              <Loading what="findings" />
            ) : findings.error ? (
              <ErrorState error={findings.error} what="findings" />
            ) : findings.data && findings.data.items.length ? (
              <TopIssues items={findings.data.items} runId={runId} />
            ) : (
              <EmptyState>No findings for this run. Every enabled check passed.</EmptyState>
            )}
          </section>
        </div>
      </div>

      <section className="section" aria-labelledby="h-changes">
        <div className="section__head">
          <h2 id="h-changes">What changed since the base run</h2>
          {changes.data?.base_run_id ? (
            <span className="section__meta">
              base run <Link to={`/runs/${encodeURIComponent(changes.data.base_run_id)}`}>{changes.data.base_run_id}</Link>
            </span>
          ) : null}
        </div>
        {changes.isLoading ? <Loading what="changes" /> : changes.error ? <ErrorState error={changes.error} what="changes" /> : changes.data ? <ChangesPanel c={changes.data} runId={runId} /> : null}
      </section>

      <section className="section" aria-labelledby="h-kpis">
        <div className="section__head">
          <h2 id="h-kpis">Key indicators</h2>
          <span className="section__meta">Definitions in config/kpis.yaml; hover or focus the (i) for each</span>
        </div>
        {kpis.isLoading ? <Loading what="KPIs" /> : kpis.error ? <ErrorState error={kpis.error} what="KPIs" /> : kpis.data?.length ? <KpiStrip kpis={kpis.data} /> : <EmptyState>No KPIs computed for this run.</EmptyState>}
      </section>
    </>
  );
}

function countBy(items: Finding[]): Partial<Record<Severity, number>> {
  const c: Partial<Record<Severity, number>> = {};
  for (const f of items) c[f.severity] = (c[f.severity] ?? 0) + 1;
  return c;
}

function HealthBlock({ h }: { h: HealthScore }) {
  return (
    <div>
      <div className="health">
        <div className="health__score" aria-label={`Health score ${h.score} out of 100`}>
          {fmtNumber(h.score, 0)}
        </div>
        <div className="health__side">
          <div>
            <span className="health__grade" aria-label={`Grade ${h.grade}`}>
              {h.grade}
            </span>
          </div>
          <div className="health__caption">out of 100 · grade {h.grade}</div>
        </div>
      </div>
      <div className="health__components">
        {h.components.map((c) => (
          <div className="bar" key={c.name}>
            <span>
              {c.name} <span className="muted">× {c.weight}</span>
            </span>
            <div className="bar__track" aria-hidden="true">
              <div className="bar__fill" style={{ inlineSize: `${Math.max(0, Math.min(100, c.score))}%` }} />
            </div>
            <span className="bar__value">{fmtNumber(c.score, 1)}</span>
            <span className="bar__detail">{c.detail}</span>
          </div>
        ))}
      </div>
      <Disclosure summary="How is this computed?">
        <p className="prose">{h.definition}</p>
      </Disclosure>
    </div>
  );
}

function SeverityCounts({ counts, runId }: { counts: Partial<Record<Severity, number>>; runId: string }) {
  return (
    <div className="sev-counts">
      {SEVERITIES.map((s) => (
        <Link key={s} className={`sev-count sev-count--${s}`} to={`/runs/${encodeURIComponent(runId)}/findings?severity=${s}`}>
          <span className="sev-count__n">{counts[s] ?? 0}</span>
          <SeverityBadge severity={s} />
        </Link>
      ))}
    </div>
  );
}

function ByCheck({ items }: { items: Finding[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, Record<Severity, number>>();
    for (const f of items) {
      const r = m.get(f.check_name) ?? { Critical: 0, High: 0, Medium: 0, Info: 0 };
      r[f.severity] += 1;
      m.set(f.check_name, r);
    }
    return Array.from(m, ([check, counts]) => ({ check, counts })).sort(
      (a, b) => Object.values(b.counts).reduce((x, y) => x + y, 0) - Object.values(a.counts).reduce((x, y) => x + y, 0),
    );
  }, [items]);
  return (
    <div style={{ marginBlockStart: 'var(--space-4)' }}>
      <div className="label">By check</div>
      <FindingsByCheckChart rows={rows} />
    </div>
  );
}

function TopIssues({ items, runId }: { items: Finding[]; runId: string }) {
  const top = useMemo(
    () =>
      [...items]
        .sort((a, b) => Number(b.is_significant) - Number(a.is_significant) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.check_id.localeCompare(b.check_id))
        .slice(0, 5),
    [items],
  );
  return (
    <ol className="issues">
      {top.map((f, i) => (
        <li className="issue" key={f.finding_id}>
          <span className="issue__n">{i + 1}</span>
          <div>
            <p className="issue__exec">{f.executive_line}</p>
            <div className="issue__meta">
              <SeverityBadge severity={f.severity} />
              <span>{locationLabel(f.location)}</span>
              <span className="muted">{f.check_name}</span>
              <Link to={`/runs/${encodeURIComponent(runId)}/findings?finding=${encodeURIComponent(f.finding_id)}`} className="small">
                Open
              </Link>
            </div>
            <Disclosure summary="Modeller view">
              <ModellerView finding={f} />
            </Disclosure>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChangesPanel({ c, runId }: { c: RunChanges; runId: string }) {
  if (!c.base_run_id) return <p className="muted small">No base run declared.</p>;
  const inputs = c.inputs ?? [];
  const fn = c.findings;
  const newF = Array.isArray(fn?.new) ? fn!.new : [];
  const resolved = Array.isArray(fn?.resolved) ? fn!.resolved : [];
  const unchanged = fn ? (Array.isArray(fn.unchanged) ? fn.unchanged.length : fn.unchanged) : 0;
  const kpis = c.kpis ?? [];
  return (
    <div className="changes">
      <div>
        <h3>Inputs ({inputs.length})</h3>
        {inputs.length ? (
          <ul className="change-list">
            {inputs.map((d, i) => (
              <li key={i}>
                <span className={`change-kind change-kind--${d.change}`}>{d.change}</span>
                <span>
                  <code>{d.file}</code>
                  {d.rows_changed != null ? <span className="muted"> · {fmtNumber(d.rows_changed)} rows</span> : null}
                  {d.detail ? <div className="muted">{d.detail}</div> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No input differences recorded.</p>
        )}
      </div>
      <div>
        <h3>
          Findings · {newF.length} new · {resolved.length} resolved · {unchanged} unchanged
        </h3>
        <ul className="change-list">
          {newF.map((f) => (
            <li key={f.finding_id}>
              <span className="change-kind change-kind--added">new</span>
              <span>
                <SeverityBadge severity={f.severity} short /> {f.executive_line}{' '}
                <Link to={`/runs/${encodeURIComponent(runId)}/findings?finding=${encodeURIComponent(f.finding_id)}`}>open</Link>
              </span>
            </li>
          ))}
          {resolved.map((f) => (
            <li key={f.finding_id}>
              <span className="change-kind change-kind--removed">resolved</span>
              <span className="muted">
                <SeverityBadge severity={f.severity} short /> {f.executive_line}
              </span>
            </li>
          ))}
          {!newF.length && !resolved.length ? <li className="muted">No findings appeared or disappeared.</li> : null}
        </ul>
      </div>
      <div>
        <h3>KPI deltas</h3>
        {kpis.length ? (
          <>
            <KpiDeltaChart deltas={kpis} />
            <table className="kv kv--compact">
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.kpi_id}>
                    <th scope="row">{k.name}</th>
                    <td className="num muted">{fmtKpi(k.base_value, k.unit)}</td>
                    <td className="num">{fmtKpi(k.value, k.unit)}</td>
                    <td className={`num delta ${k.is_significant === false ? 'delta--ns' : (k.delta ?? 0) > 0 ? 'delta--pos' : (k.delta ?? 0) < 0 ? 'delta--neg' : ''}`}>
                      {fmtDelta(k.delta, k.unit)}
                      {k.is_significant === false ? <span className="muted"> (noise)</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted small">No KPI deltas.</p>
        )}
      </div>
    </div>
  );
}

function KpiStrip({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="kpi-strip">
      {kpis.map((k) => (
        <div className="kpi" key={k.kpi_id}>
          <div className="kpi__name">
            {k.name}
            {k.period && !k.name.includes(k.period) ? <span className="muted"> · {k.period}</span> : null}
          </div>
          <div className="kpi__value">{fmtKpi(k.value, k.unit)}</div>
          <button type="button" className="kpi__def" aria-describedby={`kpi-def-${k.kpi_id}`} aria-label={`Definition of ${k.name}`}>
            i
          </button>
          <div className="kpi__tip" role="tooltip" id={`kpi-def-${k.kpi_id}`}>
            <p>{k.definition}</p>
            {k.sources.length ? (
              <div style={{ marginBlockStart: 'var(--space-2)' }}>
                <SourcesList sources={k.sources} />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
