/* Authoritative extraction of merge pairs for every app method + variation.
   The UI cascade (guards -> sets -> method) fires several chunked async
   recomputes; a zone-count poll can capture an intermediate partition. Here:
   apply config, wait for the agg label to go quiet, then fire ONE final
   recompute (re-set methodSel) and wait quiet again, then require two
   identical pairs snapshots 2s apart. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'fs';

const DIR = '/tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/mine';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CFGS = [
  ['m1',        { method: 'm1' }],
  ['m1_strict', { method: 'm1', guards: { m1Strict: true } }],
  ['m1_dens',   { method: 'm1', guards: { m1Density: true } }],
  ['m1_sd',     { method: 'm1', guards: { m1Strict: true, m1Density: true } }],
  ['m1_urb',    { method: 'm1', guards: { gUrban: true } }],
  ['m1_metro',  { method: 'm1', guards: { gMetro: true } }],
  ['m2',        { method: 'm2' }],
  ['m2_lu',     { method: 'm2', guards: { gLuClass: true } }],
  ['m2_urb',    { method: 'm2', guards: { gUrban: true } }],
  ['m2_metro',  { method: 'm2', guards: { gMetro: true } }],
  ['m2_frt',    { method: 'm2', guards: { gFreight: true } }],
  ['m2_art',    { method: 'm2', sets: { barLevelSel: 'art' } }],
  ['m3',        { method: 'm3' }],
  ['m3_urb',    { method: 'm3', guards: { gUrban: true } }],
  ['m3_metro',  { method: 'm3', guards: { gMetro: true } }],
  ['m3_frt',    { method: 'm3', guards: { gFreight: true } }],
  ['m3_art',    { method: 'm3', sets: { barLevelSel: 'art' } }],
  ['m4',        { method: 'm4' }],
  ['m4_urb',    { method: 'm4', guards: { gUrban: true } }],
  ['m4_metro',  { method: 'm4', guards: { gMetro: true } }],
  ['m4_frt',    { method: 'm4', guards: { gFreight: true } }],
  ['m4_art',    { method: 'm4', sets: { barLevelSel: 'art' } }],
  ['m5',        { method: 'm5' }],
  ['m5_urb',    { method: 'm5', guards: { gUrban: true } }],
  ['m5_metro',  { method: 'm5', guards: { gMetro: true } }],
  ['m5_frt',    { method: 'm5', guards: { gFreight: true } }],
  ['m5_art',    { method: 'm5', sets: { barLevelSel: 'art' } }],
  ['dist',      { method: 'distance' }],
  ['dist_c95',  { method: 'distance', sets: { confSel: '0.95' } }],
  ['dist_t05',  { method: 'distance', sets: { tolSel: '0.5' } }],
  ['dist_t2',   { method: 'distance', sets: { tolSel: '2' } }],
  ['dist_art',  { method: 'distance', sets: { barLevelSel: 'art' } }],
  ['dem',       { method: 'demand' }],
  ['dem_b05',   { method: 'demand', sets: { budgetSel: '0.5' } }],
  ['dem_b2',    { method: 'demand', sets: { budgetSel: '2' } }],
  ['dem_urb',   { method: 'demand', guards: { gUrban: true } }],
];

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto('file://' + DIR + '/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live') && window.__STEAM, undefined, { timeout: 90000 });
await page.evaluate(async () => { window.__STEAM.switchApp('viewer'); await window.__STEAM.waitReady('viewer'); });

const out = {};
for (const [key, cfg] of CFGS) {
  const r = await page.evaluate(async (cfg) => {
    const S = window.__STEAM;
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    async function lbl() { const t = await S.rpc('viewer', { cmd: 'read', id: 'agglbl' }); return (t && t.text) || ''; }
    async function quiet(maxMs) {
      let prev = null, same = 0; const t0 = performance.now();
      while (performance.now() - t0 < maxMs) {
        const t = await lbl();
        if (t === prev && !/Computing|%$/.test(t)) { if (++same >= 4) return t; }
        else same = 0;
        prev = t; await sleep(800);
      }
      return prev;
    }
    await S.applyAggConfig(cfg);
    await quiet(90000);
    // one final authoritative recompute with the fully-applied guard/set state
    await S.rpc('viewer', { cmd: 'set', id: 'methodSel', value: cfg.method });
    const label = await quiet(90000);
    let a = await S.fetchAgg(cfg);
    for (let i = 0; i < 10; i++) {
      await sleep(2000);
      const b = await S.fetchAgg(cfg);
      if (a && b && a.ok && b.ok && JSON.stringify(a.pairs) === JSON.stringify(b.pairs)) { a = b; break; }
      a = b;
    }
    if (!a || !a.ok) return { err: (a && a.err) || 'no result' };
    return { pairs: a.pairs, merged: a.merged, zones: a.zones, total: a.total, label };
  }, cfg);
  if (r.err) { console.log(key, 'ERR:', r.err); out[key] = { err: r.err, cfg }; continue; }
  out[key] = { pairs: r.pairs, zones: r.zones, merged: r.merged, total: r.total, label: r.label, cfg };
  console.log(key, '-> zones', r.zones, 'merged', r.merged, '|', r.label.slice(0, 80));
}

writeFileSync(DIR + '/renum-app.json', JSON.stringify(out));
await browser.close();
console.log('DONE');
