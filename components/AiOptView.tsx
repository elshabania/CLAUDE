"use client";

import { useState } from "react";
import {
  type JunctionInputs,
  type JunctionResult,
  LOS_COLORS,
} from "@/lib/hcm";

interface Props {
  junctionLabel: string;
  inputs: JunctionInputs;
  result: JunctionResult;
  onApply: (next: JunctionInputs) => void;
}

/**
 * Heuristic optimizer. Tries small green-time reallocations and picks the
 * one that lowers weighted delay the most. Stand-in for an LLM "Run AI"
 * call - same UX shape (results + apply button), local computation.
 */
export function AiOptView({ junctionLabel, inputs, result, onApply }: Props) {
  const [analysed, setAnalysed] = useState<{
    suggestion: JunctionInputs | null;
    deltaDelay: number;
    deltaVc: number;
    notes: string[];
  } | null>(null);
  const [running, setRunning] = useState(false);

  const runAi = () => {
    setRunning(true);
    // Synchronous heuristic; the setTimeout is purely UX (let the spinner show).
    setTimeout(() => {
      const result2 = optimiseGreens(inputs, result);
      setAnalysed(result2);
      setRunning(false);
    }, 350);
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "linear-gradient(180deg, rgba(251,191,36,0.07), rgba(251,191,36,0.0))",
          border: "1px solid rgba(251, 191, 36, 0.35)",
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "rgba(251,191,36,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3L13.7 8.4H19.4L14.85 11.7L16.55 17.1L12 13.8L7.45 17.1L9.15 11.7L4.6 8.4H10.3L12 3Z"
              stroke="#fbbf24"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9,
              color: "#fbbf24",
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            AI Optimizer
          </div>
          <div style={{ fontSize: 14, color: "#f1f5f9", fontWeight: 600 }}>
            {junctionLabel}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Current: {result.delay.toFixed(1)}s · LOS{" "}
            <span style={{ color: LOS_COLORS[result.los], fontWeight: 700 }}>
              {result.los}
            </span>{" "}
            · v/c {result.vcMax.toFixed(2)}
          </div>
        </div>
        <button
          onClick={runAi}
          disabled={running}
          style={{
            background: "#fbbf24",
            color: "#0f172a",
            border: 0,
            padding: "8px 14px",
            borderRadius: 6,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: 0.5,
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? "Analysing…" : "✨ Run AI"}
        </button>
      </div>

      {!analysed && (
        <div
          style={{
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 36,
            color: "#64748b",
            textAlign: "center",
            fontSize: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              border: "1px solid #334155",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="#475569" strokeWidth="1.6" />
              <rect x="9" y="9" width="6" height="6" stroke="#475569" strokeWidth="1.6" />
            </svg>
          </div>
          <div style={{ color: "#cbd5e1", fontSize: 13 }}>No analysis yet</div>
          <div style={{ marginTop: 4 }}>
            Tap{" "}
            <span style={{ color: "#fbbf24", fontWeight: 600 }}>Run AI</span>{" "}
            to generate recommendations tailored to this junction&apos;s HCM
            analysis.
          </div>
        </div>
      )}

      {analysed && analysed.suggestion && (
        <div
          style={{
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            Suggestion
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.4 }}>
            {analysed.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 6,
            }}
          >
            <Stat
              label="Δ delay"
              value={`${analysed.deltaDelay > 0 ? "+" : ""}${analysed.deltaDelay.toFixed(1)}s`}
              good={analysed.deltaDelay < 0}
            />
            <Stat
              label="Δ v/c"
              value={`${analysed.deltaVc > 0 ? "+" : ""}${analysed.deltaVc.toFixed(2)}`}
              good={analysed.deltaVc < 0}
            />
          </div>
          <button
            onClick={() => {
              if (analysed.suggestion) onApply(analysed.suggestion);
            }}
            style={{
              background: "#22c55e",
              color: "#0f172a",
              border: 0,
              borderRadius: 6,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            Apply suggestion
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div
      style={{
        background: "#0a1120",
        border: "1px solid #1e293b",
        borderRadius: 6,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#64748b",
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: good ? "#22c55e" : "#fda4af",
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Try a small set of green-time perturbations and pick the one that lowers
 * weighted delay the most while keeping max v/c <= 1. Cheap, deterministic,
 * useful as a smoke-test of the HCM model itself.
 */
function optimiseGreens(inputs: JunctionInputs, baseline: JunctionResult) {
  const candidates: JunctionInputs[] = [];
  const dirs = ["NB", "EB", "SB", "WB"] as const;
  for (const dir of dirs) {
    for (const delta of [-10, -5, 5, 10]) {
      const next = JSON.parse(JSON.stringify(inputs)) as JunctionInputs;
      next.approaches[dir].greenTime = Math.max(
        5,
        Math.min(inputs.cycleLength - 10, inputs.approaches[dir].greenTime + delta)
      );
      candidates.push(next);
    }
  }
  // Also try cycle length sweep.
  for (const cycle of [60, 90, 120, 150]) {
    if (cycle === inputs.cycleLength) continue;
    candidates.push({ ...inputs, cycleLength: cycle });
  }

  // Lazy import to avoid circular issues.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { analyzeJunction } = require("@/lib/hcm") as typeof import("@/lib/hcm");
  let best: { inputs: JunctionInputs; result: JunctionResult } | null = null;
  for (const c of candidates) {
    const r = analyzeJunction(c);
    if (!best || r.delay < best.result.delay) best = { inputs: c, result: r };
  }
  if (!best) {
    return {
      suggestion: null,
      deltaDelay: 0,
      deltaVc: 0,
      notes: ["No improving change found within the search space."],
    };
  }
  const notes: string[] = [];
  for (const dir of dirs) {
    const before = inputs.approaches[dir].greenTime;
    const after = best.inputs.approaches[dir].greenTime;
    if (Math.abs(after - before) >= 1) {
      notes.push(
        `${dir} green: ${before.toFixed(0)}s → ${after.toFixed(0)}s`
      );
    }
  }
  if (best.inputs.cycleLength !== inputs.cycleLength) {
    notes.push(
      `Cycle: ${inputs.cycleLength}s → ${best.inputs.cycleLength}s`
    );
  }
  if (notes.length === 0)
    notes.push("Current settings already near-optimal in the search space.");
  return {
    suggestion: best.inputs,
    deltaDelay: best.result.delay - baseline.delay,
    deltaVc: best.result.vcMax - baseline.vcMax,
    notes,
  };
}
