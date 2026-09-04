"use client";

// TIS Mitigation Studio — the project north-star as one screen.
//
// The full study loop, everything presented on the 2D plan:
//   Network  -> auto-extracted carriageway graph from the masterplan CAD
//   Demand   -> development traffic slider (veh/h)
//   Assign   -> deterministic UE assignment, links coloured by LOS on the map
//   Mitigate -> one click develops the mitigation package (screen -> greedy
//               package -> escalate -> verify) and highlights every widened
//               link on the plan; each measure is clickable (fly-to)
//   Compare  -> Baseline / With-mitigation scenario toggle with a delta table
//   Report   -> drafted TIS mitigation section, copy / download
// Manual engineering judgement stays in the loop: click any link and add or
// remove lanes yourself; the mitigated scenario re-solves instantly.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdvisorMap, type MapFocus } from "@/components/AdvisorMap";
import { buildLaneNetwork, type LaneNetwork } from "@/lib/lane-network";
import { runAssignment, type AssignmentResult } from "@/lib/assignment";
import { developMitigationPlan, type MitigationPlan } from "@/lib/advisor";
import { loadSampleDrawing } from "@/lib/sample-loader";
import { parseDxfInBrowser } from "@/lib/dxf-client";
import { LOS_COLORS, type LOS } from "@/lib/hcm";

type Scenario = "baseline" | "mitigated";

const FULL_ITERS = 12;
const f0 = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

