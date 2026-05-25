// Deliverable exports: turn the in-memory analysis into CSV files an engineer
// can drop into a report or spreadsheet.

import { DIRS, type JunctionResult } from "@/lib/hcm";
import type { NetworkDimensions } from "@/lib/highway-dims";

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row per junction approach, with the junction summary repeated. */
export function junctionResultsToCsv(
  results: Record<string, JunctionResult>,
  labelOf: (id: string) => string
): string {
  const rows: (string | number)[][] = [
    [
      "Junction",
      "Junction LOS",
      "Junction delay (s/veh)",
      "Junction v/c (max)",
      "Total volume (veh/h)",
      "Approach",
      "Approach LOS",
      "Approach delay (s/veh)",
      "Approach v/c (max)",
      "Approach volume (veh/h)",
      "95% queue (m)",
      "Spillback",
    ],
  ];
  for (const [id, res] of Object.entries(results)) {
    const label = labelOf(id);
    for (const dir of DIRS) {
      const a = res.approaches[dir];
      if (!a || a.vol <= 0) continue;
      rows.push([
        label,
        res.los,
        r1(res.delay),
        r2(res.vcMax),
        Math.round(res.totalVolume),
        dir,
        a.los,
        r1(a.delay),
        r2(a.vcMax),
        Math.round(a.vol),
        r1(a.q95mMax),
        a.spillback ? "yes" : "no",
      ]);
    }
  }
  return toCsv(rows);
}

/** One row per network link with geometry + LOS. */
export function dimensionsToCsv(dims: NetworkDimensions): string {
  const rows: (string | number | null)[][] = [
    [
      "Link",
      "Functional class",
      "Length",
      "Width",
      "Lanes/dir",
      "Total lanes",
      "Min curve radius",
      "FFS (km/h)",
      "Travel speed (km/h)",
      "v/c",
      "LOS",
    ],
  ];
  for (const l of dims.links) {
    rows.push([
      l.linkId,
      l.functionalClass,
      r1(l.length),
      l.width != null ? r1(l.width) : null,
      l.lanesPerDir,
      l.totalLanes,
      l.minCurveRadius != null ? r1(l.minCurveRadius) : null,
      Math.round(l.ffsKmh),
      l.los ? Math.round(l.los.travelSpeedKmh) : null,
      l.los ? r2(l.los.vc) : null,
      l.los ? l.los.los : null,
    ]);
  }
  return toCsv(rows);
}
