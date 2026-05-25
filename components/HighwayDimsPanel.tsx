"use client";

import type { NetworkDimensions, DimensionAssumptions } from "@/lib/highway-dims";
import { LOS_COLORS, type LOS } from "@/lib/hcm";

interface Props {
  dims: NetworkDimensions;
  assumptions: DimensionAssumptions;
  onChangeAssumptions: (next: DimensionAssumptions) => void;
  colorBy: "los" | "class";
  onChangeColorBy: (v: "los" | "class") => void;
  selectedLinkId?: string | null;
  onSelectLink?: (id: string | null) => void;
}

const fmt = (n: number, d = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

export function HighwayDimsPanel({
  dims,
  assumptions,
  onChangeAssumptions,
  colorBy,
  onChangeColorBy,
  selectedLinkId,
  onSelectLink,
}: Props) {
  const u = dims.units === "m" ? "m" : "u";
  const totals = dims.totals;

  return (
    <div style={{ padding: "14px 16px", color: "#e2e8f0", fontSize: 12 }}>
      {/* Assumptions */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <Field label={`Scale (PDF units per metre)`}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={assumptions.unitsPerMetre ?? 1}
            onChange={(e) =>
              onChangeAssumptions({
                ...assumptions,
                unitsPerMetre: Math.max(0, parseFloat(e.target.value) || 0) || 1,
              })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Peak vol (veh/h/lane)">
          <input
            type="number"
            min={0}
            step="50"
            value={assumptions.peakHourVolumePerLane ?? 0}
            onChange={(e) =>
              onChangeAssumptions({
                ...assumptions,
                peakHourVolumePerLane: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Colour links by">
          <div style={{ display: "flex", gap: 6 }}>
            {(["los", "class"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChangeColorBy(m)}
                style={{
                  ...pillStyle,
                  background: colorBy === m ? "#2563eb" : "#1e293b",
                  color: colorBy === m ? "#fff" : "#cbd5e1",
                }}
              >
                {m === "los" ? "LOS" : "Class"}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {dims.units === "pdf-units" && (
        <div style={{ color: "#fbbf24", fontSize: 11, marginBottom: 10 }}>
          Lengths shown in PDF units. Enter the scale (units per metre) above to
          convert to metres — pick a known dimension on the drawing and divide
          its pixel length by its real length.
        </div>
      )}

      {/* Totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="Links" value={fmt(totals.linkCount)} />
        <Stat label="Junctions" value={fmt(totals.junctionCount)} />
        <Stat label="Roundabouts" value={fmt(totals.roundaboutCount)} />
        <Stat label="Signals" value={fmt(totals.signalCount)} />
        <Stat label="Priority" value={fmt(totals.priorityCount)} />
        <Stat label={`Total length (${u})`} value={fmt(totals.totalLength)} />
        <Stat label={`Lane-length (${u})`} value={fmt(totals.totalLaneLength)} />
        <Stat
          label={`Mean width (${u})`}
          value={totals.meanWidth != null ? fmt(totals.meanWidth, 1) : "—"}
        />
        <Stat
          label={`Min curve R (${u})`}
          value={totals.minCurveRadius != null ? fmt(totals.minCurveRadius, 0) : "—"}
        />
      </div>

      {/* By functional class */}
      <div style={{ marginBottom: 8, fontSize: 10, letterSpacing: 1.4, color: "#64748b", textTransform: "uppercase" }}>
        By functional class
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(totals.byClass)
          .filter(([, v]) => v.count > 0)
          .map(([k, v]) => (
            <div key={k} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ textTransform: "capitalize" }}>{k}</div>
              <div style={{ color: "#94a3b8", fontSize: 11 }}>
                {v.count} links · {fmt(v.length)} {u}
              </div>
            </div>
          ))}
      </div>

      {/* Per-link table */}
      <div style={{ marginBottom: 6, fontSize: 10, letterSpacing: 1.4, color: "#64748b", textTransform: "uppercase" }}>
        Links ({dims.links.length})
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #1e293b", borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#0f172a", color: "#94a3b8" }}>
              <Th>ID</Th>
              <Th>Class</Th>
              <Th>{`Len (${u})`}</Th>
              <Th>{`Width (${u})`}</Th>
              <Th>Lanes</Th>
              <Th>{`Min R (${u})`}</Th>
              <Th>FFS</Th>
              <Th>v/c</Th>
              <Th>LOS</Th>
            </tr>
          </thead>
          <tbody>
            {dims.links.map((l) => {
              const sel = l.linkId === selectedLinkId;
              return (
                <tr
                  key={l.linkId}
                  onClick={() => onSelectLink?.(sel ? null : l.linkId)}
                  style={{
                    cursor: "pointer",
                    background: sel ? "#1e293b" : "transparent",
                    borderTop: "1px solid #131c2e",
                  }}
                >
                  <Td>{l.linkId.replace(/^link_?/, "")}</Td>
                  <Td style={{ textTransform: "capitalize" }}>{l.functionalClass}</Td>
                  <Td>{fmt(l.length)}</Td>
                  <Td>{l.width != null ? fmt(l.width, 1) : "—"}</Td>
                  <Td>{l.totalLanes}</Td>
                  <Td>{l.minCurveRadius != null ? fmt(l.minCurveRadius) : "—"}</Td>
                  <Td>{l.ffsKmh}</Td>
                  <Td>{l.los ? l.los.vc.toFixed(2) : "—"}</Td>
                  <Td>
                    {l.los ? (
                      <span
                        style={{
                          background: LOS_COLORS[l.los.los as LOS],
                          color: "#0f172a",
                          borderRadius: 3,
                          padding: "1px 6px",
                          fontWeight: 700,
                        }}
                      >
                        {l.los.los}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(!assumptions.peakHourVolumePerLane || assumptions.peakHourVolumePerLane <= 0) && (
        <div style={{ color: "#64748b", fontSize: 11, marginTop: 8 }}>
          Enter a peak-hour volume per lane above to compute segment LOS (HCM Ch.18).
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}
const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{children}</th>
);
const Td = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <td style={{ padding: "5px 8px", whiteSpace: "nowrap", ...style }}>{children}</td>
);
const inputStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 4,
  color: "#e2e8f0",
  padding: "5px 8px",
  width: 120,
  fontSize: 12,
};
const pillStyle: React.CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "5px 10px",
  fontSize: 11,
  cursor: "pointer",
};
