import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCheckCatalogue, useFindings } from '../api/queries';
import type { Finding, LocationType, Severity } from '../api/types';
import { LOCATION_TYPES, SEVERITIES, SEVERITY_RANK } from '../api/types';
import { useCurrentRun } from '../app/RunContext';
import { FindingDetail } from '../components/FindingDetail';
import { SeverityBadge } from '../components/SeverityBadge';
import { EmptyState, ErrorState, Loading } from '../components/States';

type SortKey = 'severity' | 'check' | 'location' | 'executive' | 'significant';
const SORT_KEYS: SortKey[] = ['severity', 'check', 'location', 'executive', 'significant'];

export default function FindingsPage() {
  const { runId, isLoading: runsLoading, error: runsError } = useCurrentRun();
  const [params, setParams] = useSearchParams();

  const severity = (params.get('severity') ?? '') as Severity | '';
  const checkId = params.get('check') ?? '';
  const locationType = (params.get('location_type') ?? '') as LocationType | '';
  const significantOnly = params.get('significant') === '1';
  const sort = (SORT_KEYS.includes(params.get('sort') as SortKey) ? params.get('sort') : 'severity') as SortKey;
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const selectedId = params.get('finding');

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const query = useFindings(runId, {
    severity: severity || undefined,
    check_id: checkId || undefined,
    location_type: locationType || undefined,
    significant_only: significantOnly,
    limit: 1000,
  });
  const catalogue = useCheckCatalogue();

  const items = useMemo(() => {
    const list = query.data?.items ?? [];
    const cmp: Record<SortKey, (a: Finding, b: Finding) => number> = {
      severity: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.check_id.localeCompare(b.check_id),
      check: (a, b) => a.check_name.localeCompare(b.check_name) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
      location: (a, b) => a.location.type.localeCompare(b.location.type) || a.location.id.localeCompare(b.location.id, undefined, { numeric: true }),
      executive: (a, b) => a.executive_line.localeCompare(b.executive_line),
      significant: (a, b) => Number(b.is_significant) - Number(a.is_significant) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    };
    const sorted = [...list].sort(cmp[sort]);
    return dir === 'desc' ? sorted.reverse() : sorted;
  }, [query.data, sort, dir]);

  const selected = useMemo(() => items.find((f) => f.finding_id === selectedId) ?? query.data?.items.find((f) => f.finding_id === selectedId), [items, query.data, selectedId]);

  const checkOptions = useMemo(() => {
    const fromCatalogue = catalogue.data?.map((c) => [c.check_id, c.name] as const) ?? [];
    if (fromCatalogue.length) return fromCatalogue;
    const m = new Map<string, string>();
    for (const f of query.data?.items ?? []) m.set(f.check_id, f.check_name);
    return Array.from(m.entries());
  }, [catalogue.data, query.data]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setParam('dir', dir === 'asc' ? 'desc' : 'asc');
    else {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('sort', key);
          next.delete('dir');
          return next;
        },
        { replace: true },
      );
    }
  };

  const tableRef = useRef<HTMLTableSectionElement>(null);
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, f: Finding, idx: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setParam('finding', f.finding_id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = tableRef.current?.querySelectorAll<HTMLTableRowElement>('tr[tabindex]');
      rows?.[idx + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    }
  };

  const [closeFocus, setCloseFocus] = useState(false);
  useEffect(() => {
    if (closeFocus && !selectedId) {
      tableRef.current?.querySelector<HTMLTableRowElement>('tr[aria-selected="true"], tr[tabindex]')?.focus();
      setCloseFocus(false);
    }
  }, [closeFocus, selectedId]);

  if (runsError) return <ErrorState error={runsError} what="runs" />;
  if (runsLoading) return <Loading what="runs" />;
  if (!runId) return <EmptyState>No runs have been ingested yet.</EmptyState>;

  const sortIndicator = (k: SortKey) => (sort === k ? <span aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span> : null);
  const ariaSort = (k: SortKey) => (sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <>
      <div className="section__head">
        <h1>Findings</h1>
        <span className="section__meta">
          <code>{runId}</code>
        </span>
      </div>

      <div className="toolbar" role="search" aria-label="Filter findings">
        <label className="field">
          Severity
          <select className="select" value={severity} onChange={(e) => setParam('severity', e.target.value)}>
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Check
          <select className="select" value={checkId} onChange={(e) => setParam('check', e.target.value)}>
            <option value="">All</option>
            {checkOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Location type
          <select className="select" value={locationType} onChange={(e) => setParam('location_type', e.target.value)}>
            <option value="">All</option>
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox" style={{ paddingBlockEnd: '0.4rem' }}>
          <input type="checkbox" checked={significantOnly} onChange={(e) => setParam('significant', e.target.checked ? '1' : null)} />
          Significant only
        </label>
        {severity || checkId || locationType || significantOnly ? (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  ['severity', 'check', 'location_type', 'significant'].forEach((k) => next.delete(k));
                  return next;
                },
                { replace: true },
              )
            }
          >
            Clear filters
          </button>
        ) : null}
        <span className="toolbar__spacer" />
        <span className="toolbar__count" aria-live="polite">
          {query.data ? `${items.length} of ${query.data.total} shown` : ''}
        </span>
      </div>

      <div className={`split ${selected ? 'split--open' : ''}`}>
        <div>
          {query.isLoading ? (
            <Loading what="findings" />
          ) : query.error ? (
            <ErrorState error={query.error} what="findings" />
          ) : !items.length ? (
            <EmptyState>No findings match these filters.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" aria-label="Findings">
                <thead>
                  <tr>
                    <th scope="col" aria-sort={ariaSort('severity')}>
                      <button className="sort" onClick={() => toggleSort('severity')}>
                        Severity {sortIndicator('severity')}
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort('check')}>
                      <button className="sort" onClick={() => toggleSort('check')}>
                        Check {sortIndicator('check')}
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort('location')}>
                      <button className="sort" onClick={() => toggleSort('location')}>
                        Location {sortIndicator('location')}
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort('executive')}>
                      <button className="sort" onClick={() => toggleSort('executive')}>
                        Executive line {sortIndicator('executive')}
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort('significant')}>
                      <button className="sort" onClick={() => toggleSort('significant')}>
                        Significant {sortIndicator('significant')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody ref={tableRef}>
                  {items.map((f, i) => (
                    <tr
                      key={f.finding_id}
                      tabIndex={0}
                      aria-selected={f.finding_id === selectedId}
                      className={f.is_significant ? undefined : 'is-dim'}
                      onClick={() => setParam('finding', f.finding_id)}
                      onKeyDown={(e) => onRowKey(e, f, i)}
                    >
                      <td>
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="nowrap">{f.check_name}</td>
                      <td>
                        <span className="muted">{f.location.type}</span> {f.location.label ?? f.location.id}
                        {f.location.label ? <span className="muted"> · {f.location.id}</span> : null}
                      </td>
                      <td>{f.executive_line}</td>
                      <td>{f.is_significant ? 'yes' : <span className="muted">noise band</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected ? (
          <aside className="panel" aria-label="Finding detail">
            <div className="panel__head">
              <h2>{selected.check_name}</h2>
              <button
                type="button"
                className="panel__close"
                aria-label="Close finding detail"
                onClick={() => {
                  setCloseFocus(true);
                  setParam('finding', null);
                }}
              >
                ×
              </button>
            </div>
            <div className="panel__body">
              <FindingDetail finding={selected} runId={runId} />
            </div>
          </aside>
        ) : selectedId && query.data ? (
          <aside className="panel" aria-label="Finding detail">
            <div className="panel__head">
              <h2>Finding not in this list</h2>
              <button type="button" className="panel__close" aria-label="Close" onClick={() => setParam('finding', null)}>
                ×
              </button>
            </div>
            <div className="panel__body">
              <p className="small muted">
                <code>{selectedId}</code> is not among the filtered findings. Clear the filters to find it.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
