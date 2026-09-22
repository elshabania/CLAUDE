import { Link } from 'react-router-dom';
import type { Finding } from '../api/types';
import { fmtDateTime, fmtValue, locationLabel } from '../lib/format';
import { Disclosure } from './Disclosure';
import { SeverityBadge } from './SeverityBadge';
import { SourcesList } from './Sources';

/** Evidence values with matching thresholds side by side. */
export function EvidenceTable({ values, thresholds }: { values: Record<string, unknown>; thresholds: Record<string, unknown> }) {
  const keys = Array.from(new Set([...Object.keys(values), ...Object.keys(thresholds)]));
  if (!keys.length) return <p className="muted small">No evidence values.</p>;
  return (
    <table className="kv kv--compact">
      <thead>
        <tr>
          <th scope="col">Quantity</th>
          <th scope="col" className="num">
            Value
          </th>
          <th scope="col" className="num">
            Threshold
          </th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <th scope="row">
              <code>{k}</code>
            </th>
            <td className="num">{k in values ? fmtValue(values[k]) : ''}</td>
            <td className="num muted">{k in thresholds ? fmtValue(thresholds[k]) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ModellerView({ finding }: { finding: Finding }) {
  const ev = finding.evidence;
  return (
    <div>
      <p className="prose">{finding.modeller_view}</p>
      {ev.period ? (
        <p className="prose muted">Period: {ev.period}</p>
      ) : null}
      <div className="label" style={{ marginBlockStart: 'var(--space-3)' }}>
        Evidence
      </div>
      <EvidenceTable values={ev.values} thresholds={ev.thresholds} />
      <div className="label" style={{ marginBlockStart: 'var(--space-3)' }}>
        Sources
      </div>
      <SourcesList sources={ev.sources} />
      {ev.query ? (
        <>
          <div className="label" style={{ marginBlockStart: 'var(--space-3)' }}>
            Query
          </div>
          <pre tabIndex={0}>{ev.query}</pre>
        </>
      ) : null}
    </div>
  );
}

export function MeasuresList({ finding }: { finding: Finding }) {
  if (!finding.measures.length) return null;
  return (
    <div>
      <div className="label">Proposed measures</div>
      {finding.measures.map((m) => (
        <div className="measure" key={m.measure_id}>
          <div className="measure__title">{m.title}</div>
          <p className="prose">{m.description}</p>
          {m.estimated_effect ? <p className="prose muted">Estimated effect: {m.estimated_effect}</p> : null}
          <div className="measure__meta">
            <span>
              method <code>{m.method}</code>
            </span>
            <span>confidence {m.confidence}</span>
            {Object.keys(m.effect_values).length ? (
              <span>
                {Object.entries(m.effect_values)
                  .map(([k, v]) => `${k} = ${fmtValue(v)}`)
                  .join(' · ')}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function mapLinkFor(runId: string, f: Finding): string | null {
  const { lon, lat, type, id } = f.location;
  if (lon === null || lon === undefined || lat === null || lat === undefined) return null;
  const q = new URLSearchParams({ lon: String(lon), lat: String(lat), finding: f.finding_id });
  if (type === 'link') q.set('link', id);
  return `/runs/${encodeURIComponent(runId)}/map?${q.toString()}`;
}

/** Full finding: executive line first, then the modeller view. */
export function FindingDetail({ finding, runId }: { finding: Finding; runId: string }) {
  const mapHref = mapLinkFor(runId, finding);
  return (
    <>
      <p className="exec-line">{finding.executive_line}</p>
      <div className="finding-meta">
        <SeverityBadge severity={finding.severity} />
        <span>{finding.check_name}</span>
        <span className="muted">{locationLabel(finding.location)}</span>
        {!finding.is_significant ? <span className="tag tag--sig">inside noise band</span> : null}
      </div>
      <div className="finding-meta">
        {mapHref ? (
          <Link to={mapHref} className="btn">
            Show on map
          </Link>
        ) : (
          <span className="muted small">No map location for this finding.</span>
        )}
        <span className="muted small">
          <code>{finding.finding_id}</code> · {fmtDateTime(finding.created_at)}
        </span>
      </div>
      <div>
        <div className="label">Likely cause</div>
        <p className="prose">{finding.likely_cause}</p>
      </div>
      <div>
        <div className="label">Suggested action</div>
        <p className="prose">{finding.suggested_action}</p>
      </div>
      <MeasuresList finding={finding} />
      <Disclosure summary="Modeller view" defaultOpen>
        <ModellerView finding={finding} />
      </Disclosure>
    </>
  );
}
