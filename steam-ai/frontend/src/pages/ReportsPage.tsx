import { api } from '../api/client';
import { useRun } from '../api/queries';
import { useCurrentRun } from '../app/RunContext';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { fmtBytes, fmtDateTime, fmtNumber } from '../lib/format';

export default function ReportsPage() {
  const { runId, isLoading, error } = useCurrentRun();
  const run = useRun(runId);
  if (error) return <ErrorState error={error} what="runs" />;
  if (isLoading) return <Loading what="runs" />;
  if (!runId) return <EmptyState>No runs have been ingested yet.</EmptyState>;

  const generatedAt = run.data?.report_generated_at ?? run.data?.ingested_at;

  return (
    <>
      <div className="section__head">
        <h1>Diagnostic report</h1>
        <span className="section__meta">
          <code>{runId}</code>
        </span>
      </div>
      <p className="prose">
        The report is generated at ingest and marked DRAFT for modeller review. It carries the same findings, KPIs and sources shown here.
      </p>
      <div className="report-links">
        <a className="report-link" href={api.reportUrl(runId, 'docx')} download={`${runId}-report.docx`}>
          <strong>Word document (.docx)</strong>
          <span className="small muted">Editable; for the modelling team</span>
        </a>
        <a className="report-link" href={api.reportUrl(runId, 'pdf')} download={`${runId}-report.pdf`}>
          <strong>PDF</strong>
          <span className="small muted">Fixed layout; for circulation</span>
        </a>
      </div>
      {run.isLoading ? (
        <Loading what="run details" />
      ) : run.error ? (
        <ErrorState error={run.error} what="run details" />
      ) : run.data ? (
        <>
          <p className="small muted">
            Generated {fmtDateTime(generatedAt)}
            {!run.data.report_generated_at ? ' (report time not recorded; showing ingest time)' : ''} · STEAM {run.data.steam_version} · source <code>{run.data.source_root}</code>
          </p>
          <section className="section" style={{ marginBlockStart: 'var(--space-5)' }}>
            <div className="section__head">
              <h2>Files in this run</h2>
              <span className="section__meta">{run.data.files.length} files · {Object.keys(run.data.tables).length} tables</span>
            </div>
            <table className="kv">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Table</th>
                  <th scope="col" className="num">
                    Size
                  </th>
                  <th scope="col">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {run.data.files.map((f) => (
                  <tr key={f.path}>
                    <td>
                      <code>{f.path}</code>
                    </td>
                    <td>
                      {f.table ?? '–'}
                      {f.table && run.data?.tables[f.table] ? <span className="muted"> · {fmtNumber(run.data.tables[f.table])} rows</span> : null}
                    </td>
                    <td className="num">{fmtBytes(f.size)}</td>
                    <td className="mono muted">{f.sha256 ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </>
  );
}
