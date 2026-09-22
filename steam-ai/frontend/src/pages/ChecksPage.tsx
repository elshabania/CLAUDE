import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCheckCatalogue, useRunChecks } from '../api/queries';
import type { CheckDefinition, CheckResult } from '../api/types';
import { SEVERITIES } from '../api/types';
import { useCurrentRun } from '../app/RunContext';
import { Disclosure } from '../components/Disclosure';
import { SeverityBadge } from '../components/SeverityBadge';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { fmtNumber, fmtValue } from '../lib/format';

export default function ChecksPage() {
  const { runId: contextRun, runs } = useCurrentRun();
  const [params] = useSearchParams();
  const runId = params.get('run') && runs.some((r) => r.run_id === params.get('run')) ? params.get('run')! : contextRun;
  const catalogue = useCheckCatalogue();
  const results = useRunChecks(runId);

  const rows = useMemo(() => {
    const byId = new Map<string, CheckResult>();
    for (const r of results.data ?? []) byId.set(r.check_id, r);
    const defs: CheckDefinition[] = catalogue.data ?? [];
    const out = defs.map((d) => ({ def: d, res: byId.get(d.check_id) }));
    // Checks that ran but are missing from the catalogue still appear.
    for (const r of results.data ?? []) {
      if (!defs.some((d) => d.check_id === r.check_id)) {
        out.push({ def: { check_id: r.check_id, name: r.check_name, enabled: true, params: {}, severity: [] }, res: r });
      }
    }
    return out;
  }, [catalogue.data, results.data]);

  return (
    <>
      <div className="section__head">
        <h1>Check catalogue</h1>
        <span className="section__meta">
          {runId ? (
            <>
              status for <code>{runId}</code>
            </>
          ) : (
            'no run selected'
          )}
        </span>
      </div>
      <p className="prose muted" style={{ marginBlockEnd: 'var(--space-3)' }}>
        Thresholds, severity bands and enablement come from <code>config/checks.yaml</code>. Bands are evaluated top-down; the first match wins.
      </p>
      {catalogue.isLoading ? (
        <Loading what="check catalogue" />
      ) : catalogue.error ? (
        <ErrorState error={catalogue.error} what="check catalogue" />
      ) : !rows.length ? (
        <EmptyState>The catalogue is empty.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Checks">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Status</th>
                <th scope="col">Findings</th>
                <th scope="col" className="num">
                  Rows
                </th>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col">Configuration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ def, res }) => (
                <tr key={def.check_id} className="check-row" tabIndex={0} style={{ cursor: 'default' }}>
                  <td>
                    {def.name}
                    <div className="small check-desc" style={{ fontWeight: 400 }}>
                      {def.description}
                    </div>
                    <code className="muted">{def.check_id}</code>
                    {!def.enabled ? <span className="tag" style={{ marginInlineStart: '0.5em' }}>disabled</span> : null}
                  </td>
                  <td>
                    {results.isLoading ? (
                      <span className="muted small">…</span>
                    ) : results.error ? (
                      <span className="small" style={{ color: 'var(--sev-critical)' }}>
                        unavailable
                      </span>
                    ) : res ? (
                      <>
                        <span className={`status status--${res.status}`}>{res.status}</span>
                        {res.message ? <div className="small muted">{res.message}</div> : null}
                      </>
                    ) : (
                      <span className="muted small">not run</span>
                    )}
                  </td>
                  <td>
                    {res?.counts ? (
                      <span style={{ display: 'inline-flex', gap: '0.6em', flexWrap: 'wrap' }}>
                        {SEVERITIES.filter((s) => (res.counts?.[s] ?? 0) > 0).map((s) => (
                          <Link key={s} to={`/runs/${encodeURIComponent(runId!)}/findings?check=${def.check_id}&severity=${s}`} className="sev-link" style={{ textDecoration: 'none' }}>
                            <SeverityBadge severity={s} short /> {res.counts?.[s]}
                          </Link>
                        ))}
                        {!res.counts.total ? <span className="muted small">none</span> : null}
                      </span>
                    ) : res && res.status === 'ok' ? (
                      <span className="muted small">–</span>
                    ) : null}
                  </td>
                  <td className="num">{res ? fmtNumber(res.rows_examined) : ''}</td>
                  <td className="num nowrap">{res ? `${fmtNumber(res.duration_s, 1)} s` : ''}</td>
                  <td style={{ minInlineSize: '16rem' }}>
                    <Disclosure summary="Severity rules and parameters">
                      <ul className="rule-list">
                        {def.severity.map((r, i) => (
                          <li key={i}>
                            <SeverityBadge severity={r.severity} short /> <code>{r.when}</code>
                          </li>
                        ))}
                      </ul>
                      {Object.keys(def.params).length ? (
                        <table className="kv kv--compact" style={{ marginBlockStart: 'var(--space-2)' }}>
                          <tbody>
                            {Object.entries(def.params).map(([k, v]) => (
                              <tr key={k}>
                                <th scope="row">
                                  <code>{k}</code>
                                </th>
                                <td className="mono">{fmtValue(v)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </Disclosure>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
