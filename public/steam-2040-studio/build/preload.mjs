/* Headless generator for the PRELOADED unified aggregation comparison.
   Whole-network scoring (no study-area mask), demand-matched baseline,
   identical 800-origin pre-sampled trips, BPR rerouting — same protocol as
   the in-app optimiser's ranking pass, driven through the container's own
   rpc()/runAggAssign() globals. Writes preload-agg.json. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import fs from 'fs';
import zlib from 'zlib';

const FILE = 'file:///home/user/CLAUDE/public/steam-2040-studio/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SUF = process.env.OUTSUF || '';   // write to preload-agg<SUF>.json / preload-diff<SUF>.gz
const OUT = new URL(`./preload-agg${SUF}.json`, import.meta.url).pathname;
const OUTD = new URL(`./preload-diff${SUF}.gz`, import.meta.url).pathname;
const SAMPLE_N = process.env.SAMPLEN !== undefined ? +process.env.SAMPLEN : 800;  // 0 = ALL origins
const METHOD = process.env.ASSIGN_METHOD || 'bpr';   // 'fw' = Frank-Wolfe user equilibrium
const MIN_ABS = +(process.env.MINABS || 1);   // bake links with |Δ| ≥ this (veh)
const VDF_CAP = +(process.env.VDFCAP || 0);   // bound v/c in the BPR curve (both runs); 0 = unbounded

// methods × targets grid; app methods M1/M2 have their own natural zone counts
const TARGETS = (process.env.TARGETS || '3150,2600,2050,1500').split(',').map(Number);
const METHODS = (process.env.METHODS || 'nnd,qtd,nn,ward,kmeans,hex,quad,bal').split(',');
const LBL = { nn:'NN · adjacent-first', nnd:'NND · demand-weighted', qtd:'QTD · demand quadtree', ward:'WARD · variance-min', kmeans:'KM · compact k-means',
  kcenter:'KC · k-center coverage', grid:'GRID · square cells', hex:'HEX · hex cells',
  quad:'QT · quadtree adaptive', bal:'BAL · size-balanced', ring:'RING · rings × sectors' };
const CONFIGS = [];
if (process.env.CONFIGS_JSON) {
  for (const c of JSON.parse(process.env.CONFIGS_JSON)) {
    if (c.method) CONFIGS.push({ name: c.name || c.method.toUpperCase(), method: c.method });
    else if (c.gehx) CONFIGS.push({ name: 'GEHX · exact-guard @ ' + c.t, gehx: true, target: c.t });
    else CONFIGS.push({ name: LBL[c.m] + ' @ ' + c.t, custom: c.m, target: c.t });
  }
} else {
  for (const t of TARGETS) for (const m of METHODS) CONFIGS.push({ name: LBL[m] + ' @ ' + t, custom: m, target: t });
  if (!process.env.METHODS) {
    CONFIGS.push({ name: 'M1 · land use + distance', method: 'm1' });
    CONFIGS.push({ name: 'M2 · districts', method: 'm2' });
  }
}
if (process.env.ONLY) CONFIGS.length = +process.env.ONLY;

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 200)));

console.log('loading app…');
await page.goto(FILE, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 60000 });
console.log('viewer bridge ready');

// prepare the assignment: whole-network scoring, chosen method, full matrices
await page.evaluate(async ({ METHOD }) => {
  const { rpc, waitReady, switchApp, pollState } = window.__STEAM;
  switchApp('assign'); await waitReady('assign');
  await rpc('assign', { cmd: 'setarea', rect: null });               // WHOLE network
  await rpc('assign', { cmd: 'set', id: 'methodSel', value: METHOD });
  await rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });  // no origin sampling in the runner
  await pollState('assign', s => s.odStats && /matrix|trips|pairs/i.test(s.odStats), 20000);
  // long-run waiter: FW at all origins can take many minutes — the container's
  // runAggAssign caps at 240 s, so poll the app state directly instead
  window.__RUNWAIT = async function () {
    await rpc('assign', { cmd: 'click', id: 'runBtn' });
    const t0 = performance.now();
    for (;;) {
      const s = await rpc('assign', { cmd: 'snap', ids: ['kpi', 'status'] });
      const d = (s && s.data) || {};
      if (d.kpi && d.kpi.length > 2 && /origins\s*·.*links/i.test(d.status || '')) return;
      if (performance.now() - t0 > 3000000) throw new Error('assignment run timeout');
      await new Promise(r => setTimeout(r, 1500));
    }
  };
}, { METHOD });
if (process.env.WARMRUN) {   // one quick sampled run so GRAPH exists (gehagg needs it)
  await page.evaluate(async (METHOD) => {
    const S = window.__STEAM;
    await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: 'aon' });
    await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '50' });
    await S.runAggAssign();
    await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: METHOD });
    await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });
  }, METHOD);
  console.log('warm-up run done (graph built)');
}
if (VDF_CAP > 0) {   // capacity-restrained VDF: bound v/c in BOTH runs of every comparison
  let set = false;
  for (const f of page.frames()) {
    set = await f.evaluate(cap => { if (typeof GLINK === 'undefined') return false; window.__APPRCLAMP = cap; return true; }, VDF_CAP).catch(() => false) || set;
  }
  if (!set) throw new Error('could not set VDF cap — assign frame not found');
}
console.log(`assign ready (${METHOD}, whole-network scoring, sampleN=${SAMPLE_N || 'ALL'}, vdfCap=${VDF_CAP || 'none'})`);

const results = [];
for (let i = 0; i < CONFIGS.length; i++) {
  const cfg = CONFIGS[i];
  const t0 = Date.now();
  process.stdout.write(`[${i + 1}/${CONFIGS.length}] ${cfg.name} … `);
  try {
    const r = await page.evaluate(async ({ cfg, SAMPLE_N, MIN_ABS }) => {
      const { rpc, waitReady, switchApp, runAggAssign, fetchAgg, applyAggConfig } = window.__STEAM;
      switchApp('viewer'); await waitReady('viewer');
      if (!cfg.custom) await applyAggConfig(cfg);
      const agg = await fetchAgg(cfg);
      if (!agg || !agg.ok || !agg.merged) return { err: 'aggregation failed: ' + JSON.stringify(agg && agg.err || agg) };
      switchApp('assign'); await waitReady('assign');
      const odr = await rpc('assign', { cmd: 'aggod', pairs: agg.pairs, sampleN: SAMPLE_N });
      if (!odr || !odr.ok) return { err: 'aggod failed' };
      await rpc('assign', { cmd: 'odbase', which: 'filt' });
      let t = performance.now(); await window.__RUNWAIT(); const baseRt = (performance.now() - t) / 1000;
      await rpc('assign', { cmd: 'snapfull' });
      await rpc('assign', { cmd: 'odbase', which: 'agg' });
      t = performance.now(); await window.__RUNWAIT(); const rt = (performance.now() - t) / 1000;
      const cmp = await rpc('assign', { cmd: 'cmpfull' });
      if (!cmp || !cmp.ok) return { err: 'cmpfull failed' };
      const xd = await rpc('assign', { cmd: 'expdiff', minAbs: MIN_ABS, timeoutMs: 60000 });
      const internPct = 100 * odr.internalised / Math.max(1, odr.internalised + odr.keptTrips);
      return { zones: agg.zones, merged: agg.merged, pctRmse: cmp.pctRmse, vhtErr: cmp.vhtErr,
               corr: cmp.corr, nLinks: cmp.nLinks, internPct, internalised: odr.internalised,
               keptTrips: odr.keptTrips, rt, baseRt,
               pctW1: cmp.pctW1, pctW5: cmp.pctW5, geh5: cmp.geh5, pctG2: cmp.pctG2, maxGeh: cmp.maxGeh, p95pct: cmp.p95pct, nCarry: cmp.nCarry,
               exact: agg.exact, soft: agg.soft, maxW: agg.maxW,
               diff: (xd && xd.ok) ? { idx: xd.idx, dv: xd.dv, fv: xd.fv, dmax: xd.dmax, m: xd.m, nNonZero: xd.nNonZero } : null };
    }, { cfg, SAMPLE_N, MIN_ABS });
    if (r.err) { console.log('SKIP —', r.err); continue; }
    r.name = cfg.name; r.cfg = cfg;
    results.push(r);
    const dn = r.diff ? `${r.diff.idx.length}/${r.diff.nNonZero} Δ-links` : 'no diff';
    console.log(`${r.zones} zones · W1 ${r.pctW1.toFixed(1)}% · GEH<5 ${r.geh5.toFixed(1)}% · VHT ${r.vhtErr.toFixed(2)}% · RMSE ${r.pctRmse.toFixed(1)}% · intern ${r.internPct.toFixed(1)}% · ${dn} · ${r.rt.toFixed(1)}s/${r.baseRt.toFixed(1)}s  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
    writeOutputs(results);
  } catch (e) {
    console.log('ERROR —', String(e).slice(0, 200));
  }
}

/* pack all diffs into one binary (per config: idx Uint32, dv Int16 quantised,
   fv Uint16 quantised), gzip it, and keep only offsets/scales in the JSON */
