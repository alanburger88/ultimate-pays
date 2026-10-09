#!/usr/bin/env node
/**
 * Prepare pay-story narration audio with ElevenLabs.
 *
 *   node scripts/narrate.js [--only=CA-ON] [--lang=fr-CA] [--dry-run] [--prune]
 *
 * 1. Builds a presenter bundle and opens every scenario × approved language in headless Chromium,
 *    reading the story's exact spoken text from the running app (so audio always matches captions).
 * 2. Sends each chapter's text to the ElevenLabs text-to-speech API with the voice from
 *    narration/voices.json, caching each clip as narration/audio/<hash>.mp3 (same text + voice = same file).
 * 3. Writes narration/manifest.json, which the single-file builder embeds for the records in each build.
 *
 * The API key is never written anywhere: requests go to api.elevenlabs.io with the key supplied by the
 * environment (ELEVENLABS_API_KEY, or a proxy that injects it). Built HTML files contain audio only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSingle } from './build-single.js';
import { loadManifest } from './gen-data-index.js';
import { spawnSync } from 'node:child_process';

// Behind an HTTPS proxy, Node's fetch needs NODE_USE_ENV_PROXY set at start-up: relaunch once with it.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status === null ? 1 : r.status);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const config = JSON.parse(fs.readFileSync(path.join(root, 'narration/voices.json'), 'utf8'));
const audioDir = path.join(root, 'narration/audio');
const manifestFile = path.join(root, 'narration/manifest.json');
fs.mkdirSync(audioDir, { recursive: true });

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return await import('/opt/node-tools/node_modules/playwright/index.mjs'); }
}

const keyFor = (voice, text) => crypto.createHash('sha256').update([config.model, config.outputFormat, voice.voiceId, voice.languageCode || '', text].join('\u0000')).digest('hex').slice(0, 20);

function durationOf(file) {
  try { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()); } catch (e) {
    const kbps = Number((/_(\d+)$/.exec(config.outputFormat) || [])[1] || 32);
    return fs.statSync(file).size * 8 / (kbps * 1000);
  }
}

async function synthesize(voice, text, { previous, next }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=${config.outputFormat}`;
  const headers = { 'Content-Type': 'application/json', Accept: 'audio/mpeg' };
  if (process.env.ELEVENLABS_API_KEY) headers['xi-api-key'] = process.env.ELEVENLABS_API_KEY;
  const body = { text, model_id: config.model, ...(voice.languageCode ? { language_code: voice.languageCode } : {}), ...(previous ? { previous_text: previous } : {}), ...(next ? { next_text: next } : {}) };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text();
    if (res.status === 400 && (body.previous_text || body.next_text) && /previous_text|next_text/.test(detail)) { delete body.previous_text; delete body.next_text; continue; }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  throw new Error('ElevenLabs: too many retries');
}

const manifest = await loadManifest(root);
const tmp = path.join(root, 'dist', '.narration-source.html');
await buildSingle({ root, launch: {}, employee: false, out: tmp, narration: false });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { entries: [] };
const entries = [];
let chars = 0; let generated = 0; let reused = 0;
for (const p of manifest.profiles) {
  if (args.only && args.only !== p.id) { entries.push(...previous.entries.filter((e) => e.profileId === p.id)); continue; }
  for (const r of p.records) {
    const entry = { profileId: p.id, scenarioId: r.id, ref: null, locales: {} };
    const before = previous.entries.find((e) => e.profileId === p.id && e.scenarioId === r.id);
    for (const locale of Object.keys(p.contents)) {
      const voice = config.voices[locale];
      if (args.lang && args.lang !== locale) { if (before && before.locales[locale]) entry.locales[locale] = before.locales[locale]; continue; }
      if (!voice || voice.enabled === false) continue;
      await page.goto('about:blank');
      await page.goto(`file://${tmp}#region=${p.id}&scenario=${r.id}&lang=${locale}&preset=complete`);
      await page.waitForFunction(() => window.__paylight && document.querySelector('.pl-masthead'), null, { timeout: 20000 });
      const info = await page.evaluate(() => ({ ref: window.__paylight.ref, locale: window.__paylight.locale, script: window.__paylight.narrationScript() }));
      if (info.locale !== locale) throw new Error(`${p.id}/${r.id}: asked for ${locale}, app opened ${info.locale}`);
      entry.ref = info.ref;
      const chapters = [];
      for (let i = 0; i < info.script.length; i++) {
        const { id, text } = info.script[i];
        const key = keyFor(voice, text);
        const file = path.join(audioDir, `${key}.mp3`);
        if (!fs.existsSync(file)) {
          chars += text.length;
          if (args['dry-run']) { console.log(`would synthesize ${p.id}/${r.id}/${locale}/${id} (${text.length} chars)`); continue; }
          const audio = await synthesize(voice, text, { previous: info.script[i - 1] && info.script[i - 1].text, next: info.script[i + 1] && info.script[i + 1].text });
          fs.writeFileSync(file, audio);
          generated++;
        } else reused++;
        chapters.push({ id, key, duration: Math.round(durationOf(file) * 100) / 100, text });
      }
      entry.locales[locale] = { voice: voice.name, voiceId: voice.voiceId, model: config.model, chapters };
      console.log(`${p.id}/${r.id} ${locale}: ${chapters.length} chapters, ${voice.name}`);
    }
    entries.push(entry);
  }
}
await browser.close();
fs.rmSync(tmp, { force: true });

const out = { generatedAt: new Date().toISOString(), model: config.model, outputFormat: config.outputFormat, entries };
if (!args['dry-run']) fs.writeFileSync(manifestFile, `${JSON.stringify(out, null, 2)}\n`);
if (args.prune && !args['dry-run']) {
  const used = new Set(entries.flatMap((e) => Object.values(e.locales).flatMap((l) => l.chapters.map((c) => `${c.key}.mp3`))));
  for (const f of fs.readdirSync(audioDir)) if (f.endsWith('.mp3') && !used.has(f)) fs.rmSync(path.join(audioDir, f));
}
console.log(`narration: ${generated} clips generated, ${reused} reused, ${chars} characters sent${args['dry-run'] ? ' (dry run)' : ''}.`);
