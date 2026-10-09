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

export async function buildSingle({ root, launch = {}, employee = false, out }) {
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
  const { code, modules } = bundle({
    root,
    entry: path.join(srcDir, 'app/main.js'),
    replacements,
    virtual: { 'src/data/index.js': dataIndex },
  });

  let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  html = inlineStyles(html, srcDir);
  const launchJson = JSON.stringify({ ...launch, package: employee ? 'employee' : 'presenter', builtAt: new Date().toISOString() });
  // Function replacements: a string replacement would expand $&, $1, $' patterns that occur inside the bundled code.
  html = html.replace(/<script id="paylight-launch" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="paylight-launch" type="application/json">${launchJson.replace(/</g, '\\u003c')}</script>`);
  html = html.replace(/<script type="module" src="app\/main.js"><\/script>/, () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
  html = html.replace('<html', '<html data-build="single"');

  const file = out
    ? path.resolve(root, out)
    : path.join(root, 'dist', employee ? `paylight-${launch.region}-${launch.scenario}.html` : 'paylight.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return { file, bytes: Buffer.byteLength(html), modules: modules.length };
}

export async function buildAll({ root }) {
  const manifest = await loadManifest(root);
  const outputs = [];
  outputs.push(await buildSingle({ root, launch: {}, employee: false }));
  for (const p of manifest.profiles) {
    for (const r of p.records) {
      outputs.push(await buildSingle({ root, launch: { region: p.id, scenario: r.id }, employee: true }));
    }
  }
  return outputs;
}
