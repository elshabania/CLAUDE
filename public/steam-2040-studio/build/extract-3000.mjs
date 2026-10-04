/* All app methods driven to ~3,000 zones, plus a tuned RING, each scored with
   the exact grid protocol (800-origin demand-matched baseline, BPR, whole
   network). The app's zone-target select has no 3,000 option, so one is
   injected into the viewer frame (same-origin blob iframe). */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'fs';

const DIR = '/tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/mine';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto('file://' + DIR + '/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live') && window.__STEAM, undefined, { timeout: 90000 });
await page.evaluate(async () => { window.__STEAM.switchApp('viewer'); await window.__STEAM.waitReady('viewer'); });

// inject a 3,000-zone option into the viewer's target select and pick it
let injected = false;
for (const f of page.frames()) {
  injected = await f.evaluate(() => {
    const s = document.getElementById('maxZoneSel');
    if (!s || typeof METHOD === 'undefined') return false;
    if (![...s.options].some(o => o.value === '3000')) {
      const o = document.createElement('option');
      o.value = '3000'; o.textContent = '3,000 zones';
      s.insertBefore(o, s.firstChild);
    }
    s.value = '3000'; s.dispatchEvent(new Event('change'));
    return true;
  }).catch(() => false) || injected;
}
if (!injected) throw new Error('viewer frame / maxZoneSel not found');
console.log('3,000-zone target injected');

// ---- extraction: label-quiet protocol (same as extract-app.mjs) ----
async function extract(cfg) {
  return page.evaluate(async (cfg) => {
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
    S.switchApp('viewer'); await S.waitReady('viewer');
    if (cfg.custom) {                       // custom methods bypass the UI cascade
      const a = await S.fetchAgg(cfg);
      return (a && a.ok) ? { pairs: a.pairs, zones: a.zones, merged: a.merged } : { err: (a && a.err) || 'no result' };
    }
    await S.applyAggConfig(cfg);
    await quiet(90000);
    await S.rpc('viewer', { cmd: 'set', id: 'methodSel', value: cfg.method });
    const label = await quiet(90000);
    let a = await S.fetchAgg(cfg);
    for (let i = 0; i < 10; i++) {
      await new Promise(res => setTimeout(res, 2000));
      const b = await S.fetchAgg(cfg);
      if (a && b && a.ok && b.ok && JSON.stringify(a.pairs) === JSON.stringify(b.pairs)) { a = b; break; }
      a = b;
    }
    if (!a || !a.ok) return { err: (a && a.err) || 'no result' };
    return { pairs: a.pairs, merged: a.merged, zones: a.zones, label };
  }, cfg);
}

const out = {};
const APP = [
  ['m1_3000', { method: 'm1' }], ['m2_3000', { method: 'm2' }], ['m3_3000', { method: 'm3' }],
  ['m4_3000', { method: 'm4' }], ['m5_3000', { method: 'm5' }],
  ['dist_3000', { method: 'distance', sets: { tolSel: '0.5' } }],
];
for (const [key, cfg] of APP) {
  const r = await extract(cfg);
  if (r.err) { console.log(key, 'ERR:', r.err); continue; }
  out[key] = { pairs: r.pairs, zones: r.zones, merged: r.merged, cfg, label: r.label };
  console.log(key, '-> zones', r.zones, 'merged', r.merged);
}

// ---- RING: probe targets until the achieved count lands nearest 3,000 ----
let best = null;
for (const t of [3200, 3350, 3500, 3650]) {
  const r = await extract({ custom: 'ring', target: t });
  if (r.err) { console.log('ring', t, 'ERR:', r.err); continue; }
  console.log('ring probe target', t, '-> zones', r.zones);
  if (!best || Math.abs(r.zones - 3022) < Math.abs(best.zones - 3022)) best = { ...r, target: t };
}
if (best) {
  out['ring_t'] = { pairs: best.pairs, zones: best.zones, merged: best.merged, cfg: { custom: 'ring', target: best.target } };
  console.log('ring chosen: target', best.target, 'zones', best.zones);
}

writeFileSync(DIR + '/renum-3000.json', JSON.stringify(out));

// ---- scoring: exact grid protocol on each extracted partition ----
await page.evaluate(async () => {
  const { rpc, waitReady, switchApp } = window.__STEAM;
  switchApp('assign'); await waitReady('assign');
  await rpc('assign', { cmd: 'setarea', rect: null });
  await rpc('assign', { cmd: 'set', id: 'methodSel', value: 'bpr' });
  await rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });
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
});
for (const key of Object.keys(out)) {
  const sc = await page.evaluate(async (pairs) => {
    const { rpc } = window.__STEAM;
    const odr = await rpc('assign', { cmd: 'aggod', pairs, sampleN: 800 });
    if (!odr || !odr.ok) return { err: 'aggod failed' };
    await rpc('assign', { cmd: 'odbase', which: 'filt' });
    let t = performance.now(); await window.__RUNWAIT(); const baseRt = (performance.now() - t) / 1000;
    await rpc('assign', { cmd: 'snapfull' });
    await rpc('assign', { cmd: 'odbase', which: 'agg' });
    t = performance.now(); await window.__RUNWAIT(); const rt = (performance.now() - t) / 1000;
    const cmp = await rpc('assign', { cmd: 'cmpfull' });
    if (!cmp || !cmp.ok) return { err: 'cmpfull failed' };
    const internPct = 100 * odr.internalised / Math.max(1, odr.internalised + odr.keptTrips);
    return { pctRmse: cmp.pctRmse, vhtErr: cmp.vhtErr, corr: cmp.corr, internPct,
             pctW1: cmp.pctW1, pctW5: cmp.pctW5, geh5: cmp.geh5, pctG2: cmp.pctG2,
             maxGeh: cmp.maxGeh, p95pct: cmp.p95pct, nCarry: cmp.nCarry, rt, baseRt };
  }, out[key].pairs);
  if (sc.err) { console.log('score', key, 'ERR:', sc.err); continue; }
  out[key].score = sc;
  console.log('score', key, '-> GEH<5', sc.geh5.toFixed(2) + '%', 'GEH<2', sc.pctG2.toFixed(2) + '%',
              'W1', sc.pctW1.toFixed(1) + '%', 'VHT', sc.vhtErr.toFixed(2) + '%', 'rt', sc.rt.toFixed(0) + 's/' + sc.baseRt.toFixed(0) + 's');
  writeFileSync(DIR + '/renum-3000.json', JSON.stringify(out));
}

await browser.close();
console.log('DONE');
