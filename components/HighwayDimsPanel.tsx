"use client";

import type {
  NetworkDimensions,
  DimensionAssumptions,
  LinkOverride,
} from "@/lib/highway-dims";

interface Props {
  dims: NetworkDimensions;
  assumptions: DimensionAssumptions;
  onChangeAssumptions: (next: DimensionAssumptions) => void;
  colorBy: "los" | "class";
  onChangeColorBy: (v: "los" | "class") => void;
  selectedLinkId?: string | null;
  onSelectLink?: (id: string | null) => void;
  overrides?: Record<string, LinkOverride>;
  onChangeOverride?: (linkId: string, patch: LinkOverride) => void;
  onResetOverride?: (linkId: string) => void;
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
  overrides,
  onChangeOverride,
  onResetOverride,
}: Props) {
  const u = dims.units === "m" ? "m" : "u";
  const totals = dims.totals;
  const selectedLink = selectedLinkId
    ? dims.links.find((l) => l.linkId === selectedLinkId) ?? null
    : null;
  const selOverride = selectedLinkId ? overrides?.[selectedLinkId] : undefined;
  const isOverridden =
    !!selOverride &&
    (selOverride.lanesPerDir != null ||
      selOverride.width != null ||
      selOverride.ffsKmh != null);

  return (
    <div style={{ padding: "14px 16px", color: "#e2e8f0", fontSize: 12 }}>
      {/* Scale (the only assumption that affects geometry) */}
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
        <Stat label="Road segments" value={fmt(totals.linkCount)} />
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

      {/* Selected-link editor: correct detected attributes. */}
      {selectedLink && onChangeOverride && (
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "10px 12px",
            marginBottom: 14,
            background: "#0b1120",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>
              Edit link <b>{selectedLink.linkId.replace(/^link_?/, "")}</b>
              {isOverridden && (
                <span style={{ marginLeft: 8, fontSize: 9.5, color: "#fbbf24", letterSpacing: 1 }}>
                  EDITED
                </span>
              )}
            </div>
            {isOverridden && (
              <button
                onClick={() => onResetOverride?.(selectedLink.linkId)}
                style={{ ...pillStyle, background: "#1e293b", color: "#cbd5e1" }}
              >
                Reset
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Lanes / direction">
              <input
                type="number"
                min={1}
                max={6}
                step={1}
                value={selectedLink.lanesPerDir}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  onChangeOverride(selectedLink.linkId, {
                    lanesPerDir: Number.isFinite(v) ? Math.max(1, Math.min(6, v)) : undefined,
                  });
                }}
                style={{ ...inputStyle, width: 90 }}
              />
            </Field>
            <Field label={`Width (${u})`}>
              <input
                type="number"
                min={0}
                step="0.5"
                value={selectedLink.width != null ? Math.round(selectedLink.width * 10) / 10 : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onChangeOverride(selectedLink.linkId, {
                    width: Number.isFinite(v) && v > 0 ? v : undefined,
                  });
                }}
                style={{ ...inputStyle, width: 90 }}
              />
            </Field>
            <Field label="FFS (km/h)">
              <input
                type="number"
                min={10}
                max={130}
                step={5}
                value={selectedLink.ffsKmh}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onChangeOverride(selectedLink.linkId, {
                    ffsKmh: Number.isFinite(v) && v > 0 ? v : undefined,
                  });
                }}
                style={{ ...inputStyle, width: 90 }}
              />
            </Field>
          </div>
        </div>
      )}

      <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
        Click a road in the plan to edit its lanes / width / speed.
      </div>
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
