/* Extract centroids + connectors for 5 zonal systems (level 0 as-received +
   4 best aggregations) → zones-export.json */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const DIR = new URL('.', import.meta.url).pathname;
const FILE = 'file://' + DIR + 'index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PRE = JSON.parse(fs.readFileSync(DIR + 'preload-agg.json', 'utf8'));

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(FILE, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 90000 });

// warm the graph, fetch zone table (id, attachment node, node xy, trip ends)
const base = await page.evaluate(async () => {
  const S = window.__STEAM, rpc = S.rpc;
  S.switchApp('assign'); await S.waitReady('assign');
  await S.pollState('assign', s => s.odStats && /matrix|trips|pairs/i.test(s.odStats), 20000);
  await rpc('assign', { cmd: 'set', id: 'methodSel', value: 'aon' });
  await rpc('assign', { cmd: 'set', id: 'sampleSel', value: '500' });
  await S.runAggAssign();
  const gd = await rpc('assign', { cmd: 'gehdata', timeoutMs: 30000 });
  return { ids: gd.ids, nd: gd.nd, w: gd.w, xs: gd.xs, ys: gd.ys };
});
console.log('zones with attachment:', base.ids.length);

// viewer centroids by zone id (same-origin blob frame → read its globals)
let vframe = null;
for (const f of page.frames()) {
  if (await f.evaluate(() => typeof CIDS !== 'undefined' && typeof CENT !== 'undefined').catch(() => false)) { vframe = f; break; }
}
const cent = vframe ? await vframe.evaluate(() => {
  const out = {};
  for (let i = 0; i < CIDS.length; i++) out[CIDS[i] >>> 0] = [Math.round(CENT[i * 2]), Math.round(CENT[i * 2 + 1])];
  return out;
}) : {};
console.log('viewer centroids:', Object.keys(cent).length);

// the four aggregations' merge lists
const LEVELS = [{ key: 'L0_as_received', pairs: [] }];
for (const t of [2800, 2600, 2050]) {
  const agg = await page.evaluate(async (t) => window.__STEAM.rpc('assign', { cmd: 'gehagg', target: t, variant: 'o', timeoutMs: 180000 }), t);
  LEVELS.splice(1, 0, { key: 'GEHX_' + t, pairs: agg.pairs });
}
LEVELS.splice(1, 0, { key: 'GEHX100_3004_certified', pairs: PRE.pairsets.gehx100.pairs });
await browser.close();

// assemble rows per level
const W = new Map(base.ids.map((id, i) => [id, base.w[i]]));
const NODE = new Map(base.ids.map((id, i) => [id, [base.xs[i], base.ys[i]]]));
const out = {};
for (const L of LEVELS) {
  const rep = new Map(L.pairs.map(([m, r]) => [m, r]));
  const members = new Map(), ends = new Map();
  for (const id of base.ids) {
    let r = id, hop = 0; while (rep.has(r) && hop++ < 60) r = rep.get(r);
    members.set(r, (members.get(r) || 0) + 1);
    ends.set(r, (ends.get(r) || 0) + (W.get(id) || 0));
  }
  const rows = [];
  for (const [r, m] of members) {
    const c = cent[r] || NODE.get(r), n = NODE.get(r);
    if (!c || !n) continue;
    rows.push({ id: r, cx: c[0], cy: c[1], nx: n[0], ny: n[1], members: m, tripends: Math.round((ends.get(r) || 0) * 10) / 10 });
  }
  out[L.key] = { rows: rows, pairs: L.pairs };
  console.log(L.key, '→', rows.length, 'zones (', L.pairs.length, 'merges )');
}
fs.writeFileSync(DIR + 'zones-export.json', JSON.stringify(out));
console.log('DONE');
