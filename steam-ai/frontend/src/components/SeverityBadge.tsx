import type { Severity } from '../api/types';
import { SEVERITY_LETTER } from '../lib/severity';

export function SeverityBadge({ severity, short = false }: { severity: Severity; short?: boolean }) {
  return (
    <span className={`sev sev--${severity}`} title={severity}>
      <span className="sev__letter" aria-hidden="true">
        {SEVERITY_LETTER[severity]}
      </span>
      {short ? <span className="visually-hidden">{severity}</span> : <span className="sev__text">{severity}</span>}
    </span>
  );
}
