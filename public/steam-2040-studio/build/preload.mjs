/* Headless generator for the PRELOADED unified aggregation comparison.
   Whole-network scoring (no study-area mask), demand-matched baseline,
   identical 800-origin pre-sampled trips, BPR rerouting — same protocol as
   the in-app optimiser's ranking pass, driven through the container's own
   rpc()/runAggAssign() globals. Writes preload-agg.json. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const FILE = 'file:///home/user/CLAUDE/public/steam-2040-studio/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = new URL('./preload-agg.json', import.meta.url).pathname;
const SAMPLE_N = 800;

// methods × targets grid; app methods M1/M2 have their own natural zone counts
const TARGETS = (process.env.TARGETS || '3150,2600,2050,1500').split(',').map(Number);
const METHODS = (process.env.METHODS || 'nn,ward,kmeans,hex,quad,bal').split(',');
const LBL = { nn:'NN · adjacent-first', ward:'WARD · variance-min', kmeans:'KM · compact k-means',
  kcenter:'KC · k-center coverage', grid:'GRID · square cells', hex:'HEX · hex cells',
  quad:'QT · quadtree adaptive', bal:'BAL · size-balanced', ring:'RING · rings × sectors' };
const CONFIGS = [];
for (const t of TARGETS) for (const m of METHODS) CONFIGS.push({ name: LBL[m] + ' @ ' + t, custom: m, target: t });
if (!process.env.METHODS) {
  CONFIGS.push({ name: 'M1 · land use + distance', method: 'm1' });
  CONFIGS.push({ name: 'M2 · districts', method: 'm2' });
}
if (process.env.ONLY) CONFIGS.length = +process.env.ONLY;

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 200)));

console.log('loading app…');
await page.goto(FILE, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 60000 });
console.log('viewer bridge ready');

// prepare the assignment: whole-network scoring, BPR, pre-sampled matrices
await page.evaluate(async (SAMPLE_N) => {
  const { rpc, waitReady, switchApp, pollState } = window.__STEAM;
  switchApp('assign'); await waitReady('assign');
  await rpc('assign', { cmd: 'setarea', rect: null });               // WHOLE network
  await rpc('assign', { cmd: 'set', id: 'methodSel', value: 'bpr' });
  await rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });  // matrices are pre-sampled
  await pollState('assign', s => s.odStats && /matrix|trips|pairs/i.test(s.odStats), 20000);
}, SAMPLE_N);
console.log('assign ready (bpr, whole-network scoring)');

const results = [];
for (let i = 0; i < CONFIGS.length; i++) {
  const cfg = CONFIGS[i];
  const t0 = Date.now();
  process.stdout.write(`[${i + 1}/${CONFIGS.length}] ${cfg.name} … `);
  try {
    const r = await page.evaluate(async ({ cfg, SAMPLE_N }) => {
      const { rpc, waitReady, switchApp, runAggAssign, fetchAgg, applyAggConfig } = window.__STEAM;
      switchApp('viewer'); await waitReady('viewer');
      if (!cfg.custom) await applyAggConfig(cfg);
      const agg = await fetchAgg(cfg);
      if (!agg || !agg.ok || !agg.merged) return { err: 'aggregation failed: ' + JSON.stringify(agg && agg.err || agg) };
      switchApp('assign'); await waitReady('assign');
      const odr = await rpc('assign', { cmd: 'aggod', pairs: agg.pairs, sampleN: SAMPLE_N });
      if (!odr || !odr.ok) return { err: 'aggod failed' };
      await rpc('assign', { cmd: 'odbase', which: 'filt' });
      let t = performance.now(); await runAggAssign(); const baseRt = (performance.now() - t) / 1000;
      await rpc('assign', { cmd: 'snapfull' });
      await rpc('assign', { cmd: 'odbase', which: 'agg' });
      t = performance.now(); await runAggAssign(); const rt = (performance.now() - t) / 1000;
      const cmp = await rpc('assign', { cmd: 'cmpfull' });
      if (!cmp || !cmp.ok) return { err: 'cmpfull failed' };
      const internPct = 100 * odr.internalised / Math.max(1, odr.internalised + odr.keptTrips);
      return { zones: agg.zones, merged: agg.merged, pctRmse: cmp.pctRmse, vhtErr: cmp.vhtErr,
               corr: cmp.corr, nLinks: cmp.nLinks, internPct, internalised: odr.internalised,
               keptTrips: odr.keptTrips, rt, baseRt };
    }, { cfg, SAMPLE_N });
    if (r.err) { console.log('SKIP —', r.err); continue; }
    r.name = cfg.name; r.cfg = cfg;
    results.push(r);
    console.log(`${r.zones} zones · RMSE ${r.pctRmse.toFixed(2)}% · VHT ${r.vhtErr.toFixed(2)}% · corr ${r.corr.toFixed(3)} · intern ${r.internPct.toFixed(1)}% · ${r.rt.toFixed(1)}s vs base ${r.baseRt.toFixed(1)}s  [${((Date.now() - t0) / 1000).toFixed(0)}s total]`);
    fs.writeFileSync(OUT, JSON.stringify({ sampleN: SAMPLE_N, scope: 'whole-network', method: 'bpr', results }, null, 1));
  } catch (e) {
    console.log('ERROR —', String(e).slice(0, 200));
  }
}

// restore the un-aggregated matrix so nothing is left in a weird state
await page.evaluate(async () => { await window.__STEAM.rpc('assign', { cmd: 'aggod', pairs: [] }); });
await browser.close();
console.log(`\nDONE — ${results.length}/${CONFIGS.length} configs → ${OUT}`);
