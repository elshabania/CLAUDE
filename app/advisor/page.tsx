"use client";

// Mitigation Advisor — automated TIS mitigation development.
//
// Loads the bundled masterplan, and for a chosen demand level runs the full
// expert loop from lib/advisor.ts: baseline → failing links → screen
// lane-addition candidates → greedy package build → verified plan + drafted
// report section. Everything is deterministic and runs client-side.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildLaneNetwork, type LaneNetwork } from "@/lib/lane-network";
import { loadSampleDrawing } from "@/lib/sample-loader";
import { developMitigationPlan, type MitigationPlan } from "@/lib/advisor";
import { LOS_COLORS, type LOS } from "@/lib/hcm";

type Phase = "loading" | "ready" | "running" | "done" | "error";

const f0 = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

function LosPill({ los }: { los: string }) {
  return (
    <span
      style={{
        background: LOS_COLORS[los as LOS] ?? "#64748b",
        color: "#0b1018",
        fontWeight: 700,
        borderRadius: 8,
        padding: "1px 8px",
        fontSize: 11,
      }}
    >
      {los}
    </span>
  );
}

export default function AdvisorPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [net, setNet] = useState<LaneNetwork | null>(null);
  const [demand, setDemand] = useState(6000);
  const [progress, setProgress] = useState({ msg: "", frac: 0 });
  const [plan, setPlan] = useState<MitigationPlan | null>(null);
  const [copied, setCopied] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const drawing = await loadSampleDrawing();
        if (cancelled) return;
        const network = buildLaneNetwork(drawing);
        if (cancelled) return;
        setNet(network);
        setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the masterplan.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    if (!net || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    setPlan(null);
    setCopied(false);
    try {
      const result = await developMitigationPlan(net, demand, (msg, frac) =>
        setProgress({ msg, frac })
      );
      setPlan(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advisor run failed.");
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }

  const delayCut = useMemo(() => {
    if (!plan || plan.baseline.totals.delay <= 0) return null;
    return (
      ((plan.baseline.totals.delay - plan.final.totals.delay) /
        plan.baseline.totals.delay) *
      100
    );
  }, [plan]);

  async function copyReport() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.reportMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the user can select the text manually */
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-0)",
        color: "var(--text-1)",
        padding: "24px 28px 60px",
        fontSize: 13,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <h1 style={{ color: "var(--text-0)", fontSize: 20, margin: 0 }}>
            Mitigation Advisor
          </h1>
          <Link href="/" style={{ color: "var(--accent-hi)", fontSize: 12 }}>
            ← back to plan view
          </Link>
        </div>
        <p style={{ color: "var(--text-2)", margin: "4px 0 20px", maxWidth: 640 }}>
          Automated TIS mitigation development: assigns the demand, finds failing
          links, screens a lane addition on each, assembles the best-performing
          package, and drafts the report section. Deterministic — the same demand
          always produces the same plan.
        </p>

        {phase === "loading" && <div>Loading masterplan network…</div>}
        {phase === "error" && (
          <div style={{ color: "var(--danger)" }}>Error: {error}</div>
        )}

        {net && phase !== "loading" && (
          <>
            {/* Controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "14px 18px",
                marginBottom: 18,
              }}
            >
              <label style={{ color: "var(--text-2)" }}>
                Development demand
                <input
                  type="range"
                  min={1000}
                  max={20000}
                  step={500}
                  value={demand}
                  disabled={phase === "running"}
                  onChange={e => setDemand(+e.target.value)}
                  style={{ width: 220, margin: "0 10px", verticalAlign: "middle" }}
                />
                <b style={{ color: "var(--text-0)", fontVariantNumeric: "tabular-nums" }}>
                  {f0(demand)} veh/h
                </b>
              </label>
              <button
                onClick={run}
                disabled={phase === "running"}
                style={{
                  marginLeft: "auto",
                  background: phase === "running" ? "var(--bg-3)" : "var(--accent-dim)",
                  color: "var(--text-0)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  padding: "8px 18px",
                  cursor: phase === "running" ? "default" : "pointer",
                  fontSize: 13,
                }}
              >
                {phase === "running" ? "Developing plan…" : "Develop mitigation plan"}
              </button>
            </div>

            {/* Network summary */}
            <div style={{ color: "var(--text-3)", marginBottom: 18, fontSize: 12 }}>
              Network: {net.stats.linkCount} links · {f1(net.stats.centerlineKm)} km ·{" "}
              {f1(net.stats.laneKm)} lane-km · {net.stats.junctionCount} junctions
            </div>

            {/* Progress */}
            {phase === "running" && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    height: 6,
                    background: "var(--bg-3)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(progress.frac * 100)}%`,
                      height: "100%",
                      background: "var(--accent)",
                      transition: "width .2s",
                    }}
                  />
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 12 }}>{progress.msg}</div>
              </div>
            )}

            {/* Results */}
            {plan && phase === "done" && (
              <>
                {/* Headline cards */}
                <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  {[
                    {
                      label: "Network delay",
                      value: `${f1(plan.baseline.totals.delay)} → ${f1(plan.final.totals.delay)} veh·h/h`,
                      sub: delayCut != null && delayCut > 0 ? `−${delayCut.toFixed(0)}%` : "no change",
                      good: delayCut != null && delayCut > 0,
                    },
                    {
                      label: "Failing links (LOS E/F)",
                      value: `${plan.baseline.totals.failingLinks} → ${plan.final.totals.failingLinks}`,
                      sub:
                        plan.final.totals.failingLinks === 0
                          ? "all resolved"
                          : `${plan.residual.length} residual`,
                      good: plan.final.totals.failingLinks < plan.baseline.totals.failingLinks,
                    },
                    {
                      label: "Measures adopted",
                      value: `${plan.measures.length}`,
                      sub: `${plan.screenedCount} candidates screened`,
                      good: true,
                    },
                  ].map(card => (
                    <div
                      key={card.label}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        padding: "12px 18px",
                        minWidth: 200,
                      }}
                    >
                      <div style={{ color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
                        {card.label}
                      </div>
                      <div style={{ color: "var(--text-0)", fontSize: 17, fontWeight: 600, margin: "3px 0" }}>
                        {card.value}
                      </div>
                      <div style={{ color: card.good ? "var(--ok)" : "var(--warn)", fontSize: 12 }}>
                        {card.sub}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Adopted measures */}
                {plan.measures.length > 0 && (
                  <section style={{ marginBottom: 22 }}>
                    <h2 style={{ color: "var(--text-0)", fontSize: 15, marginBottom: 8 }}>
                      Recommended package
                    </h2>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr style={{ color: "var(--text-3)", fontSize: 11, textAlign: "left" }}>
                          {["#", "Link", "Length", "Lanes", "V/C before", "LOS", "V/C after", "LOS", "Δ delay"].map(
                            (h, i) => (
                              <th key={i} style={{ padding: "4px 10px", borderBottom: "1px solid var(--line)" }}>
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {plan.measures.map((m, i) => (
                          <tr key={m.linkId} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "5px 10px", color: "var(--text-3)" }}>M{i + 1}</td>
                            <td style={{ padding: "5px 10px", color: "var(--text-0)" }}>{m.linkId}</td>
                            <td style={{ padding: "5px 10px" }}>{f0(m.lengthM)} m</td>
                            <td style={{ padding: "5px 10px", color: "var(--text-0)" }}>
                              {m.fromLanes} → {m.toLanes}
                            </td>
                            <td style={{ padding: "5px 10px" }}>{f2(m.vcBefore)}</td>
                            <td style={{ padding: "5px 10px" }}><LosPill los={m.losBefore} /></td>
                            <td style={{ padding: "5px 10px" }}>{f2(m.vcAfter)}</td>
                            <td style={{ padding: "5px 10px" }}><LosPill los={m.losAfter} /></td>
                            <td style={{ padding: "5px 10px", color: "var(--ok)" }}>
                              {m.delayGain < 0 ? `−${f2(-m.delayGain)}` : f2(m.delayGain)} h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {/* Residual issues */}
                {plan.residual.length > 0 && (
                  <section style={{ marginBottom: 22 }}>
                    <h2 style={{ color: "var(--text-0)", fontSize: 15, marginBottom: 8 }}>
                      Residual issues ({plan.residual.length})
                    </h2>
                    <div style={{ color: "var(--text-2)", marginBottom: 8, fontSize: 12 }}>
                      Mid-block widening does not resolve these — junction-level treatment needed.
                    </div>
                    <table style={{ borderCollapse: "collapse" }}>
                      <tbody>
                        {plan.residual.slice(0, 10).map(r => (
                          <tr key={r.linkId} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "4px 10px", color: "var(--text-0)" }}>{r.linkId}</td>
                            <td style={{ padding: "4px 10px" }}>{f0(r.lengthM)} m</td>
                            <td style={{ padding: "4px 10px" }}>{r.lanes} lanes</td>
                            <td style={{ padding: "4px 10px" }}>V/C {f2(r.vc)}</td>
                            <td style={{ padding: "4px 10px" }}><LosPill los={r.los} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {/* Report */}
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h2 style={{ color: "var(--text-0)", fontSize: 15, margin: 0 }}>
                      Drafted report section
                    </h2>
                    <button onClick={copyReport} style={btnStyle}>
                      {copied ? "Copied ✓" : "Copy markdown"}
                    </button>
                    <button onClick={downloadReport} style={btnStyle}>
                      Download .md
                    </button>
                  </div>
                  <pre
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: 16,
                      whiteSpace: "pre-wrap",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text-1)",
                      overflowX: "auto",
                    }}
                  >
                    {plan.reportMarkdown}
                  </pre>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "var(--bg-3)",
  color: "var(--text-1)",
  border: "1px solid var(--line-strong)",
  borderRadius: 5,
  padding: "4px 12px",
  fontSize: 12,
  cursor: "pointer",
};
