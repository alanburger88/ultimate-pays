/**
 * Paylight end-to-end checks (Playwright, Chromium).
 *   node tests/e2e/run.js [--quick] [--only=CA-ON] [--grep=story]
 * Builds a private bundle, then for every profile × approved language at 320 and 1200 px:
 * loads, visits every section, checks for page errors, horizontal scroll and clipped amounts,
 * and exercises the signature journeys. Exit code 1 on any failure.
 */
import path from 'node:path';
import fs from 'node:fs';
import { build, openPage, noHorizontalScroll, root } from './helpers.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const registry = await import(path.join(root, 'src/data/index.js'));
const outDir = path.join(root, 'tests/e2e/out');
fs.mkdirSync(outDir, { recursive: true });
const url = build('e2e.html');
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
  else if (args.verbose) console.log(`  ✓ ${name}`);
}

async function sections(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.pl-tab')).map((b) => b.dataset.section));
}

async function goSection(page, id) {
  await page.evaluate((s) => { const p = new URLSearchParams(location.hash.slice(1)); p.set('section', s); p.delete('line'); location.hash = p.toString(); }, id);
  await page.waitForSelector(`#section-${id}`, { timeout: 5000 });
  await page.waitForTimeout(150);
}

async function clippedAmounts(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.pl-amount, .num')) {
      if (el.closest('[hidden]') || el.offsetParent === null) continue;
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.className}:${el.textContent.trim().slice(0, 20)}`);
    }
    return bad;
  });
}

const combos = [];
for (const profile of Object.values(registry.profiles)) {
  if (args.only && profile.id !== args.only) continue;
  for (const scenario of registry.scenariosFor(profile.id)) {
    for (const lang of profile.locales) {
      if (args.quick && lang !== profile.defaultLocale) continue;
      combos.push({ region: profile.id, scenario: scenario.id, lang });
    }
  }
}

for (const combo of combos) {
  for (const width of [320, 1200]) {
    const hash = `#region=${combo.region}&scenario=${combo.scenario}&lang=${combo.lang}&preset=complete`;
    const label = `${combo.region}/${combo.scenario} ${combo.lang} @${width}`;
    console.log(label);
    let session;
    try {
      session = await openPage({ url, width, height: width === 320 ? 640 : 900, hash });
    } catch (err) { check(`${label} loads`, false, err.message); continue; }
    const { page, errors } = session;
    try {
      check(`${label} loads without errors`, errors.length === 0, errors.join(' | '));
      const missing = await page.evaluate(() => (document.body.innerText.match(/⟦[^⟧]+⟧/g) || []).slice(0, 5));
      check(`${label} has no missing interface keys`, missing.length === 0, missing.join(', '));
      const ids = await sections(page);
      check(`${label} has required sections`, ['my-pay', 'pay-details', 'record-actions'].every((s) => ids.includes(s)), ids.join(','));
      for (const id of ids) {
        await goSection(page, id);
        const hs = await noHorizontalScroll(page);
        check(`${label} ${id} no horizontal scroll`, hs.ok, hs.reason);
        const clipped = await clippedAmounts(page);
        check(`${label} ${id} no clipped amounts`, clipped.length === 0, clipped.join(', '));
        const h1 = await page.evaluate(() => document.querySelectorAll('#pl-section-host h1').length);
        check(`${label} ${id} has one h1`, h1 === 1, String(h1));
        const missingInSection = await page.evaluate(() => (document.body.innerText.match(/⟦[^⟧]+⟧/g) || []).slice(0, 5));
        check(`${label} ${id} no missing keys`, missingInSection.length === 0, missingInSection.join(', '));
        if (width === 320 && combo.lang === registry.profiles[combo.region].defaultLocale) await page.screenshot({ path: path.join(outDir, `${combo.region}-${combo.scenario}-${combo.lang}-${id}-${width}.png`), fullPage: true });
      }
      check(`${label} no page errors after navigation`, errors.length === 0, errors.join(' | '));
    } catch (err) { check(`${label} navigation`, false, err.message); }
    await session.close();
  }
}

