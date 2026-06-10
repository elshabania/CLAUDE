"use client";

interface Props {
  status: "idle" | "loading" | "error";
  segmentCount: number | null;
  groupCount: number | null;
  linkCount: number | null;
  junctionCount: number | null;
  /** Cursor position in drawing units (null when off-canvas). */
  cursor: { x: number; y: number } | null;
  /** Current zoom as a percentage of fit. */
  zoomPct: number | null;
  units: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function StatusBar({
  status,
  segmentCount,
  groupCount,
  linkCount,
  junctionCount,
  cursor,
  zoomPct,
  units,
}: Props) {
  return (
    <div className="statusbar">
      <div className="status-seg">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background:
              status === "loading"
                ? "var(--warn)"
                : status === "error"
                ? "var(--danger)"
                : "var(--ok)",
          }}
        />
        <span className="v">
          {status === "loading" ? "Processing…" : status === "error" ? "Error" : "Ready"}
        </span>
      </div>

      {segmentCount != null && (
        <div className="status-seg">
          <span className="k">Segments</span>
          <span className="v">{fmt(segmentCount)}</span>
        </div>
      )}
      {groupCount != null && (
        <div className="status-seg">
          <span className="k">Layers</span>
          <span className="v">{fmt(groupCount)}</span>
        </div>
      )}
      {linkCount != null && (
        <div className="status-seg">
          <span className="k">Links</span>
          <span className="v">{fmt(linkCount)}</span>
        </div>
      )}
      {junctionCount != null && (
        <div className="status-seg">
          <span className="k">Junctions</span>
          <span className="v">{fmt(junctionCount)}</span>
        </div>
      )}

      <div className="status-spacer" />

      {cursor && (
        <div className="status-seg mono">
          <span className="k">X</span>
          <span className="v">{cursor.x.toFixed(1)}</span>
          <span className="k" style={{ marginLeft: 8 }}>
            Y
          </span>
          <span className="v">{cursor.y.toFixed(1)}</span>
          <span style={{ color: "var(--text-3)", marginLeft: 4 }}>{units}</span>
        </div>
      )}
      {zoomPct != null && (
        <div className="status-seg">
          <span className="k">Zoom</span>
          <span className="v">{zoomPct.toFixed(0)}%</span>
        </div>
      )}
      <div className="status-seg">
        <span className="k">Units</span>
        <span className="v">{units}</span>
      </div>
    </div>
  );
}
