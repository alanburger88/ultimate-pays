#!/usr/bin/env node
/**
 * Paylight command-line wrapper.
 *
 *   paylight present --region=CA-QC --lang=fr-CA --preset=complete --studio
 *   paylight build   --region=EU-DE --lang=de-DE [--employee] [--out=dist/paylight.html]
 *   paylight build   --all
 *
 * The wrapper parses and validates its flags against the bundled profile
 * registry, then passes them to the application as launch configuration:
 *   - `present` starts a local static server and prints a URL whose fragment
 *     carries the launch configuration (#region=…&lang=…&preset=…).
 *   - `build` embeds the launch configuration into the single-file HTML.
 *
 * Precedence inside the app: issued-record constraints > launch configuration
 * (fragment or embedded) > saved presentation preferences > bundled defaults.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs, validateLaunch, formatValidation } from '../scripts/launch-config.js';
import { startServer } from '../scripts/serve.js';
import { buildSingle, buildAll } from '../scripts/build-single.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);

function usage(code = 0) {
  const out = code ? console.error : console.log;
  out(`Paylight — Your pay, clearly.

Usage:
  paylight present [--region=ID] [--lang=TAG] [--preset=NAME] [--scenario=ID] [--studio] [--port=N] [--host=H]
  paylight build   [--region=ID] [--lang=TAG] [--preset=NAME] [--scenario=ID] [--employee] [--out=FILE]
  paylight build   --all
  paylight list

Flags:
  --region    Profile identifier: CA-ON, CA-QC, ZA, EU-FR, EU-DE, EU-IT
  --lang      Interface language supported by that profile (e.g. fr-CA, zu-ZA, de-DE)
  --preset    core | complete | hourly | total-reward
  --scenario  Scenario (record) identifier within the profile; defaults to the profile's first scenario
  --studio    Open Presenter Studio on launch (present only)
  --employee  Build an employee package: one recipient, no Studio, no other recipients' data
  --out       Output file for build (default dist/paylight.html or dist/paylight-<region>-<scenario>.html)
  --endpoints JSON file with HTTPS endpoints for connected services (assistant, queries, identity,
              verification, wallet.apple|google|samsung); embedded in the build, never read from a link
  --all       Build the presenter bundle plus one employee package per scenario

Fragment equivalent (any build or dev server):
  paylight.html#region=ZA&lang=xh-ZA&preset=complete&studio=1
`);
  process.exit(code);
}

async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') usage(0);
  const flags = parseArgs(rest);
  if (flags.help) usage(0);

  if (command === 'list') {
    const { listProfiles } = await import('../scripts/launch-config.js');
    for (const line of await listProfiles()) console.log(line);
    return;
  }

  if (command === 'present') {
    const result = await validateLaunch(flags);
    if (!result.ok) {
      console.error(formatValidation(result));
      process.exit(2);
    }
    if (result.warnings.length) console.warn(formatValidation(result));
    const port = Number(flags.port || process.env.PORT || 4173);
    const host = flags.host || '127.0.0.1';
    const server = await startServer({ root, port, host });
    const fragment = new URLSearchParams();
    for (const key of ['region', 'lang', 'preset', 'scenario']) if (result.launch[key]) fragment.set(key, result.launch[key]);
    if (result.launch.studio) fragment.set('studio', '1');
    const url = `http://${host}:${server.port}/src/index.html#${fragment.toString()}`;
    console.log(`\nPaylight presenter server running.\n  ${url}\n\nRecords are constructed for presentation and are not employer-issued.\nPress Ctrl+C to stop.`);
    if (flags.open) {
      const { spawn } = await import('node:child_process');
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
    }
    return;
  }

  if (command === 'build') {
    if (flags.all) {
      const outputs = await buildAll({ root });
      for (const o of outputs) console.log(`built ${path.relative(root, o.file)} (${(o.bytes / 1024).toFixed(0)} KiB)`);
      return;
    }
    const result = await validateLaunch(flags, { allowEmpty: true });
    if (!result.ok) {
      console.error(formatValidation(result));
      process.exit(2);
    }
    if (result.warnings.length) console.warn(formatValidation(result));
    const out = await buildSingle({ root, launch: result.launch, employee: Boolean(flags.employee), out: flags.out });
    console.log(`built ${path.relative(root, out.file)} (${(out.bytes / 1024).toFixed(0)} KiB)`);
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  usage(2);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
