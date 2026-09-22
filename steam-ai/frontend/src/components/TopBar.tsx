import { NavLink, Link } from 'react-router-dom';
import { useCurrentRun } from '../app/RunContext';

export function TopBar() {
  const { runId, run, runs, isLoading, error, selectRun, pathFor } = useCurrentRun();
  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand">
        STEAM-AI
      </Link>
      <nav className="topbar__nav" aria-label="Primary">
        <NavLink to={pathFor('')} end>
          Home
        </NavLink>
        <NavLink to={pathFor('findings')}>Findings</NavLink>
        <NavLink to={pathFor('map')}>Map</NavLink>
        <NavLink to="/checks">Checks</NavLink>
        <NavLink to={pathFor('reports')}>Reports</NavLink>
      </nav>
      <div className="topbar__spacer" />
      {run?.is_synthetic ? (
        <span className="badge-synthetic" title="This run was generated for testing, not a STEAM output">
          Synthetic data
        </span>
      ) : run?.provenance ? (
        <span className="badge-provenance" title={run.provenance}>
          {/no steam outputs/i.test(run.provenance) ? 'STEAM inputs only' : 'STEAM run'}
        </span>
      ) : null}
      <div className="topbar__run">
        <label htmlFor="run-select">Run</label>
        {error ? (
          <span className="small" style={{ color: 'var(--sev-critical)' }}>
            runs unavailable
          </span>
        ) : (
          <select
            id="run-select"
            className="select"
            value={runId ?? ''}
            onChange={(e) => selectRun(e.target.value)}
            disabled={isLoading || !runs.length}
          >
            {!runs.length ? <option value="">{isLoading ? 'Loading…' : 'No runs'}</option> : null}
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.scenario_name} · {r.run_id}
                {r.health ? ` · ${r.health.grade}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
    </header>
  );
}
