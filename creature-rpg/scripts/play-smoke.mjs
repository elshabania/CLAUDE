// Scripted play-through smoke test of the opening (title → new game → intro → starter → rival battle).
// Runs in headless Chromium with software GL: screenshots verify flow, NOT performance.
// usage: node scripts/play-smoke.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [,, base = 'http://localhost:5173/', out = 'qa/smoke'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const mode = () => page.evaluate(() => window.__game?.getState().mode);
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2500);
await shot('01_title');
await page.getByText('New game').click();
await wait(1200);
await shot('02_newgame');
await page.getByText('Begin in Larkhollow').click();
await wait(6000);
check('entered explore/dialogue after new game', ['dialogue', 'explore'].includes(await mode()), await mode());
await shot('03_intro');
for (let i = 0; i < 12 && (await mode()) === 'dialogue'; i++) { await page.keyboard.press('Enter'); await wait(350); }
check('intro dialogue closes', (await mode()) === 'explore', await mode());
await shot('04_town');
// walk forward for a second
await page.keyboard.down('w'); await wait(1500); await page.keyboard.up('w');
const moved = await page.evaluate(() => window.__qa.runtime.metersWalked);
check('player walks', moved > 1, `metersWalked=${moved?.toFixed?.(2)}`);
await shot('05_walked');
// talk to Oriel (teleport next to her)
await page.evaluate(() => {
  const g = window.__game.getState();
  g.talk('town_1_oriel', { speaker: 'Oriel' });
});
await wait(500);
for (let i = 0; i < 12 && (await mode()) === 'dialogue'; i++) { await page.keyboard.press('Enter'); await wait(350); }
check('starter screen opens', (await mode()) === 'starter', await mode());
await wait(2500);
await shot('06_starter');
await page.keyboard.press('Enter'); await wait(600); await page.keyboard.press('Enter'); await wait(1500);
const party = await page.evaluate(() => window.__game.getState().save.party.length);
check('starter joined party', party === 1, `party=${party}`);
for (let i = 0; i < 12 && (await mode()) === 'dialogue'; i++) { await page.keyboard.press('Enter'); await wait(350); }
await shot('07_after_starter');
// rival battle
await page.evaluate(() => window.__game.getState().runActions([{ battle: 't_rival_1' }]));
await wait(4000);
check('battle started', (await mode()) === 'battle', await mode());
await shot('08_battle_intro');
for (let turn = 0; turn < 150 && (await mode()) === "battle"; turn++) {
  const phase = await page.evaluate(() => window.__battle?.getState().phase);
  if (phase === 'command' || phase === 'moves' || phase === 'replace') { await page.keyboard.press('Enter'); await wait(300); }
  else await wait(800);
  if (turn === 3) await shot('09_battle_mid');
}
await wait(2500);
check('battle ended', (await mode()) !== 'battle', await mode());
await shot('10_after_battle');
const flags = await page.evaluate(() => Object.keys(window.__game.getState().save.flags));
check('rival flag set', flags.includes('flag_rival_1_done'), flags.join(','));
// menu
await page.evaluate(() => { for (let i = 0; i < 6; i++) if (window.__game.getState().mode === 'dialogue') window.__game.getState().advance(); });
await page.keyboard.press('Tab'); await wait(1500);
check('menu opens', (await mode()) === 'menu', await mode());
await shot('11_menu');
await page.keyboard.press('Tab'); await wait(500);
// reload → continue
await page.reload(); await wait(2500);
const hasContinue = await page.getByText('Continue').count();
check('continue offered after reload', hasContinue > 0);
if (hasContinue) { await page.getByText('Continue').click(); await wait(5000); check('continue loads game', (await mode()) === 'explore', await mode()); await shot('12_continued'); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, logs: logs.slice(0, 60) }, null, 1));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
