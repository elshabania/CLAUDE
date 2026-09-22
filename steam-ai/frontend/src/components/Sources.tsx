import type { SourceRef } from '../api/types';

export function SourcesList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <p className="muted small">No source references recorded.</p>;
  return (
    <ul className="rule-list">
      {sources.map((s, i) => (
        <li key={i}>
          <code>{s.file}</code>
          {s.row !== null && s.row !== undefined ? <span className="muted">row {s.row}</span> : null}
          {s.table ? <span className="muted">table {s.table}</span> : null}
          {s.column ? <span className="muted">column {s.column}</span> : null}
        </li>
      ))}
    </ul>
  );
}
