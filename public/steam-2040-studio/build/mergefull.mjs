/* Assemble the FINAL baked comparison:
   - GEHX-100 certified row (from gehx100-final.json, with its merge list
     baked as a pairset so apply ▸ / zones ▸ can rebuild it exactly)
   - the 79-config full grid (preload-agg.full.json, uniform BPR-800)
   - Frank-Wolfe equilibrium spot-checks attached by name (from the previous
     decision-grade bake)
   - Δ blobs kept for: GEHX-100, all GEHX rows, top-3 by GEH<5 per target
     group, and the app methods; other rows fall back to zones ▸.
   Writes preload-agg.json + preload-diff.gz (in this dir). */
import fs from 'fs';
import zlib from 'zlib';
const DIR = new URL('.', import.meta.url).pathname;

const full = JSON.parse(fs.readFileSync(DIR + 'preload-agg.full.json', 'utf8'));
const fullBuf = zlib.gunzipSync(fs.readFileSync(DIR + 'preload-diff.full.gz'));
const fw = JSON.parse(fs.readFileSync(DIR + 'preload-agg.fw-ref.json', 'utf8'));   // previous FW bake
const G = JSON.parse(fs.readFileSync(DIR + 'gehx100-final.json', 'utf8'));

const fwByName = new Map(fw.results.map(r => [r.name, r]));

// GEHX-100 row first
const gc = G.final.cmp;
const g100 = {
  name: 'GEHX-100 · certified all links < GEH 2 (' + G.zones + ' zones)',
  cfg: { pairset: 'gehx100', gehx100: true },
  zones: G.zones, pctRmse: gc.pctRmse, vhtErr: gc.vhtErr, corr: gc.corr, nLinks: gc.nLinks,
  internPct: G.final.internPct, rt: G.final.rt, baseRt: G.final.baseRt,
  pctW1: gc.pctW1, pctW5: gc.pctW5, geh5: gc.geh5, pctG2: gc.pctG2, maxGeh: gc.maxGeh, p95pct: gc.p95pct,
  _diff: G.final.diff,
};

// full-grid rows + fw annotations; select which diffs to keep
const rows = [g100];
const groups = new Map();
for (const r of full.results) {
  const out = { ...r };
  const f = fwByName.get(r.name);
  if (f && f.geh5 != null) out.fw = { geh5: f.geh5, pctW1: f.pctW1, vhtErr: f.vhtErr, corr: f.corr, rt: f.rt, baseRt: f.baseRt };
  rows.push(out);
  const g = (r.cfg && r.cfg.target) ? r.cfg.target : 'app';
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(out);
}
const keepDiff = new Set([g100]);
for (const r of rows) if (r.cfg && (r.cfg.gehx || r.cfg.method)) keepDiff.add(r);
for (const [, arr] of groups) {
  arr.slice().sort((a, b) => (b.geh5 ?? -1) - (a.geh5 ?? -1)).slice(0, 3).forEach(r => keepDiff.add(r));
}

// pack diffs
const chunks = [];
let off = 0;
function packRaw(idx, dv, fv) {
  const n = idx.length, pad = (4 - ((8 * n) % 4)) % 4;
  let dvMax = 0, fvMax = 0;
  for (let j = 0; j < n; j++) { const a = Math.abs(dv[j]); if (a > dvMax) dvMax = a; if (fv[j] > fvMax) fvMax = fv[j]; }
  const dvS = dvMax / 32767 || 1, fvS = fvMax / 65535 || 1;
  const blk = Buffer.alloc(8 * n + pad);
  let o = 0;
  for (let j = 0; j < n; j++, o += 4) blk.writeUInt32LE(idx[j], o);
  for (let j = 0; j < n; j++, o += 2) blk.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(dv[j] / dvS))), o);
  for (let j = 0; j < n; j++, o += 2) blk.writeUInt16LE(Math.min(65535, Math.round(fv[j] / fvS)), o);
  chunks.push(blk);
  const rec = { dOff: off, dN: n, dvS, fvS };
  off += blk.length;
  return rec;
}
let kept = 0, dropped = 0;
for (const r of rows) {
  if (r === g100) {
    if (keepDiff.has(r) && r._diff && r._diff.idx.length) {
      Object.assign(r, packRaw(r._diff.idx, r._diff.dv, r._diff.fv), { dmax: r._diff.dmax });
      kept++;
    }
    delete r._diff;
    continue;
  }
  if (keepDiff.has(r) && r.dN) {
    const bytes = 8 * r.dN, pad = (4 - (bytes % 4)) % 4;
    chunks.push(fullBuf.subarray(r.dOff, r.dOff + bytes), Buffer.alloc(pad));
    r.dOff = off; off += bytes + pad;
    kept++;
  } else {
    delete r.dOff; delete r.dN; delete r.dvS; delete r.fvS; delete r.dmax;
    dropped++;
  }
}
const out = { sampleN: full.sampleN, scope: full.scope, method: full.method, minAbs: full.minAbs,
  fwNote: 'fw fields = Frank-Wolfe user equilibrium spot-checks (all origins, capacity-restrained)',
  pairsets: { gehx100: { pairs: G.pairs, zones: G.zones } }, results: rows };
fs.writeFileSync(DIR + 'preload-diff.gz', zlib.gzipSync(Buffer.concat(chunks), { level: 9 }));
fs.writeFileSync(DIR + 'preload-agg.json', JSON.stringify(out, null, 1));
console.log(`final: ${rows.length} rows · diffs kept ${kept}, dropped ${dropped} · gz ${(fs.statSync(DIR + 'preload-diff.gz').size / 1e6).toFixed(2)} MB · json ${(fs.statSync(DIR + 'preload-agg.json').size / 1e3).toFixed(0)} KB`);
