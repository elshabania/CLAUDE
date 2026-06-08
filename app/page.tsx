"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RegionMap } from "@/components/RegionMap";
import { RegionBars, TrendChart, REGION_COLORS } from "@/components/Charts";
import {
  EMIRATE_TOTALS,
  METHOD_NOTES,
  METRIC_LABELS,
  REGION_BY_CODE,
  SNAPSHOTS,
  SOURCES,
  type Metric,
  type RegionCode,
  cagrVsPrevious,
  emirateTotal,
  formatNumber,
  growthVsPrevious,
  metricValue,
  snapshotFor,
} from "@/lib/abudhabi-data";

const METRICS: Metric[] = ["population", "density", "share"];

export default function Page() {
  const years = SNAPSHOTS.map((s) => s.year);
  const [yearIdx, setYearIdx] = useState(years.length - 1);
  const [metric, setMetric] = useState<Metric>("population");
  const [selected, setSelected] = useState<RegionCode | null>(null);
  const [hovered, setHovered] = useState<RegionCode | null>(null);

  const year = years[yearIdx];
  const snapshot = useMemo(() => snapshotFor(year), [year]);
  const total = emirateTotal(snapshot);

  const detail = selected ?? hovered;

  return (
    <main style={{ minHeight: "100vh", maxWidth: 1280, margin: "0 auto", padding: "28px 24px 64px" }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.3 }}>
            Abu Dhabi Population Explorer
          </h1>
          <Link href="/cad" style={{ color: "#64748b", fontSize: 13, textDecoration: "none" }}>
            Road CAD Viewer →
          </Link>
        </div>
        <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 14, maxWidth: 760 }}>
          Compare resident population and population density across Abu Dhabi&apos;s three
          regions, and watch how they change over time. Built on official open data from the
          Statistics Centre – Abu Dhabi (SCAD) and the Abu Dhabi Census 2023.
        </p>
      </header>

      {/* Controls */}
      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#0b1220",
          border: "1px solid #1e293b",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid " + (metric === m ? "#2563eb" : "#1e293b"),
                background: metric === m ? "#2563eb" : "transparent",
                color: metric === m ? "white" : "#cbd5e1",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>
            <span>Year</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>
              {year}{" "}
              <span style={{ color: "#64748b", fontWeight: 400 }}>
                ({snapshot.kind === "census" ? "Census" : "Estimate"})
              </span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={years.length - 1}
            value={yearIdx}
            onChange={(e) => setYearIdx(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginTop: 2 }}>
            {years.map((y) => (
              <span key={y}>{y}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Emirate total</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(total)}
          </div>
        </div>
      </section>

      {/* Map + side panel */}
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20, marginBottom: 20 }}>
        <Card title={`${METRIC_LABELS[metric]} by region — ${year}`}>
          <RegionMap
            snapshot={snapshot}
            metric={metric}
            selected={selected}
            onSelect={(c) => setSelected((prev) => (prev === c ? null : c))}
            hovered={hovered}
            onHover={setHovered}
          />
        </Card>

        <Card title={detail ? REGION_BY_CODE[detail].name : "Region comparison"}>
          {detail ? (
            <RegionDetail code={detail} year={year} />
          ) : (
            <>
              <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 0 }}>
                Tap a region on the map or a bar below to see its detail. Bars are scaled to the
                selected metric.
              </p>
              <RegionBars snapshot={snapshot} metric={metric} onSelect={(c) => setSelected(c)} selected={selected} />
            </>
          )}
        </Card>
      </section>

      {/* Trend + bars */}
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20, marginBottom: 20 }}>
        <Card title="Population over time">
          <TrendChart selected={selected} activeYear={year} />
          <Legend />
        </Card>
        <Card title={`${METRIC_LABELS[metric]} — ${year}`}>
          <RegionBars snapshot={snapshot} metric={metric} onSelect={(c) => setSelected((p) => (p === c ? null : c))} selected={selected} />
        </Card>
      </section>

      {/* Data table */}
      <Card title="Data table">
        <DataTable />
      </Card>

      {/* Sources & method */}
      <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
        <Card title="How these numbers were compiled">
          <ul style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
            {METHOD_NOTES.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
        <Card title="Sources (public open data)">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {SOURCES.map((s) => (
              <li key={s.key}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 15, color: "#e2e8f0" }}>{title}</h2>
      {children}
    </div>
  );
}

function RegionDetail({ code, year }: { code: RegionCode; year: number }) {
  const snap = snapshotFor(year);
  const region = REGION_BY_CODE[code];
  const pop = snap.population[code];
  const density = metricValue(snap, code, "density");
  const share = metricValue(snap, code, "share");
  const growth = growthVsPrevious(year, code);
  const cagr = cagrVsPrevious(year, code);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Stat label="Population" value={formatNumber(pop)} accent={REGION_COLORS[code]} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Stat label="Density" value={`${formatNumber(density)} /km²`} />
        <Stat label="Share of emirate" value={`${share.toFixed(1)}%`} />
        <Stat
          label="Change vs prev. snapshot"
          value={growth == null ? "—" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
        />
        <Stat label="Annualised (CAGR)" value={cagr == null ? "—" : `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%/yr`} />
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>
        Approx. land area {formatNumber(region.areaKm2)} km².
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: accent ?? "#f8fafc",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Legend() {
  const items: { code: RegionCode | "total"; label: string }[] = [
    { code: "AUH", label: "Capital" },
    { code: "AIN", label: "Al Ain" },
    { code: "DHA", label: "Al Dhafra" },
    { code: "total", label: "Emirate total" },
  ];
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
      {items.map((it) => (
        <span key={it.code} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 3,
              borderRadius: 2,
              background: it.code === "total" ? "#e2e8f0" : REGION_COLORS[it.code as RegionCode],
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function DataTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: "#94a3b8", textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Year</th>
            <th style={{ padding: "6px 8px" }}>Capital</th>
            <th style={{ padding: "6px 8px" }}>Al Ain</th>
            <th style={{ padding: "6px 8px" }}>Al Dhafra</th>
            <th style={{ padding: "6px 8px" }}>Emirate total</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Source</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
          {SNAPSHOTS.map((s) => (
            <tr key={s.year} style={{ borderTop: "1px solid #1e293b" }}>
              <td style={{ padding: "6px 8px" }}>
                {s.year}{" "}
                <span style={{ color: "#475569", fontSize: 11 }}>
                  {s.kind === "census" ? "(census)" : "(est.)"}
                </span>
              </td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{formatNumber(s.population.AUH)}</td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{formatNumber(s.population.AIN)}</td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{formatNumber(s.population.DHA)}</td>
              <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>
                {formatNumber(emirateTotal(s))}
              </td>
              <td style={{ padding: "6px 8px", color: "#64748b", fontSize: 11 }}>{s.source}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid #1e293b", color: "#64748b" }}>
            <td colSpan={6} style={{ padding: "8px", fontSize: 11 }}>
              Emirate-only historical anchors:{" "}
              {EMIRATE_TOTALS.filter((e) => !SNAPSHOTS.some((s) => s.year === e.year))
                .map((e) => `${e.year}: ${formatNumber(e.total)}${e.approximate ? "*" : ""}`)
                .join(" · ")}{" "}
              (*approximate)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
