import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Map as MLMap } from 'maplibre-gl';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { useFindings, useLinkProfile, useLinks, useRun } from '../api/queries';
import type { Finding, LinkProfile, LinkProperties } from '../api/types';
import { SEVERITIES } from '../api/types';
import { useCurrentRun } from '../app/RunContext';
import { FindingDetail } from '../components/FindingDetail';
import { SeverityBadge } from '../components/SeverityBadge';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FlowsByPeriodChart } from '../components/charts';
import { SourcesList } from '../components/Sources';
import { fmtNumber } from '../lib/format';
import { legendStops, METRIC_SCALES, rgbToHex, type RGB } from '../lib/scales';
import { resolveSeverityRgb, SEVERITY_RADIUS_PX } from '../lib/severity';
import { buildColors, buildLinkBinary, buildWidths, maxOf, type MetricKey } from '../map/binary';
import { cssToken } from '../map/basemap';
import { MapView } from '../map/MapView';

const DEFAULT_PERIOD = 'AM';
const DEFAULT_VIEW = { lon: 54.4, lat: 24.45, zoom: 11.5 };
const METRICS: MetricKey[] = ['volume', 'vc', 'speed', 'delay', 'findings'];

interface Hover {
  x: number;
  y: number;
  link?: LinkProperties;
  finding?: Finding;
}

