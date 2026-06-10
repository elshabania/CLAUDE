"use client";

export type DashTab =
  | "drawing"
  | "highway"
  | "network"
  | "movements"
  | "phasing"
  | "ai"
  | "interchg";

interface Props {
  active: DashTab;
  onChange: (tab: DashTab) => void;
}

const TABS: {
  id: DashTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "drawing",
    label: "Drawing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4 9H20M9 4V20"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "highway",
    label: "Highway",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 21L9 3M19 21L15 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 4V8M12 11V14M12 17V20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "network",
    label: "Network",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7L11 16M16 7L13 16M8 6H16" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: "movements",
    label: "Movements",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 7H19M5 12H15M5 17H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="7" r="2" fill="currentColor" />
        <circle cx="17" cy="12" r="2" fill="currentColor" />
        <circle cx="13" cy="17" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "phasing",
    label: "Phasing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 14C5 8 9 6 12 12C15 18 19 16 21 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI Opt",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3L13.7 8.4H19.4L14.85 11.7L16.55 17.1L12 13.8L7.45 17.1L9.15 11.7L4.6 8.4H10.3L12 3Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "interchg",
    label: "Interchg",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 16C8 16 8 8 11 8M19 8C16 8 16 16 13 16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="5" cy="16" r="1.5" fill="currentColor" />
        <circle cx="19" cy="8" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      style={{
        display: "flex",
        background: "#0a1120",
        borderTop: "1px solid #1e293b",
        flex: "0 0 auto",
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "12px 6px 10px",
              background: "transparent",
              border: 0,
              borderTop: isActive ? "2px solid #fbbf24" : "2px solid transparent",
              color: isActive ? "#fbbf24" : "#64748b",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
