/* GEHX-100 frontier: find the max compression whose MEASURED GEH<2 share is
   100% (carrying links, exact demand-matched protocol). Probes the plain
   policy by binary search AND the budget-guarded "g2" variant's natural
   stall point, then reports both. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';

const FILE = process.env.APPFILE || 'file:///tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/mine/index-g2.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(FILE, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 90000 });
await page.evaluate(async () => {
  const S = window.__STEAM;
  S.switchApp('assign'); await S.waitReady('assign');
  await S.rpc('assign', { cmd: 'setarea', rect: null });
  await S.pollState('assign', s => s.odStats && /matrix|trips|pairs/i.test(s.odStats), 20000);
  await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: 'aon' });
  await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '500' });
  await S.runAggAssign();
  await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: 'bpr' });
  await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });
});
console.log('ready');

async function score(variant, target) {
  return page.evaluate(async ({ variant, target }) => {
    const S = window.__STEAM, rpc = S.rpc;
    const agg = await rpc('assign', { cmd: 'gehagg', target, variant, timeoutMs: 180000 });
    if (!agg || !agg.ok) return { err: agg && agg.err };
    const odr = await rpc('assign', { cmd: 'aggod', pairs: agg.pairs, sampleN: 800 });
    if (!odr || !odr.ok) return { err: 'aggod' };
    await rpc('assign', { cmd: 'odbase', which: 'filt' });
    await S.runAggAssign();
    await rpc('assign', { cmd: 'snapfull' });
    await rpc('assign', { cmd: 'odbase', which: 'agg' });
    await S.runAggAssign();
    const cmp = await rpc('assign', { cmd: 'cmpfull' });
    if (!cmp || !cmp.ok) return { err: 'cmp' };
    return { zones: agg.zones, soft: agg.soft, moved: agg.moved, maxW: agg.maxW,
             pctG2: cmp.pctG2, geh5: cmp.geh5, pctW1: cmp.pctW1, vhtErr: cmp.vhtErr, maxGeh: cmp.maxGeh, nGeh: cmp.nGeh };
  }, { variant, target });
}
const fmt = r => `zones=${r.zones} GEH<2=${r.pctG2.toFixed(3)}% GEH<5=${r.geh5.toFixed(2)}% maxGEH=${r.maxGeh.toFixed(2)} W1=${r.pctW1.toFixed(1)}% moved=${r.moved}`;

// 1) budget-guarded g2: ask for deep target, let the budget stall it naturally
let r = await score('g2', 1500);
console.log('g2 stall →', r.err || fmt(r));

// 2) plain policy: binary-search the 100%-GEH<2 frontier in [2800, 3050]
let lo = 2800, hi = 3050, best = null;
while (hi - lo > 20) {
  const mid = Math.round((lo + hi) / 2 / 10) * 10;
  const p = await score('o', mid);
  if (p.err) { console.log(mid, 'ERR', p.err); break; }
  const pass = p.maxGeh < 2;
  console.log(`o @ ${mid} → ${fmt(p)} → ${pass ? 'PASS (all links < GEH 2)' : 'fail'}`);
  if (pass) { hi = mid; best = p; } else lo = mid;
}
if (best) console.log('FRONTIER (plain):', fmt(best));
await browser.close();
console.log('DONE');
