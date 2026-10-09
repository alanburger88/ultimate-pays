/**
 * Reports payload and render measurements for a built bundle on a mid-range mobile
 * profile (Moto G-class CPU throttling ×4, 320×640 viewport). Reports, never guarantees.
 *   node scripts/measure.js [dist/paylight.html] [#fragment]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.argv[2] || 'dist/paylight.html');
const hash = process.argv[3] || '#region=CA-ON&lang=en-CA&preset=complete';
const html = fs.readFileSync(file);
console.log(`bundle: ${path.relative(root, file)}`);
console.log(`  size: ${(html.length / 1024).toFixed(0)} KiB raw, ${(zlib.gzipSync(html).length / 1024).toFixed(0)} KiB gzip, ${(zlib.brotliCompressSync(html).length / 1024).toFixed(0)} KiB brotli`);

let pw;
try { pw = await import('playwright'); } catch (e) { pw = await import('/opt/node-tools/node_modules/playwright/index.mjs'); }
const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const t0 = Date.now();
await page.goto(`file://${file}${hash}`);
await page.waitForSelector('#app[data-loading="false"]');
const tReady = Date.now() - t0;
const metrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0), loadEvent: Math.round(nav.loadEventEnd || 0), paint, nodes: document.querySelectorAll('*').length, heapMB: performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
console.log(`  statement interactive (app ready) after ${tReady} ms wall-clock with CPU ×4 throttling`);
console.log(`  DOMContentLoaded ${metrics.domContentLoaded} ms · load ${metrics.loadEvent} ms · first-contentful-paint ${metrics.paint['first-contentful-paint'] ?? 'n/a'} ms · DOM nodes ${metrics.nodes}${metrics.heapMB ? ` · JS heap ${metrics.heapMB} MB` : ''}`);
const sections = await page.evaluate(() => Array.from(document.querySelectorAll('.pl-tab')).map((b) => b.dataset.section).filter((s) => s !== 'my-pay'));
for (const section of sections) {
  const t = Date.now();
  await page.evaluate((s) => { const p = new URLSearchParams(location.hash.slice(1)); p.set('section', s); location.hash = p.toString(); }, section);
  await page.waitForSelector(`#section-${section}`);
  console.log(`  section ${section}: ${Date.now() - t} ms`);
}
await browser.close();