export default function AdvisorPage() {
  // ---- network ----
  const [net, setNet] = useState<LaneNetwork | null>(null);
  const [netLabel, setNetLabel] = useState("WSP masterplan (bundled)");
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- study state ----
  const [demand, setDemand] = useState(8000);
  const [baseline, setBaseline] = useState<AssignmentResult | null>(null);
  const [mitigated, setMitigated] = useState<AssignmentResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [scenario, setScenario] = useState<Scenario>("baseline");

  // ---- advisor ----
  const [plan, setPlan] = useState<MitigationPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ msg: "", frac: 0 });
  const runningRef = useRef(false);

  // ---- map / selection ----
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- load the bundled masterplan on launch ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const drawing = await loadSampleDrawing();
        if (cancelled) return;
        setNet(buildLaneNetwork(drawing));
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load the masterplan.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadUserDxf(file: File) {
    try {
      setLoadError(null);
      setNet(null);
      const drawing = await parseDxfInBrowser(file);
      const network = buildLaneNetwork(drawing);
      if (network.links.length === 0)
        throw new Error("No carriageways found — the DXF needs road EDGE layers.");
      setNet(network);
      setNetLabel(file.name);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not read that DXF.");
    }
  }

  // ---- reset the study when the network changes ----
  useEffect(() => {
    setBaseline(null);
    setMitigated(null);
    setOverrides({});
    setPlan(null);
    setScenario("baseline");
    setSelected(null);
  }, [net]);

  // ---- baseline assignment: network or demand change ----
  useEffect(() => {
    if (!net || net.links.length === 0) return;
    let cancelled = false;
    setSolving(true);
    const id = setTimeout(() => {
      try {
        const res = runAssignment(net, { totalDemand: demand, iterations: FULL_ITERS });
        if (!cancelled) setBaseline(res);
      } finally {
        if (!cancelled) setSolving(false);
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [net, demand]);

  // ---- mitigated assignment: overrides (advisor package and/or manual) ----
  useEffect(() => {
    if (!net || Object.keys(overrides).length === 0) {
      setMitigated(null);
      setScenario(s => (s === "mitigated" ? "baseline" : s));
      return;
    }
    let cancelled = false;
    setSolving(true);
    const id = setTimeout(() => {
      try {
        const res = runAssignment(net, {
          totalDemand: demand,
          iterations: FULL_ITERS,
          laneOverrides: overrides,
        });
        if (!cancelled) setMitigated(res);
      } finally {
        if (!cancelled) setSolving(false);
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, demand, overrides]);

  // ---- run the advisor ----
  async function develop() {
    if (!net || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setPlan(null);
    try {
      const result = await developMitigationPlan(net, demand, (msg, frac) =>
        setProgress({ msg, frac })
      );
      setPlan(result);
      setOverrides(result.overrides);
      if (Object.keys(result.overrides).length > 0) setScenario("mitigated");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Advisor run failed.");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  // ---- derived view state ----
  const active = scenario === "mitigated" && mitigated ? mitigated : baseline;

  const linkColors = useMemo(() => {
    if (!active) return null;
    return active.perLink.map(r => LOS_COLORS[r.los as LOS]);
  }, [active]);

  const laneCounts = useMemo(() => {
    if (!net) return null;
    if (scenario === "mitigated" && mitigated) return mitigated.perLink.map(r => r.lanesUsed);
    return net.links.map(l => l.numLanes);
  }, [net, scenario, mitigated]);

  const widened = useMemo(() => {
    const s = new Set<number>();
    if (!net || scenario !== "mitigated") return s;
    net.links.forEach((l, li) => {
      const o = overrides[l.id];
      if (o != null && o !== l.numLanes) s.add(li);
    });
    return s;
  }, [net, overrides, scenario]);

  const reportStale = useMemo(() => {
    if (!plan) return false;
    if (plan.demand !== demand) return true;
    return JSON.stringify(plan.overrides) !== JSON.stringify(overrides);
  }, [plan, demand, overrides]);

  const flyTo = useCallback(
    (linkIdx: number) => {
      if (!net) return;
      const pts = net.links[linkIdx].points;
      const mi = (pts.length >> 2) * 2;
      setSelected(linkIdx);
      setFocus({ x: pts[mi], y: pts[mi + 1], scale: 2.2, token: Date.now() });
    },
    [net]
  );

  function setLanes(linkIdx: number, lanes: number) {
    if (!net) return;
    const link = net.links[linkIdx];
    setOverrides(prev => {
      const next = { ...prev };
      if (lanes === link.numLanes) delete next[link.id];
      else next[link.id] = Math.max(1, lanes);
      return next;
    });
    if (scenario !== "mitigated") setScenario("mitigated");
  }

  async function copyReport() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.reportMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function downloadReport() {
    if (!plan) return;
    const blob = new Blob([plan.reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitigation-report-${plan.demand}vph.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selLink = selected != null && net ? net.links[selected] : null;
  const selResult = selected != null && active ? active.perLink[selected] : null;
  const selLanes =
    selLink != null ? overrides[selLink.id] ?? selLink.numLanes : 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "370px 1fr",
        height: "100vh",
        background: "var(--bg-0)",
        color: "var(--text-1)",
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      {/* ================= sidebar ================= */}
      <aside
        style={{
          borderRight: "1px solid var(--line)",
          background: "var(--bg-1)",
          overflowY: "auto",
          padding: "16px 16px 40px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ color: "var(--text-0)", fontSize: 16, margin: 0 }}>
            TIS Mitigation Studio
          </h1>
          <Link href="/" style={{ color: "var(--accent-hi)", fontSize: 11, marginLeft: "auto" }}>
            plan viewer →
          </Link>
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 11, margin: "6px 0 14px" }}>
          Will the network cope, where does it fail, and which measures fix it —
          developed automatically, shown on the plan.
        </p>

        {/* ---- network ---- */}
        <Section title="1 · Network">
          {net ? (
            <div style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
              <div style={{ color: "var(--text-1)" }}>{netLabel}</div>
              {net.stats.linkCount} links · {f1(net.stats.centerlineKm)} km ·{" "}
              {f1(net.stats.laneKm)} lane-km · {net.stats.junctionCount} junctions
            </div>
          ) : loadError ? (
            <div style={{ color: "var(--danger)" }}>{loadError}</div>
          ) : (
            <div>Extracting carriageway network…</div>
          )}
          <button style={btn} onClick={() => fileInputRef.current?.click()}>
            Load DXF…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void loadUserDxf(f);
              e.target.value = "";
            }}
          />
        </Section>

        {/* ---- demand ---- */}
        <Section title="2 · Development demand">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={1000}
              max={20000}
              step={500}
              value={demand}
              disabled={running}
              onChange={e => setDemand(+e.target.value)}
              style={{ flex: 1 }}
            />
            <b style={{ color: "var(--text-0)", fontVariantNumeric: "tabular-nums", width: 90 }}>
              {f0(demand)} veh/h
            </b>
          </div>
        </Section>

        {/* ---- performance / scenarios ---- */}
        <Section
          title="3 · Performance"
          right={solving ? <Spin /> : undefined}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["baseline", "mitigated"] as Scenario[]).map(s => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                disabled={s === "mitigated" && !mitigated}
                style={{
                  ...btn,
                  margin: 0,
                  flex: 1,
                  background: scenario === s ? "var(--accent-dim)" : "var(--bg-3)",
                  color: scenario === s ? "var(--text-0)" : "var(--text-2)",
                  opacity: s === "mitigated" && !mitigated ? 0.45 : 1,
                }}
              >
                {s === "baseline" ? "Baseline" : "With mitigation"}
              </button>
            ))}
          </div>
          {baseline ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text-3)", fontSize: 10, textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "2px 0" }} />
                  <th style={{ padding: "2px 4px" }}>Baseline</th>
                  <th style={{ padding: "2px 4px" }}>Mitigated</th>
                  <th style={{ padding: "2px 4px" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                <PerfRow
                  label="Delay (veh·h/h)"
                  a={baseline.totals.delay}
                  b={mitigated?.totals.delay}
                  fmt={f1}
                  goodDown
                />
                <PerfRow
                  label="Links at LOS E/F"
                  a={baseline.totals.failingLinks}
                  b={mitigated?.totals.failingLinks}
                  fmt={f0}
                  goodDown
                />
                <PerfRow
                  label="VHT (veh·h/h)"
                  a={baseline.totals.vht}
                  b={mitigated?.totals.vht}
                  fmt={f1}
                  goodDown
                />
                <PerfRow
                  label="Routed (veh/h)"
                  a={baseline.totals.routedDemand}
                  b={mitigated?.totals.routedDemand}
                  fmt={f0}
                />
              </tbody>
            </table>
          ) : (
            <div style={{ color: "var(--text-3)" }}>Assigning…</div>
          )}
        </Section>

        {/* ---- mitigation ---- */}
        <Section title="4 · Mitigation">
          <button
            style={{
              ...btn,
              width: "100%",
              margin: 0,
              padding: "9px 0",
              background: running ? "var(--bg-3)" : "var(--accent-dim)",
              color: "var(--text-0)",
              fontWeight: 600,
            }}
            disabled={running || !net || !baseline}
            onClick={() => void develop()}
          >
            {running ? "Developing plan…" : "Develop mitigation plan"}
          </button>
          {running && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(progress.frac * 100)}%`,
                    height: "100%",
                    background: "var(--accent)",
                    transition: "width .2s",
                  }}
                />
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 4 }}>{progress.msg}</div>
            </div>
          )}
          {plan && !running && (
            <>
              <div style={{ color: "var(--text-2)", fontSize: 12, margin: "10px 0 6px" }}>
                {plan.measures.length} measure(s) adopted · {plan.screenedCount} screened ·{" "}
                {plan.residual.length} residual
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {plan.measures.map((m, i) => (
                  <button
                    key={m.linkId}
                    onClick={() => flyTo(m.linkIdx)}
                    style={{
                      ...btn,
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textAlign: "left",
                      background: selected === m.linkIdx ? "var(--bg-4)" : "var(--bg-2)",
                    }}
                    title="Fly to this measure on the plan"
                  >
                    <span style={{ color: "var(--text-3)", width: 26 }}>M{i + 1}</span>
                    <span style={{ color: "var(--text-0)", flex: 1 }}>
                      {m.linkId} · {m.fromLanes}→{m.toLanes} lanes
                    </span>
                    <LosPill los={m.losBefore} />
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    <LosPill los={m.losAfter} />
                  </button>
                ))}
              </div>
              {plan.residual.length > 0 && (
                <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 8 }}>
                  {plan.residual.length} link(s) still fail — junction-level treatment
                  needed beyond mid-block widening (listed in the report).
                </div>
              )}
              {plan.measures.length === 0 && plan.baseline.totals.failingLinks === 0 && (
                <div style={{ color: "var(--ok)", fontSize: 12, marginTop: 8 }}>
                  Network copes at this demand — no mitigation required.
                </div>
              )}
            </>
          )}
        </Section>

        {/* ---- inspector ---- */}
        <Section title="5 · Link inspector">
          {selLink && selResult ? (
            <div style={{ lineHeight: 1.7 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <b style={{ color: "var(--text-0)" }}>{selLink.id}</b>
                <LosPill los={selResult.los} />
                <span style={{ color: "var(--text-3)", marginLeft: "auto" }}>
                  {selLink.oneWay ? "one-way" : "two-way"}
                </span>
              </div>
              {f0(selLink.length)} m · {f0(selResult.volume)} veh/h · V/C {f2(selResult.vc)}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ color: "var(--text-2)" }}>Lanes</span>
                <button style={btnSm} onClick={() => setLanes(selected!, selLanes - 1)} disabled={selLanes <= 1}>
                  −
                </button>
                <b style={{ color: "var(--text-0)" }}>{selLanes}</b>
                <button style={btnSm} onClick={() => setLanes(selected!, selLanes + 1)}>
                  +
                </button>
                {selLanes !== selLink.numLanes && (
                  <>
                    <span style={{ color: "var(--warn)", fontSize: 11 }}>
                      (drawn: {selLink.numLanes})
                    </span>
                    <button style={btnSm} onClick={() => setLanes(selected!, selLink.numLanes)}>
                      reset
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-3)" }}>
              Click a link on the plan to inspect it and test manual lane changes.
            </div>
          )}
        </Section>

        {/* ---- report ---- */}
        <Section title="6 · Report">
          {plan ? (
            <>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ ...btn, margin: 0 }} onClick={() => void copyReport()}>
                  {copied ? "Copied ✓" : "Copy markdown"}
                </button>
                <button style={{ ...btn, margin: 0 }} onClick={downloadReport}>
                  Download .md
                </button>
              </div>
              {reportStale && (
                <div style={{ color: "var(--warn)", fontSize: 11, marginTop: 6 }}>
                  Demand or lanes changed since this plan — re-run the advisor to refresh
                  the report.
                </div>
              )}
              <pre
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 10,
                  whiteSpace: "pre-wrap",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "var(--text-2)",
                  maxHeight: 260,
                  overflow: "auto",
                  marginTop: 8,
                }}
              >
                {plan.reportMarkdown}
              </pre>
            </>
          ) : (
            <div style={{ color: "var(--text-3)" }}>
              Develop a mitigation plan to draft the TIS report section.
            </div>
          )}
        </Section>
      </aside>

      {/* ================= map ================= */}
      <main style={{ position: "relative" }}>
        {net ? (
          <>
            <AdvisorMap
              net={net}
              linkColors={linkColors}
              laneCounts={laneCounts}
              widened={widened}
              selected={selected}
              onSelect={setSelected}
              focus={focus}
            />
            {/* legend */}
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                background: "rgba(11,16,24,0.85)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 11,
                pointerEvents: "none",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {(Object.keys(LOS_COLORS) as LOS[]).map(k => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span
                      style={{
                        width: 12,
                        height: 8,
                        borderRadius: 2,
                        background: LOS_COLORS[k],
                        display: "inline-block",
                      }}
                    />
                    {k}
                  </span>
                ))}
              </div>
              <div style={{ color: "var(--text-3)", marginTop: 4 }}>
                LOS by V/C · width = lanes · dashed halo = mitigation ·{" "}
                {scenario === "mitigated" ? "with-mitigation scenario" : "baseline scenario"}
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-3)",
            }}
          >
            {loadError ?? "Loading masterplan…"}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          color: "var(--text-3)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          borderBottom: "1px solid var(--line)",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        <span>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      {children}
    </section>
  );
}

function PerfRow({
  label,
  a,
  b,
  fmt,
  goodDown,
}: {
  label: string;
  a: number;
  b: number | undefined;
  fmt: (n: number) => string;
  goodDown?: boolean;
}) {
  const delta = b != null ? b - a : null;
  const good = delta != null && (goodDown ? delta < 0 : delta > 0);
  const bad = delta != null && (goodDown ? delta > 0 : delta < 0);
  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      <td style={{ padding: "3px 0", color: "var(--text-2)" }}>{label}</td>
      <td style={{ padding: "3px 4px", textAlign: "right", color: "var(--text-0)" }}>{fmt(a)}</td>
      <td style={{ padding: "3px 4px", textAlign: "right", color: "var(--text-0)" }}>
        {b != null ? fmt(b) : "—"}
      </td>
      <td
        style={{
          padding: "3px 4px",
          textAlign: "right",
          color: good ? "var(--ok)" : bad ? "var(--danger)" : "var(--text-3)",
        }}
      >
        {delta != null ? (delta > 0 ? "+" : "") + fmt(delta) : "—"}
      </td>
    </tr>
  );
}

function LosPill({ los }: { los: string }) {
  return (
    <span
      style={{
        background: LOS_COLORS[los as LOS] ?? "#64748b",
        color: "#0b1018",
        fontWeight: 700,
        borderRadius: 8,
        padding: "0 7px",
        fontSize: 10,
        lineHeight: "16px",
      }}
    >
      {los}
    </span>
  );
}

function Spin() {
  return <span style={{ color: "var(--accent-hi)", fontSize: 10 }}>solving…</span>;
}

const btn: React.CSSProperties = {
  background: "var(--bg-3)",
  color: "var(--text-1)",
  border: "1px solid var(--line-strong)",
  borderRadius: 5,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
  marginTop: 8,
};

const btnSm: React.CSSProperties = {
  ...btn,
  margin: 0,
  padding: "2px 10px",
};