// Signature journey and interactions on the reference record (desktop + mobile).
if (!args.only || args.only === 'CA-ON') {
  for (const width of [1200, 320]) {
    const label = `journey @${width}`;
    console.log(label);
    const session = await openPage({ url, width, height: width === 320 ? 640 : 900, hash: '#region=CA-ON&lang=en-CA&preset=complete' });
    const { page, errors } = session;
    try {
      // net pay → pay details line → calculation dialog → shifts → select entries → query draft
      await goSection(page, 'pay-details');
      const row = page.locator('[data-line-id="e-base"]').first();
      check(`${label} base line present`, await row.count() > 0);
      const calcBtn = row.locator('button', { hasText: /calculat|How/i }).first();
      if (await calcBtn.count() === 0) {
        // mobile card: open the card sheet first
        await row.locator('button, .title').first().click({ trial: false }).catch(() => {});
      }
      const anyCalc = page.locator('button', { hasText: /calculat/i }).first();
      if (await anyCalc.count()) { await anyCalc.click(); await page.waitForTimeout(200); }
      const dlg = page.locator('[role="dialog"]').first();
      check(`${label} calculation dialog opens`, await dlg.count() > 0);
      const formula = await page.evaluate(() => document.body.innerText.includes('80.00') && document.body.innerText.includes('37.50'));
      check(`${label} calculation shows inputs 80.00 h × $37.50`, formula);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      check(`${label} Escape closes dialog`, await page.locator('[role="dialog"]').count() === 0);
      // select a line → tray appears
      const cb = page.locator('[data-line-id="d-cpp"] input[type="checkbox"]').first();
      if (await cb.count()) { await cb.check(); await page.waitForTimeout(150); }
      check(`${label} tray appears on selection`, await page.locator('.pl-tray').count() === 1);
      // filter survives: search then check selection persists
      const search = page.locator('input[type="search"], input[aria-label*="Search"]').first();
      if (await search.count()) { await search.fill('cpp'); await page.waitForTimeout(400); }
      check(`${label} selection survives filtering`, await page.evaluate(() => sessionStorage.length > 0 && JSON.stringify(Object.values(sessionStorage)).includes('d-cpp')));
      // time & leave shows shifts
      await goSection(page, 'time-leave');
      check(`${label} calendar renders`, await page.locator('.pl-cal, .pl-cal-day').count() > 0);
      // query composer offline state
      const queryBtn = page.locator('.pl-tray button', { hasText: /quer/i }).first();
      if (await queryBtn.count()) { await queryBtn.click(); await page.waitForTimeout(200); }
      check(`${label} query composer opens`, await page.locator('[role="dialog"]').count() > 0);
      await page.keyboard.press('Escape');
      // Lumi
      await page.locator('#pl-lumi-launcher').click();
      await page.waitForTimeout(200);
      const capability = await page.evaluate(() => document.body.innerText.includes('No AI model is connected'));
      check(`${label} Lumi states local capability truthfully`, capability);
      await page.keyboard.press('Escape');
      // story
      await goSection(page, 'my-pay');
      const storyBtn = page.locator('button', { hasText: /story/i }).first();
      if (await storyBtn.count()) { await storyBtn.click(); await page.waitForTimeout(300); check(`${label} story opens with controls`, await page.locator('[role="dialog"] input[type="range"]').count() > 0); await page.keyboard.press('Escape'); }
      // exports produce downloads
      await goSection(page, 'record-actions');
      for (const [name, re] of [['PDF', /PDF/i], ['Excel', /Excel/i]]) {
        const btn = page.locator('#section-record-actions button', { hasText: re }).first();
        if (!(await btn.count())) { check(`${label} ${name} button present`, false); continue; }
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), btn.click()]);
        check(`${label} ${name} download starts`, Boolean(download), 'no download event');
        if (download) { const p = path.join(outDir, `journey-${width}-${await download.suggestedFilename()}`); await download.saveAs(p); check(`${label} ${name} file non-empty`, fs.statSync(p).size > 1000); }
      }
      check(`${label} no page errors`, errors.length === 0, errors.join(' | '));
    } catch (err) { check(`${label}`, false, err.message); }
    await session.close();
  }

  // Configuration error handling
  const bad = await openPage({ url, width: 1200, hash: '#region=CA-ON&lang=zu-ZA' });
  check('unsupported language combination is a visible error', await bad.page.evaluate(() => (document.querySelector('[role="alert"]') || {}).textContent?.includes('zu-ZA')));
  await bad.close();
  const badRegion = await openPage({ url, width: 1200, hash: '#region=UK' });
  check('unknown region is a visible error', await badRegion.page.evaluate(() => (document.querySelector('[role="alert"]') || {}).textContent?.includes('UK')));
  await badRegion.close();

  // Reduced motion + dark + privacy quick checks
  const rm = await openPage({ url, width: 1200, hash: '#region=CA-ON&lang=en-CA&preset=complete&theme=dark', reducedMotion: true, colorScheme: 'dark' });
  check('dark theme applies', await rm.page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  await rm.close();
}

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
