// Phase 1 scripted traversal: holds movement keys and samples position; checks we move, stay above terrain, and collide.
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:5173/?tool=zone&id=route_1';
const out = process.argv[3] ?? '/tmp/claude-0/move.png';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__qa && window.__qa.runtime.perf.fps > 0, null, { timeout: 30000 });
const pos = () => page.evaluate(() => { const r = window.__qa.runtime; return { x: +r.playerPos.x.toFixed(2), y: +r.playerPos.y.toFixed(2), z: +r.playerPos.z.toFixed(2), g: r.grid ? 1 : 0 }; });
const hAt = (x, z) => page.evaluate(([x, z]) => { const g = window.__qa.runtime.grid; const fx = ((x + g.width / 2) / g.width) * (g.nx - 1), fz = ((z + g.depth / 2) / g.depth) * (g.nz - 1); return g.heights[Math.round(fz) * g.nx + Math.round(fx)]; }, [x, z]);
const log = [];
const p0 = await pos(); log.push(['start', p0]);
await page.mouse.click(500, 300);
for (const [key, ms] of [['w', 3000], ['a', 1500], ['s', 1500], ['d', 1500]]) {
  await page.keyboard.down(key); if (key === 'w') await page.keyboard.down('Shift');
  await page.waitForTimeout(ms);
  await page.keyboard.up(key); await page.keyboard.up('Shift');
  const p = await pos(); const h = await hAt(p.x, p.z);
  log.push([key, p, 'terrainY', +h.toFixed(2), 'above', +(p.y - h).toFixed(2)]);
}
await page.screenshot({ path: out });
console.log(JSON.stringify(log));
console.log('errors', errs.length, errs.slice(0, 3));
await browser.close();
