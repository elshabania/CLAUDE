"use client";

import type { DashTab } from "@/components/BottomNav";

export type ViewTool = "pan" | "measure" | "pick";

interface Props {
  tab: DashTab;
  onTab: (t: DashTab) => void;
  tool: ViewTool;
  onTool: (t: ViewTool) => void;
  onZoomFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasDrawing: boolean;
}

// Junction-analysis views (Junctions / Phasing / Optimise) are deactivated for
// now to keep the app focused on drawing review + highway dimensions.
const VIEWS: { id: DashTab; label: string }[] = [
  { id: "drawing", label: "Layers" },
  { id: "highway", label: "Highway" },
  { id: "network", label: "Network 3D" },
];

export function Toolbar({
  tab,
  onTab,
  tool,
  onTool,
  onZoomFit,
  onZoomIn,
  onZoomOut,
  hasDrawing,
}: Props) {
  return (
    <div className="toolbar">
      <div className="tool-group">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`tool-btn ${tab === v.id ? "active" : ""}`}
            onClick={() => onTab(v.id)}
            disabled={!hasDrawing}
          >
            <span className="tool-label">{v.label}</span>
          </button>
        ))}
      </div>

      {(tab === "drawing" || tab === "highway") && (
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === "pan" ? "active" : ""}`}
            data-tip="Pan (drag)"
            onClick={() => onTool("pan")}
          >
            <HandIcon />
          </button>
          <button
            className={`tool-btn ${tool === "measure" ? "active" : ""}`}
            data-tip="Measure distance"
            onClick={() => onTool("measure")}
          >
            <RulerIcon />
          </button>
          {tab === "drawing" && (
            <button
              className={`tool-btn ${tool === "pick" ? "active" : ""}`}
              data-tip="Pick layer colour"
              onClick={() => onTool("pick")}
            >
              <PickIcon />
            </button>
          )}
        </div>
      )}

      <div className="tool-group">
        <button className="tool-btn" data-tip="Zoom to fit" onClick={onZoomFit}>
          <FitIcon />
        </button>
        <button className="tool-btn" data-tip="Zoom in" onClick={onZoomIn}>
          <PlusIcon />
        </button>
        <button className="tool-btn" data-tip="Zoom out" onClick={onZoomOut}>
          <MinusIcon />
        </button>
      </div>
    </div>
  );
}

const s = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none" } as const;
const HandIcon = () => (
  <svg {...s}>
    <path
      d="M8 13V6.5a1.5 1.5 0 013 0V11m0-1V5.5a1.5 1.5 0 013 0V11m0-.5V7a1.5 1.5 0 013 0v6c0 3-2 6-5.5 6S11 17 9.5 15.5L6 12a1.4 1.4 0 012-2l1 1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const RulerIcon = () => (
  <svg {...s}>
    <rect x="3" y="8" width="18" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" transform="rotate(0)" />
    <path d="M7 8V11M11 8V12M15 8V11M19 8V12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const PickIcon = () => (
  <svg {...s}>
    <path d="M15 5l4 4-9 9-4 1 1-4 8-10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
const FitIcon = () => (
  <svg {...s}>
    <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const PlusIcon = () => (
  <svg {...s}>
    <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const MinusIcon = () => (
  <svg {...s}>
    <path d="M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
