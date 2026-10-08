/**
 * Playwright helpers for Paylight checks. Uses the globally installed playwright when
 * node_modules is absent (NODE_PATH or /opt/node-tools in the cloud environment).
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}

export const root = path.resolve(new URL('.', import.meta.url).pathname, '../..');

/** Build a single-file bundle to a private path so parallel runs never clash. */
export function build(outName = 'dev.html', flags = []) {
  const out = path.join(root, 'dist', outName);
  execFileSync(process.execPath, [path.join(root, 'bin/paylight.js'), 'build', `--out=${out}`, ...flags], { stdio: 'pipe' });
  return 'file://' + out;
}

export async function openPage({ url, width = 1200, height = 900, hash = '#region=CA-ON&lang=en-CA&preset=complete', reducedMotion = false, colorScheme = 'light' }) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference', colorScheme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/accessibilityserver|ERR_TUNNEL/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url + hash);
  await page.waitForSelector('#app[data-loading="false"]');
  return { browser, page, errors, close: () => browser.close() };
}

/** True when nothing on the page requires horizontal scrolling at the current viewport. */
export async function noHorizontalScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) return { ok: false, reason: `document ${doc.scrollWidth} > ${doc.clientWidth}` };
    const vw = doc.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && (el.classList.contains('pl-launcher'))) continue;
      if (r.right > vw + 1 && style.overflowX !== 'hidden' && !el.closest('[hidden]')) return { ok: false, reason: `${el.tagName}.${el.className} right=${Math.round(r.right)}` };
    }
    return { ok: true };
  });
}
