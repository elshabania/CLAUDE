"use client";

import { LOS_COLORS, type JunctionResult, type LOS } from "@/lib/hcm";

interface Props {
  filename: string | null;
  results: Record<string, JunctionResult | undefined>;
  onUpload: () => void;
}

export function Topbar({ filename, results, onUpload }: Props) {
  const list = Object.values(results).filter(Boolean) as JunctionResult[];
  const totalVolume = list.reduce((a, r) => a + r.totalVolume, 0);
  const delayW = list.reduce((a, r) => a + r.delay * r.totalVolume, 0);
  const networkDelay = totalVolume > 0 ? delayW / totalVolume : 0;
  const order: LOS[] = ["A", "B", "C", "D", "E", "F"];
  const worst = list.reduce<LOS | null>(
    (w, r) => (!w || order.indexOf(r.los) > order.indexOf(w) ? r.los : w),
    null
  );

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 21L9 3M19 21L15 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 5V8M12 11V14M12 17V20" stroke="#bfdbfe" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Masterplan Highway Analyzer</div>
          <div className="brand-sub">Network extraction · HCM LOS</div>
        </div>
      </div>

      {filename && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-2)",
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={filename}
        >
          {filename}
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {totalVolume > 0 && (
          <div style={{ textAlign: "right", lineHeight: 1.1 }}>
            <div style={{ fontSize: 9.5, color: "var(--text-3)", letterSpacing: 1.4 }}>
              NETWORK DELAY
            </div>
            <div className="tnum" style={{ fontSize: 12, color: "var(--text-1)", marginTop: 3 }}>
              {networkDelay.toFixed(1)}s · {Math.round(totalVolume).toLocaleString()} vph
            </div>
          </div>
        )}
        {worst && (
          <div
            className="los-chip"
            style={{ background: LOS_COLORS[worst], width: 30, height: 26, fontSize: 15 }}
            title="Worst junction LOS"
          >
            {worst}
          </div>
        )}
        <button className="btn btn-primary btn-sm" onClick={onUpload}>
          Open PDF / DXF
        </button>
      </div>
    </div>
  );
}
