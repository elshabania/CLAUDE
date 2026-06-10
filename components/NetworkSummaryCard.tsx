"use client";

import { LOS_COLORS, type JunctionResult, type LOS } from "@/lib/hcm";

interface Props {
  results: Record<string, JunctionResult | undefined>;
  junctionCount: number;
  externalCount?: number;
  internalCount?: number;
}

export function NetworkSummaryCard({
  results,
  junctionCount,
  externalCount,
  internalCount,
}: Props) {
  const list = Object.values(results).filter(Boolean) as JunctionResult[];
  if (list.length === 0) {
    return (
      <Card>
        <Heading>NETWORK</Heading>
        <BigLetter los="A" muted />
        <Sub>warming up</Sub>
      </Card>
    );
  }
  const totalDelayWeighted = list.reduce(
    (acc, r) => acc + r.delay * r.totalVolume,
    0
  );
  const totalVolume = list.reduce((acc, r) => acc + r.totalVolume, 0);
  const networkDelay = totalVolume > 0 ? totalDelayWeighted / totalVolume : 0;
  const order: LOS[] = ["A", "B", "C", "D", "E", "F"];
  const worstLos = list.reduce<LOS>(
    (worst, r) =>
      order.indexOf(r.los) > order.indexOf(worst) ? r.los : worst,
    "A"
  );
  const fCount = list.filter((r) => r.los === "F").length;
  const vcMax = list.reduce((m, r) => Math.max(m, r.vcMax), 0);
  const spillback = list.filter((r) => r.spillbackAny).length;

  return (
    <Card>
      <Heading>NETWORK</Heading>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BigLetter los={worstLos} />
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#f1f5f9",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {networkDelay.toFixed(1)}s
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <Pill>v/c {vcMax.toFixed(2)}</Pill>
        <Pill warning={fCount > 0}>
          {fCount}/{list.length} F
        </Pill>
        {spillback > 0 && <Pill warning="amber">⚠ {spillback} spillback</Pill>}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, letterSpacing: 0.6 }}>
        MASTERPLAN · {junctionCount} JUNCTIONS
        {externalCount != null && internalCount != null
          ? ` · ${externalCount} ext · ${internalCount} int`
          : ""}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        background: "rgba(11, 18, 32, 0.92)",
        border: "1px solid #1e293b",
        borderRadius: 12,
        padding: 14,
        minWidth: 200,
        backdropFilter: "blur(6px)",
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: "#64748b",
        letterSpacing: 1.6,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function BigLetter({ los, muted }: { los: LOS; muted?: boolean }) {
  return (
    <div
      style={{
        fontSize: 56,
        fontWeight: 900,
        color: muted ? "#475569" : LOS_COLORS[los],
        lineHeight: 0.85,
        letterSpacing: -3,
      }}
    >
      {los}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>{children}</div>
  );
}

function Pill({
  children,
  warning,
}: {
  children: React.ReactNode;
  warning?: boolean | "amber";
}) {
  const bg =
    warning === true
      ? "rgba(220, 38, 38, 0.18)"
      : warning === "amber"
      ? "rgba(251, 191, 36, 0.16)"
      : "transparent";
  const color =
    warning === true ? "#fda4af" : warning === "amber" ? "#fde68a" : "#cbd5e1";
  const border =
    warning === true
      ? "1px solid rgba(220, 38, 38, 0.55)"
      : warning === "amber"
      ? "1px solid rgba(251, 191, 36, 0.55)"
      : "1px solid #334155";
  return (
    <span
      style={{
        background: bg,
        border,
        color,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 10,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
