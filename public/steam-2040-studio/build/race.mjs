/* Race GEHX stage-2 variants with the exact scoring protocol (BPR, 800-origin
   pre-sample, whole network, demand-matched baseline). Fast enough to iterate;
   the winner gets a final Frank-Wolfe verification pass. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';

const FILE = process.env.APPFILE || 'file:///tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/mine/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VARIANTS = (process.env.VARIANTS || 'o,w,wd,hop,cap').split(',');
const TARGETS = (process.env.TARGETS || '2800,2050').split(',').map(Number);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(FILE, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 60000 });

await page.evaluate(async () => {
  const S = window.__STEAM;
  S.switchApp('assign'); await S.waitReady('assign');
  await S.rpc('assign', { cmd: 'setarea', rect: null });
  await S.pollState('assign', s => s.odStats && /matrix|trips|pairs/i.test(s.odStats), 20000);
  // one quick pass so GRAPH + baseVol exist (slack terms), then scoring setup
  await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: 'aon' });
  await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '500' });
  await S.runAggAssign();
  await S.rpc('assign', { cmd: 'set', id: 'methodSel', value: 'bpr' });
  await S.rpc('assign', { cmd: 'set', id: 'sampleSel', value: '0' });
});
console.log('ready (bpr scoring, graph warm)');

for (const t of TARGETS) for (const v of VARIANTS) {
  const t0 = Date.now();
  process.stdout.write(`gehx[${v}] @ ${t} … `);
  try {
    const r = await page.evaluate(async ({ v, t }) => {
      const S = window.__STEAM, rpc = S.rpc;
      const agg = await rpc('assign', { cmd: 'gehagg', target: t, variant: v, timeoutMs: 120000 });
      if (!agg || !agg.ok) return { err: 'gehagg: ' + (agg && agg.err) };
      const odr = await rpc('assign', { cmd: 'aggod', pairs: agg.pairs, sampleN: 800 });
      if (!odr || !odr.ok) return { err: 'aggod failed' };
      await rpc('assign', { cmd: 'odbase', which: 'filt' });
      await S.runAggAssign();
      await rpc('assign', { cmd: 'snapfull' });
      await rpc('assign', { cmd: 'odbase', which: 'agg' });
      await S.runAggAssign();
      const cmp = await rpc('assign', { cmd: 'cmpfull' });
      if (!cmp || !cmp.ok) return { err: 'cmpfull failed' };
      return { zones: agg.zones, soft: agg.soft, maxW: agg.maxW, moved: agg.moved,
               geh5: cmp.geh5, pctW1: cmp.pctW1, vhtErr: cmp.vhtErr, corr: cmp.corr };
    }, { v, t });
    if (r.err) { console.log('SKIP —', r.err); continue; }
    console.log(`zones=${r.zones} GEH<5=${r.geh5.toFixed(2)}% W1=${r.pctW1.toFixed(2)}% VHT=${r.vhtErr.toFixed(2)}% maxW=${r.maxW} moved=${r.moved}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  } catch (e) { console.log('ERROR —', String(e).slice(0, 160)); }
}
await browser.close();
console.log('DONE');
