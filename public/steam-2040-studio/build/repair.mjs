/* GEHX-100 measure-and-repair: aggregate deep, measure exactly, un-merge the
   zones near any link at GEH ≥ 2, repeat until max GEH < 2 everywhere.
   Result: a certified 100%-below-GEH-2 zone system deeper than the naive
   frontier. Writes gehx100.json {target, pairs, zones, iters, score}. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const FILE = process.env.APPFILE || 'file:///tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/mine/index-g2.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const START = +(process.env.START || 2990);
const OUT = new URL('./gehx100.json', import.meta.url).pathname;

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
console.log('ready — start target', START);

// initial merge list + zone attachment coordinates
const init = await page.evaluate(async (START) => {
  const rpc = window.__STEAM.rpc;
  const agg = await rpc('assign', { cmd: 'gehagg', target: START, variant: 'o', timeoutMs: 180000 });
  const gd = await rpc('assign', { cmd: 'gehdata', timeoutMs: 30000 });
  return { pairs: agg.pairs, zones: agg.zones, ids: gd.ids, xs: gd.xs, ys: gd.ys };
}, START);
const XY = new Map(init.ids.map((id, i) => [id, [init.xs[i], init.ys[i]]]));
let pairs = init.pairs;
console.log(`initial: ${init.zones} zones, ${pairs.length} merges`);

let R = +(process.env.BLAMER || 3000), final = null;
for (let iter = 1; iter <= 8; iter++) {
  const r = await page.evaluate(async (pairs) => {
    const S = window.__STEAM, rpc = S.rpc;
    const odr = await rpc('assign', { cmd: 'aggod', pairs, sampleN: 800 });
    if (!odr || !odr.ok) return { err: 'aggod' };
    await rpc('assign', { cmd: 'odbase', which: 'filt' });
    await S.runAggAssign();
    await rpc('assign', { cmd: 'snapfull' });
    await rpc('assign', { cmd: 'odbase', which: 'agg' });
    await S.runAggAssign();
    const cmp = await rpc('assign', { cmd: 'cmpfull' });
    const bad = await rpc('assign', { cmd: 'gehbad', th: 2, timeoutMs: 30000 });
    return { pctG2: cmp.pctG2, geh5: cmp.geh5, maxGeh: cmp.maxGeh, pctW1: cmp.pctW1, vhtErr: cmp.vhtErr, bad: (bad && bad.links) || [] };
  }, pairs);
  if (r.err) { console.log('iter', iter, 'ERROR', r.err); break; }
  console.log(`iter ${iter}: maxGEH=${r.maxGeh.toFixed(2)} · GEH<2=${r.pctG2.toFixed(3)}% · bad links=${r.bad.length} · zones=${init.ids.length - pairs.length}`);
  if (r.maxGeh < 2) { final = { r, pairs: pairs.slice() }; break; }
  // un-merge every moved zone whose attachment node is within R of a bad link
  const before = pairs.length;
  pairs = pairs.filter(([mem]) => {
    const p = XY.get(mem); if (!p) return true;
    for (const b of r.bad) { const dx = p[0] - b[4], dy = p[1] - b[5]; if (dx * dx + dy * dy <= R * R) return false; }
    return true;
  });
  console.log(`   un-merged ${before - pairs.length} zones near ${r.bad.length} bad links (R=${R} m)`);
  if (pairs.length === before) { R *= 2; console.log('   nobody in radius — widening to', R); }
}
if (final) {
  const zones = init.ids.length - final.pairs.length;
  fs.writeFileSync(OUT, JSON.stringify({ start: START, zones, merges: final.pairs.length,
    score: { pctG2: final.r.pctG2, geh5: final.r.geh5, maxGeh: final.r.maxGeh, pctW1: final.r.pctW1, vhtErr: final.r.vhtErr },
    pairs: final.pairs }));
  console.log(`CERTIFIED: ${zones} zones · max GEH ${final.r.maxGeh.toFixed(2)} · all links < 2 → ${OUT}`);
} else console.log('did not converge within 8 iterations');
await browser.close();
console.log('DONE');
