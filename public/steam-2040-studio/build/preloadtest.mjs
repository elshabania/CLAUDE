/* Verify the preloaded-comparison UI: baked data present, copilot action
   renders the table + chart, and one apply ▸ path runs end-to-end. */
import { chromium } from '/home/user/CLAUDE/node_modules/playwright-core/index.mjs';

const FILE = 'file:///home/user/CLAUDE/public/steam-2040-studio/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APPLY = process.env.APPLY === '1';

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

await page.goto(FILE, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('ctxdot')?.classList.contains('live'), undefined, { timeout: 60000 });
console.log('bridge ready');

// baked data present?
const meta = await page.evaluate(() => {
  // PRELOAD_AGG is inside the IIFE; probe through the rendered action instead
  return { quick: [...document.querySelectorAll('#quick .sg')].map(b => b.textContent) };
});
console.log('quick chips:', meta.quick.join(' | '));
if (!meta.quick.includes('Preloaded comparison')) console.log('✗ quick chip missing');

// fire the action
await page.fill('#q', 'preloaded comparison');
await page.click('#send');
await page.waitForFunction(() => !document.getElementById('send').disabled, undefined, { timeout: 60000 });
await page.waitForTimeout(400);
const res = await page.evaluate(() => {
  const bub = [...document.querySelectorAll('.msg.cop .bub')].pop();
  return {
    text: bub.innerText.slice(0, 400),
    rows: bub.querySelectorAll('.scnrow').length,
    applies: bub.querySelectorAll('[data-preapply]').length,
    svg: bub.querySelectorAll('svg').length,
    groups: [...bub.querySelectorAll('.did')].map(d => d.innerText.slice(0, 40)).filter(t => /target|App methods/.test(t)),
  };
});
console.log('rows:', res.rows, '· apply buttons:', res.applies, '· charts:', res.svg);
console.log('groups:', res.groups.join(' | '));
console.log('text head:', res.text.replace(/\n/g, ' ').slice(0, 260));

if (APPLY && res.applies) {
  console.log('\nclicking first apply ▸ (best in first group)…');
  await page.evaluate(() => {
    const bub = [...document.querySelectorAll('.msg.cop .bub')].pop();
    bub.querySelector('[data-preapply]').click();
  });
  // wait for the "Applied" bubble (two all-zones runs — allow plenty)
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.msg.cop .bub')].pop();
    return /Applied .*zones\. Assignment .* s vs/.test(b.innerText) || /Couldn't rebuild/.test(b.innerText);
  }, undefined, { timeout: 900000 });
  const fin = await page.evaluate(() => [...document.querySelectorAll('.msg.cop .bub')].pop().innerText.slice(0, 400));
  console.log('apply result:', fin.replace(/\n/g, ' '));
}

console.log('\nERRORS (' + errors.length + '):'); errors.slice(0, 8).forEach(e => console.log(' ', e.slice(0, 160)));
await browser.close();
console.log('DONE');
