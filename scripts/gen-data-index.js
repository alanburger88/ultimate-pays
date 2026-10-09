/**
 * Generates the data registry module (src/data/index.js) from src/data/manifest.js.
 * The same generator produces filtered registries for employee packages, so
 * one recipient's package never contains another recipient's record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function loadManifest(root) {
  const mod = await import(path.join(root, 'src/data/manifest.js'));
  return mod.manifest;
}

export function generateIndex(manifest, filter = null) {
  const lines = [];
  lines.push('// GENERATED from manifest.js by scripts/gen-data-index.js — do not edit by hand.');
  const profiles = filter ? manifest.profiles.filter((p) => p.id === filter.profileId) : manifest.profiles;
  if (filter && profiles.length === 0) throw new Error(`Unknown profile ${filter.profileId}`);
  // Employee packages carry the recipient's approved languages plus the reference pack (en-CA), which is the final fallback for any missing key.
  const langs = filter ? Object.fromEntries(Object.entries(manifest.languages).filter(([tag]) => tag === 'en-CA' || profiles.some((p) => Object.keys(p.contents).includes(tag)))) : manifest.languages;

  const profileVars = [];
  const contentVars = [];
  const recordVars = [];
  profiles.forEach((p, i) => {
    lines.push(`import { profile as p${i} } from ${JSON.stringify(p.file)};`);
    profileVars.push([p.id, `p${i}`]);
    Object.entries(p.contents).forEach(([tag, file], j) => {
      lines.push(`import { content as c${i}_${j} } from ${JSON.stringify(file)};`);
      contentVars.push([p.id, tag, `c${i}_${j}`]);
    });
    const records = filter && filter.scenarioId ? p.records.filter((r) => r.id === filter.scenarioId) : p.records;
    if (filter && records.length === 0) throw new Error(`Unknown scenario ${filter.scenarioId} for ${p.id}`);
    records.forEach((r, j) => {
      lines.push(`import { record as r${i}_${j} } from ${JSON.stringify(r.file)};`);
      recordVars.push([p.id, `r${i}_${j}`]);
    });
  });
  Object.entries(langs).forEach(([tag, file], i) => {
    lines.push(`import { pack as l${i} } from ${JSON.stringify(file)};`);
  });
  lines.push('');
  lines.push(`export const defaultProfileId = ${JSON.stringify(filter ? filter.profileId : manifest.defaultProfileId)};`);
  lines.push(`export const packageKind = ${JSON.stringify(filter ? 'employee' : 'presenter')};`);
  lines.push(`export const profiles = { ${profileVars.map(([id, v]) => `${JSON.stringify(id)}: ${v}`).join(', ')} };`);
  const byProfile = {};
  for (const [id, tag, v] of contentVars) (byProfile[id] ||= []).push(`${JSON.stringify(tag)}: ${v}`);
  lines.push(`export const contents = { ${Object.entries(byProfile).map(([id, arr]) => `${JSON.stringify(id)}: { ${arr.join(', ')} }`).join(', ')} };`);
  const recByProfile = {};
  for (const [id, v] of recordVars) (recByProfile[id] ||= []).push(v);
  lines.push(`export const records = { ${Object.entries(recByProfile).map(([id, arr]) => `${JSON.stringify(id)}: [${arr.join(', ')}]`).join(', ')} };`);
  lines.push(`export const languages = { ${Object.keys(langs).map((tag, i) => `${JSON.stringify(tag)}: l${i}`).join(', ')} };`);
  lines.push('');
  lines.push('export function scenariosFor(profileId) {');
  lines.push('  return (records[profileId] || []).map((r) => ({ id: r.scenario.id, personaName: r.employee.displayName, summary: r.scenario.summary, tags: r.scenario.tags || [] }));');
  lines.push('}');
  lines.push('export function findRecord(profileId, scenarioId) {');
  lines.push('  const list = records[profileId] || [];');
  lines.push('  if (!scenarioId) return list[0] || null;');
  lines.push('  return list.find((r) => r.scenario.id === scenarioId) || null;');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

export async function writeIndex(root) {
  const manifest = await loadManifest(root);
  const text = generateIndex(manifest);
  const file = path.join(root, 'src/data/index.js');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing !== text) fs.writeFileSync(file, text);
  return { file, changed: existing !== text };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const manifest = await loadManifest(root);
  const text = generateIndex(manifest);
  const file = path.join(root, 'src/data/index.js');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (check) {
    if (existing !== text) { console.error('src/data/index.js is out of date. Run: node scripts/gen-data-index.js'); process.exit(1); }
    console.log('data index is up to date.');
  } else {
    fs.writeFileSync(file, text);
    console.log(`wrote ${path.relative(root, file)}`);
  }
}
