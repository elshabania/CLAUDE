import { USE_MOCK } from '../api/client';

export function Footer() {
  return (
    <footer className="footer">
      <span>Every number traces to a file, a row and a rule.</span>
      <span>
        STEAM-AI · ITC STEAM v4 diagnostics{USE_MOCK ? ' · mock data mode' : ''}
      </span>
    </footer>
  );
}
