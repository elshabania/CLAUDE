"use client";

import { useMemo } from "react";
import type { JunctionInputs, JunctionResult } from "@/lib/hcm";

interface Props {
  inputs: JunctionInputs;
  result: JunctionResult;
  onChange: (next: JunctionInputs) => void;
}

/**
 * Reference-style phasing editor: cycle-length slider, ring & barrier
 * diagram, NS / EW green sliders. NS green is the average of NB+SB green
 * times; EW is EB+WB. Editing a slider updates both approaches symmetrically.
 */
export function PhasingView({ inputs, result, onChange }: Props) {
  const { gNS, gEW, allRed, lostTime } = useMemo(() => {
    const ns = (inputs.approaches.NB.greenTime + inputs.approaches.SB.greenTime) / 2;
    const ew = (inputs.approaches.EB.greenTime + inputs.approaches.WB.greenTime) / 2;
    const yellow = 6;
    const allR = 4;
    const lost = (yellow + allR) * 2;
    return { gNS: ns, gEW: ew, allRed: allR, lostTime: lost };
  }, [inputs]);

  const C = inputs.cycleLength;

  const updateGroup = (group: "NS" | "EW", value: number) => {
    const next = { ...inputs, approaches: { ...inputs.approaches } };
    if (group === "NS") {
      next.approaches.NB = { ...inputs.approaches.NB, greenTime: value };
      next.approaches.SB = { ...inputs.approaches.SB, greenTime: value };
    } else {
      next.approaches.EB = { ...inputs.approaches.EB, greenTime: value };
      next.approaches.WB = { ...inputs.approaches.WB, greenTime: value };
    }
    onChange(next);
  };

  return (
    <div
      style={{
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        color: "#e2e8f0",
      }}
    >
      <div>
        <Row>
          <Label>Cycle length</Label>
          <Big>{C}<Unit>sec</Unit></Big>
        </Row>
        <input
          type="range"
          min={40}
          max={180}
          step={5}
          value={C}
          onChange={(e) => onChange({ ...inputs, cycleLength: Number(e.target.value) })}
          style={{ width: "100%", marginTop: 6 }}
        />
        <RangeAxis labels={["40s", "SHORT", "110s", "LONG", "180s"]} />
      </div>

      <div>
        <SectionLabel>Phase diagram · ring & barrier</SectionLabel>
        <RingBarrier
          cycle={C}
          gNS={gNS}
          gEW={gEW}
          yellow={6}
          allRed={allRed}
        />
      </div>

      <div>
        <Row>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Swatch color="#22c55e" /> <Label>North–South</Label>
          </span>
          <SmallNum>{gNS.toFixed(0)} s green</SmallNum>
        </Row>
        <input
          type="range"
          min={5}
          max={Math.max(10, C - lostTime - 10)}
          step={1}
          value={gNS}
          onChange={(e) => updateGroup("NS", Number(e.target.value))}
          style={{ width: "100%", marginTop: 4 }}
        />
      </div>

      <div>
        <Row>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Swatch color="#3b82f6" /> <Label>East–West</Label>
          </span>
          <SmallNum>{gEW.toFixed(0)} s green</SmallNum>
        </Row>
        <input
          type="range"
          min={5}
          max={Math.max(10, C - lostTime - 10)}
          step={1}
          value={gEW}
          onChange={(e) => updateGroup("EW", Number(e.target.value))}
          style={{ width: "100%", marginTop: 4 }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 8,
          paddingTop: 12,
          borderTop: "1px solid #1e293b",
        }}
      >
        <Stat label="Green" value={`${(gNS + gEW).toFixed(0)}s`} />
        <Stat label="Yellow" value="6s" />
        <Stat label="All-red" value={`${allRed}s`} />
        <Stat label="Lost" value={`${lostTime}s of ${C}s`} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          paddingTop: 12,
          borderTop: "1px solid #1e293b",
        }}
      >
        <Stat label="Cycle delay" value={`${result.delay.toFixed(0)}s`} accent />
        <Stat label="v/c max" value={result.vcMax.toFixed(2)} accent />
        <Stat label="Q95 max" value={`${result.q95mMax.toFixed(0)}m`} accent />
      </div>
    </div>
  );
}

function RingBarrier({
  cycle,
  gNS,
  gEW,
  yellow,
  allRed,
}: {
  cycle: number;
  gNS: number;
  gEW: number;
  yellow: number;
  allRed: number;
}) {
  const totalSafe = gNS + yellow + allRed + gEW + yellow + allRed;
  const scale = 100 / Math.max(totalSafe, 1);
  const segs: { w: number; bg: string; label: string; small?: boolean }[] = [
    { w: gNS, bg: "#22c55e", label: `${Math.round(gNS)}s` },
    { w: yellow, bg: "#fbbf24", label: `${yellow}s` },
    { w: allRed, bg: "#475569", label: `${allRed}.`, small: true },
    { w: gEW, bg: "#3b82f6", label: `${Math.round(gEW)}s` },
    { w: yellow, bg: "#fbbf24", label: `${yellow}s` },
    { w: allRed, bg: "#475569", label: `${allRed}.`, small: true },
  ];
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 56,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #1e293b",
        }}
      >
        {segs.map((s, i) => (
          <div
            key={i}
            style={{
              flexBasis: `${s.w * scale}%`,
              background: s.bg,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: s.small ? 11 : 16,
            }}
          >
            {s.label}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#64748b",
          fontSize: 11,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>0s</span>
        <span>{(cycle / 2).toFixed(0)}s</span>
        <span>{cycle}s</span>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "#94a3b8",
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "#94a3b8",
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
function Big({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 32, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>
      {children}
    </span>
  );
}
function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: "#64748b",
        marginLeft: 6,
        textTransform: "uppercase",
        letterSpacing: 1.2,
      }}
    >
      {children}
    </span>
  );
}
function SmallNum({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "#cbd5e1",
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
  );
}
function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 6,
        background: color,
        borderRadius: 2,
        display: "inline-block",
      }}
    />
  );
}
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
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
          fontSize: accent ? 16 : 13,
          fontWeight: 600,
          color: accent ? "#fbbf24" : "#e2e8f0",
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RangeAxis({ labels }: { labels: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        color: "#64748b",
        fontSize: 11,
        marginTop: 4,
      }}
    >
      {labels.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}
