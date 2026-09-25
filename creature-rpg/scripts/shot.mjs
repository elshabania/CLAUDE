// Screenshot helper for visual verification in headless Chromium (software GL; NOT representative for performance).
// usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [clickSelector]
import { chromium } from '@playwright/test';
const [,, url, out, w = '900', h = '700', wait = '2500', click] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(url);
if (click) { await page.waitForTimeout(800); await page.click(click); }
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