export default function MapPage() {
  const { runId, isLoading: runsLoading, error: runsError } = useCurrentRun();
  const [params, setParams] = useSearchParams();
  const run = useRun(runId);

  const periods = useMemo(() => {
    const p = run.data?.periods ?? [];
    return p.length ? p : [DEFAULT_PERIOD];
  }, [run.data]);
  const period = params.get('period') && periods.includes(params.get('period')!) ? params.get('period')! : periods.includes(DEFAULT_PERIOD) ? DEFAULT_PERIOD : periods[0];
  const metric = (METRICS.includes(params.get('metric') as MetricKey) ? params.get('metric') : 'vc') as MetricKey;
  const showFindings = params.get('findings') !== '0';
  const linkParam = params.get('link');
  const findingParam = params.get('finding');
  const lonParam = params.get('lon');
  const latParam = params.get('lat');

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const links = useLinks(runId, period);
  const findings = useFindings(runId, { limit: 2000 });
  const profile = useLinkProfile(runId, linkParam);

  const binary = useMemo(() => (links.data ? buildLinkBinary(links.data) : null), [links.data]);
  const sevRgb = useMemo(() => resolveSeverityRgb(), []);
  const colors = useMemo(() => (binary ? buildColors(binary, metric, sevRgb) : null), [binary, metric, sevRgb]);
  const maxVolume = useMemo(() => (binary ? maxOf(binary.volume) : 0), [binary]);
  const widths = useMemo(() => (binary ? buildWidths(binary, maxVolume) : null), [binary, maxVolume]);

  const mappedFindings = useMemo(
    () => (findings.data?.items ?? []).filter((f) => f.location.lon != null && f.location.lat != null),
    [findings.data],
  );
  const selectedFinding = useMemo(() => findings.data?.items.find((f) => f.finding_id === findingParam), [findings.data, findingParam]);

  const highlightPath = useMemo(() => {
    if (!binary || !linkParam) return null;
    const i = binary.indexById.get(linkParam);
    if (i === undefined) return null;
    const s = binary.startIndices[i], e = binary.startIndices[i + 1];
    const path: [number, number][] = [];
    for (let k = s; k < e; k++) path.push([binary.positions[k * 3], binary.positions[k * 3 + 1]]);
    return path;
  }, [binary, linkParam]);

  const accentRgb = useMemo<RGB>(() => {
    const hex = cssToken('--focus', '#0b63ce');
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }, []);

  const layers = useMemo<Layer[]>(() => {
    const out: Layer[] = [];
    if (highlightPath) {
      out.push(
        new PathLayer<{ path: [number, number][] }>({
          id: 'link-highlight',
          data: [{ path: highlightPath }],
          getPath: (d) => d.path,
          getColor: [accentRgb[0], accentRgb[1], accentRgb[2], 190],
          getWidth: 14,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          pickable: false,
        }),
      );
    }
    if (binary && colors && widths) {
      out.push(
        new PathLayer({
          id: 'links',
          data: {
            length: binary.length,
            startIndices: binary.startIndices,
            attributes: {
              getPath: { value: binary.positions, size: 3 },
              getColor: { value: colors, size: 4 },
              getWidth: { value: widths, size: 1 },
            },
          },
          _pathType: 'open',
          positionFormat: 'XYZ',
          widthUnits: 'pixels',
          widthMinPixels: 1,
          widthMaxPixels: 12,
          capRounded: true,
          jointRounded: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [accentRgb[0], accentRgb[1], accentRgb[2], 255],
          updateTriggers: { getColor: [colors], getWidth: [widths] },
        }),
      );
    }
    if (showFindings && mappedFindings.length) {
      out.push(
        new ScatterplotLayer<Finding>({
          id: 'findings',
          data: mappedFindings,
          getPosition: (f) => [f.location.lon as number, f.location.lat as number],
          getFillColor: (f) => {
            const c = sevRgb[f.severity];
            return [c[0], c[1], c[2], f.finding_id === findingParam ? 255 : 220];
          },
          getLineColor: [255, 255, 255, 230],
          getRadius: (f) => SEVERITY_RADIUS_PX[f.severity] * (f.finding_id === findingParam ? 1.4 : 1),
          radiusUnits: 'pixels',
          stroked: true,
          lineWidthMinPixels: 1.5,
          pickable: true,
          updateTriggers: { getFillColor: [findingParam], getRadius: [findingParam] },
        }),
      );
    }
    return out;
  }, [binary, colors, widths, highlightPath, accentRgb, showFindings, mappedFindings, sevRgb, findingParam]);

  // Hover tooltip
  const [hover, setHover] = useState<Hover | null>(null);
  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!info.picked) {
        setHover(null);
        return;
      }
      if (info.layer?.id === 'links' && binary && info.index >= 0) {
        setHover({ x: info.x, y: info.y, link: binary.props[info.index] });
      } else if (info.layer?.id === 'findings') {
        setHover({ x: info.x, y: info.y, finding: info.object as Finding });
      } else setHover(null);
    },
    [binary],
  );
  const onClick = useCallback(
    (info: PickingInfo) => {
      if (!info.picked) return;
      if (info.layer?.id === 'links' && binary && info.index >= 0) {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('link', binary.props[info.index].link_id);
            next.delete('finding');
            next.delete('lon');
            next.delete('lat');
            return next;
          },
          { replace: true },
        );
      } else if (info.layer?.id === 'findings') {
        const f = info.object as Finding;
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('finding', f.finding_id);
            if (f.location.type === 'link') next.set('link', f.location.id);
            else next.delete('link');
            return next;
          },
          { replace: true },
        );
      }
    },
    [binary, setParams],
  );

  // Centre: explicit lon/lat, else the highlighted link, else fit to data (once).
  const mapRef = useRef<MLMap | null>(null);
  const centredKey = useRef<string | null>(null);
  const centre = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    let key: string | null = null;
    let target: [number, number] | null = null;
    if (lonParam && latParam && Number.isFinite(Number(lonParam)) && Number.isFinite(Number(latParam))) {
      key = `ll:${lonParam},${latParam}`;
      target = [Number(lonParam), Number(latParam)];
    } else if (linkParam && binary) {
      const i = binary.indexById.get(linkParam);
      if (i !== undefined) {
        key = `link:${linkParam}`;
        target = [binary.centres[i * 2], binary.centres[i * 2 + 1]];
      }
    }
    if (key && target) {
      if (centredKey.current !== key) {
        centredKey.current = key;
        map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 13.5), duration: 600 });
      }
      return;
    }
    if (!centredKey.current && binary?.bbox) {
      centredKey.current = 'fit';
      const [minX, minY, maxX, maxY] = binary.bbox;
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 48, duration: 0 });
    }
  }, [lonParam, latParam, linkParam, binary]);
  useEffect(() => {
    centre();
  }, [centre]);
  const onReady = useCallback(
    (map: MLMap) => {
      mapRef.current = map;
      centre();
    },
    [centre],
  );

  // Drawer content
  const drawerLink = linkParam;
  const drawerOpen = !!drawerLink || !!findingParam;
  const closeDrawer = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ['link', 'finding', 'lon', 'lat'].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );

  if (runsError) return <div className="main"><ErrorState error={runsError} what="runs" /></div>;
  if (runsLoading) return <div className="main"><Loading what="runs" /></div>;
  if (!runId) return <div className="main"><EmptyState>No runs have been ingested yet.</EmptyState></div>;

  const scale = METRIC_SCALES[metric];
  const legend = metric === 'findings' ? null : legendStops(scale, 6);

  return (
    <div className="map-page">
      <MapView layers={layers} initialView={DEFAULT_VIEW} onHover={onHover} onClick={onClick} onReady={onReady} />

      <div className="map-controls">
        <div className="map-card">
          <label className="field">
            Period
            <select className="select" value={period} onChange={(e) => setParam('period', e.target.value)} aria-label="Period">
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Colour by
            <select className="select" value={metric} onChange={(e) => setParam('metric', e.target.value)} aria-label="Metric">
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_SCALES[m].label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox" style={{ marginBlockStart: 'var(--space-2)' }}>
            <input type="checkbox" checked={showFindings} onChange={(e) => setParam('findings', e.target.checked ? null : '0')} />
            Findings overlay
          </label>
        </div>

        <div className="map-card" aria-label="Legend">
          <div className="legend__title">
            {scale.label} · {period}
            {metric !== 'findings' ? <span className="muted"> ({scale.unit})</span> : null}
          </div>
          {legend ? (
            <>
              <div className="legend__ramp" aria-hidden="true">
                {legendStops(scale, 24).map((s, i) => (
                  <span key={i} style={{ background: s.color }} />
                ))}
              </div>
              <div className="legend__ticks">
                {legend.map((s, i) => (
                  <span key={i}>{scale.format(s.value)}{i === legend.length - 1 && !scale.reverse ? '+' : ''}</span>
                ))}
              </div>
            </>
          ) : (
            SEVERITIES.map((s) => (
              <div className="legend__row" key={s}>
                <span className="legend__swatch" style={{ background: rgbToHex(sevRgb[s]) }} />
                <SeverityBadge severity={s} />
              </div>
            ))
          )}
          <div className="legend__row" style={{ marginBlockStart: '0.4rem' }}>
            <span className="legend__swatch" style={{ background: 'var(--ink-3)', blockSize: 1 }} />
            <span className="muted">width = volume, up to {fmtNumber(maxVolume)} veh</span>
          </div>
          {showFindings ? (
            <div className="legend__row">
              <span className="legend__dot" style={{ background: rgbToHex(sevRgb.Critical) }} />
              <span className="muted">dots = findings, size by severity</span>
            </div>
          ) : null}
        </div>
      </div>

      {hover ? (
        <div className="map-tooltip" style={{ insetInlineStart: hover.x + 12, insetBlockStart: hover.y + 12 }} role="status">
          {hover.link ? (
            <table>
              <tbody>
                <tr><td>link</td><td className="mono">{hover.link.link_id}</td></tr>
                <tr><td>class</td><td>{hover.link.link_class} · {hover.link.lanes} lanes</td></tr>
                <tr><td>volume</td><td>{fmtNumber(hover.link.volume)} veh</td></tr>
                <tr><td>V/C</td><td>{hover.link.vc_ratio.toFixed(2)}</td></tr>
                <tr><td>speed</td><td>{fmtNumber(hover.link.cong_speed_kph)} km/h</td></tr>
                {hover.link.n_findings ? (
                  <tr><td>findings</td><td>{hover.link.n_findings} · {hover.link.max_severity}</td></tr>
                ) : null}
              </tbody>
            </table>
          ) : hover.finding ? (
            <div>
              <SeverityBadge severity={hover.finding.severity} /> <span className="muted">{hover.finding.check_name}</span>
              <div style={{ marginBlockStart: '0.3rem' }}>{hover.finding.executive_line}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="map-status" aria-live="polite">
        {links.isLoading ? 'Loading links…' : links.error ? 'Links unavailable' : binary ? `${fmtNumber(binary.length)} links · ${mappedFindings.length} mapped findings` : ''}
      </div>

      {links.error ? (
        <div className="map-empty">
          <ErrorState error={links.error} what={`links for ${period}`} />
        </div>
      ) : binary && binary.length === 0 ? (
        <div className="map-empty">
          <EmptyState>No links returned for period {period}.</EmptyState>
        </div>
      ) : null}

      {drawerOpen ? (
        <aside className="map-drawer" aria-label="Link profile">
          <div className="panel__head">
            <h2>{drawerLink ? `Link ${drawerLink}` : selectedFinding ? selectedFinding.check_name : 'Finding'}</h2>
            <button type="button" className="panel__close" aria-label="Close" onClick={closeDrawer}>
              ×
            </button>
          </div>
          <div className="panel__body">
            {drawerLink ? (
              profile.isLoading ? (
                <Loading what="link profile" />
              ) : profile.error ? (
                <ErrorState error={profile.error} what="link profile" />
              ) : profile.data ? (
                <LinkProfileView p={profile.data} periods={periods} runId={runId} highlightFinding={findingParam} />
              ) : null
            ) : selectedFinding ? (
              <FindingDetail finding={selectedFinding} runId={runId} />
            ) : findings.isLoading ? (
              <Loading what="finding" />
            ) : (
              <EmptyState>Finding {findingParam} not found in this run.</EmptyState>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function LinkProfileView({ p, periods, runId, highlightFinding }: { p: LinkProfile; periods: string[]; runId: string; highlightFinding: string | null }) {
  const a = p.attributes;
  const classes = useMemo(() => {
    const set = new Set(p.flows.map((f) => f.user_class));
    return ['ALL', ...Array.from(set).filter((c) => c !== 'ALL')].filter((c) => set.has(c));
  }, [p.flows]);
  const allPeriods = useMemo(() => {
    const seen = new Set(p.flows.map((f) => f.period));
    const ordered = periods.filter((x) => seen.has(x));
    for (const x of seen) if (!ordered.includes(x)) ordered.push(x);
    return ordered;
  }, [p.flows, periods]);
  const flowAt = (period: string, cls: string) => p.flows.find((f) => f.period === period && f.user_class === cls);
  return (
    <>
      <div className="finding-meta">
        <span>
          {a.link_class} · {a.lanes} lane{a.lanes === 1 ? '' : 's'} · {fmtNumber(a.length_m)} m
        </span>
        <span className="muted">
          {a.a_node} → {a.b_node}
        </span>
      </div>
      <table className="kv kv--compact">
        <tbody>
          <tr><th scope="row">Capacity</th><td className="num">{fmtNumber(a.capacity_vph)} veh/h</td></tr>
          <tr><th scope="row">Free-flow speed</th><td className="num">{fmtNumber(a.ffs_kph)} km/h</td></tr>
          <tr><th scope="row">Area type</th><td>{a.area_type}</td></tr>
          {a.sector_id ? <tr><th scope="row">Sector</th><td>{a.sector_id}</td></tr> : null}
          {a.junction_type ? <tr><th scope="row">Junction</th><td>{a.junction_type}</td></tr> : null}
          {a.oneway !== undefined ? <tr><th scope="row">One-way</th><td>{a.oneway ? 'yes' : 'no'}</td></tr> : null}
        </tbody>
      </table>

      <div>
        <div className="label">Volume by period</div>
        {p.flows.length ? <FlowsByPeriodChart flows={p.flows} periods={allPeriods} /> : <p className="muted small">No flows.</p>}
      </div>

      <div>
        <div className="label">Flows by period and user class</div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr>
                <th scope="col">Period</th>
                {classes.map((c) => (
                  <th scope="col" key={c} className="num">
                    {c}
                  </th>
                ))}
                <th scope="col" className="num">V/C</th>
                <th scope="col" className="num">km/h</th>
                <th scope="col" className="num">Delay s</th>
              </tr>
            </thead>
            <tbody>
              {allPeriods.map((per) => {
                const all = flowAt(per, 'ALL') ?? flowAt(per, classes[0]);
                return (
                  <tr key={per} style={{ cursor: 'default' }}>
                    <td>{per}</td>
                    {classes.map((c) => (
                      <td key={c} className="num">
                        {fmtNumber(flowAt(per, c)?.volume)}
                      </td>
                    ))}
                    <td className="num">{all?.vc_ratio != null ? all.vc_ratio.toFixed(2) : '–'}</td>
                    <td className="num">{fmtNumber(all?.cong_speed_kph)}</td>
                    <td className="num">{fmtNumber(all?.delay_s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="label">Findings on this link ({p.findings.length})</div>
        {p.findings.length ? (
          <ul className="change-list">
            {p.findings.map((f) => (
              <li key={f.finding_id} style={f.finding_id === highlightFinding ? { background: 'var(--accent-soft)' } : undefined}>
                <span>
                  <SeverityBadge severity={f.severity} /> {f.executive_line}{' '}
                  <Link to={`/runs/${encodeURIComponent(runId)}/findings?finding=${encodeURIComponent(f.finding_id)}`}>open</Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No findings on this link.</p>
        )}
      </div>

      <div>
        <div className="label">Sources</div>
        <SourcesList sources={p.sources} />
      </div>
    </>
  );
}