function writeOutputs(results) {
  let total = 0;
  const metas = results.map(r => {
    const n = r.diff ? r.diff.idx.length : 0;
    const pad = (4 - ((8 * n) % 4)) % 4;
    const off = total; total += 8 * n + pad;
    return { off, n, pad };
  });
  const buf = Buffer.alloc(total);
  const jres = results.map((r, i) => {
    const { diff, ...rest } = r;
    if (!diff || !metas[i].n) return rest;
    const { idx, dv, fv, dmax } = diff;
    let dvMax = 0, fvMax = 0;
    for (let j = 0; j < idx.length; j++) { const a = Math.abs(dv[j]); if (a > dvMax) dvMax = a; if (fv[j] > fvMax) fvMax = fv[j]; }
    const dvS = dvMax / 32767 || 1, fvS = fvMax / 65535 || 1;
    let o = metas[i].off;
    for (let j = 0; j < idx.length; j++, o += 4) buf.writeUInt32LE(idx[j], o);
    for (let j = 0; j < idx.length; j++, o += 2) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(dv[j] / dvS))), o);
    for (let j = 0; j < idx.length; j++, o += 2) buf.writeUInt16LE(Math.min(65535, Math.round(fv[j] / fvS)), o);
    return { ...rest, dOff: metas[i].off, dN: idx.length, dvS, fvS, dmax, dM: diff.m };
  });
  fs.writeFileSync(OUTD, zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(OUT, JSON.stringify({ sampleN: SAMPLE_N, scope: 'whole-network', method: METHOD, minAbs: MIN_ABS, vdfCap: VDF_CAP || null, results: jres }, null, 1));
}

// restore the un-aggregated matrix so nothing is left in a weird state
await page.evaluate(async () => { await window.__STEAM.rpc('assign', { cmd: 'aggod', pairs: [] }); });
await browser.close();
console.log(`\nDONE — ${results.length}/${CONFIGS.length} configs → ${OUT}`);
