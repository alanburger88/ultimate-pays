/**
 * Produces the portable single-file HTML build.
 *  - inlines every stylesheet and the bundled application script
 *  - embeds the launch configuration as JSON (never code)
 *  - for employee packages: a filtered data registry (one recipient) and no Studio
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from './bundle.js';
import { loadManifest, generateIndex } from './gen-data-index.js';

function inlineStyles(html, srcDir) {
  return html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
    const css = fs.readFileSync(path.join(srcDir, href), 'utf8');
    return `<style data-source="${href}">\n${css}\n</style>`;
  });
}

/**
 * Pay-story narration prepared by scripts/narrate.js: an index of clips per record and language, plus each
 * clip as inert base64 text (decoded only when the story plays). Only the records in this build are included.
 */
function narrationBlocks(root, { employee, launch }) {
  const file = path.join(root, 'narration/manifest.json');
  if (!fs.existsSync(file)) return '';
  const nm = JSON.parse(fs.readFileSync(file, 'utf8'));
  const index = {};
  const keys = new Set();
  for (const e of nm.entries || []) {
    if (!e.ref || (employee && (e.profileId !== launch.region || e.scenarioId !== launch.scenario))) continue;
    for (const [locale, l] of Object.entries(e.locales || {})) {
      const chapters = l.chapters.filter((c) => fs.existsSync(path.join(root, 'narration/audio', `${c.key}.mp3`)));
      if (!chapters.length) continue;
      (index[e.ref] = index[e.ref] || {})[locale] = { voice: l.voice, chapters: chapters.map((c) => ({ id: c.id, key: c.key, duration: c.duration, text: c.text })) };
      for (const c of chapters) keys.add(c.key);
    }
  }
  if (!keys.size) return '';
  const parts = [`<script type="application/json" id="pl-narration">${JSON.stringify(index).replace(/</g, '\\u003c')}</script>`];
  for (const k of keys) parts.push(`<script type="text/plain" id="pl-audio-${k}" data-type="audio/mpeg">${fs.readFileSync(path.join(root, 'narration/audio', `${k}.mp3`)).toString('base64')}</script>`);
  return parts.join('\n');
}

export async function buildSingle({ root, launch = {}, employee = false, out, narration = true }) {
  const srcDir = path.join(root, 'src');
  const manifest = await loadManifest(root);
  const filter = employee ? { profileId: launch.region, scenarioId: launch.scenario || null } : null;
  if (employee && !launch.region) throw new Error('An employee package needs --region.');
  if (employee && !launch.scenario) {
    const p = manifest.profiles.find((x) => x.id === launch.region);
    launch = { ...launch, scenario: p.records[0].id };
    filter.scenarioId = launch.scenario;
  }
  const dataIndex = generateIndex(manifest, filter);
  const replacements = employee ? { 'src/ui/studio.js': 'src/ui/studio.stub.js' } : {};
  // Employee packages carry no Studio: its code is replaced above and its interface strings are removed here.
  const virtual = { 'src/data/index.js': dataIndex };
  if (employee) {
    const STUDIO_KEYS = (k) => k.startsWith('studio.') || ['config.open_studio', 'app.studio_shortcut_hint', 'app.presenter'].includes(k);
    for (const [tag, file] of Object.entries(manifest.languages)) {
      const id = `src/data/${file.replace(/^\.\//, '')}`;
      const { pack } = await import(path.join(root, id));
      const kept = Object.fromEntries(Object.entries(pack).filter(([k]) => !STUDIO_KEYS(k)));
      virtual[id] = `export const pack = ${JSON.stringify(kept)};\n`;
    }
  }
  const { code, modules } = bundle({
    root,
    entry: path.join(srcDir, 'app/main.js'),
    replacements,
    virtual,
  });

  let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  html = inlineStyles(html, srcDir);
  const launchJson = JSON.stringify({ ...launch, package: employee ? 'employee' : 'presenter', builtAt: new Date().toISOString() });
  // Function replacements: a string replacement would expand $&, $1, $' patterns that occur inside the bundled code.
  html = html.replace(/<script id="paylight-launch" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="paylight-launch" type="application/json">${launchJson.replace(/</g, '\\u003c')}</script>`);
  html = html.replace(/<script type="module" src="app\/main.js"><\/script>/, () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
  html = html.replace('<html', '<html data-build="single"');
  if (narration) { const blocks = narrationBlocks(root, { employee, launch }); if (blocks) html = html.replace('</body>', () => `${blocks}\n</body>`); }

  const file = out
    ? path.resolve(root, out)
    : path.join(root, 'dist', employee ? `paylight-${launch.region}-${launch.scenario}.html` : 'paylight.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return { file, bytes: Buffer.byteLength(html), modules: modules.length };
}

export async function buildAll({ root, narration = true }) {
  const manifest = await loadManifest(root);
  const outputs = [];
  outputs.push(await buildSingle({ root, launch: {}, employee: false, narration }));
  for (const p of manifest.profiles) {
    for (const r of p.records) {
      outputs.push(await buildSingle({ root, launch: { region: p.id, scenario: r.id }, employee: true, narration }));
    }
  }
  return outputs;
}
