/**
 * Moves English strings registered by UI modules (registerStrings({...})) into the
 * reference pack src/data/lang/en-CA.js so translators work from one file.
 * Keys already in the pack win. Run after the UI modules are complete:
 *   node scripts/consolidate-strings.js [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

// Evaluate registerStrings({...}) object literals safely: extract the literal text and parse it with a tolerant evaluator.
function extractRegistered(source, file) {
  const out = {};
  const re = /registerStrings\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?/g;
  let m;
  while ((m = re.exec(source))) {
    let literal = m[1];
    // Balance braces: the lazy match may stop at the first '}' inside a nested object — extend until balanced.
    let depth = 0; let end = -1;
    const start = m.index + m[0].indexOf('{');
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      else if (ch === '\'' || ch === '"' || ch === '`') { const q = ch; i++; while (i < source.length && source[i] !== q) { if (source[i] === '\\') i++; i++; } }
    }
    literal = source.slice(start, end + 1);
    let obj;
    try { obj = new Function(`"use strict"; return (${literal});`)(); } catch (err) { throw new Error(`${file}: could not parse registerStrings literal: ${err.message}`); }
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') out[k] = v;
    re.lastIndex = end + 1;
  }
  return out;
}

const packFile = path.join(root, 'src/data/lang/en-CA.js');
const pack = (await import(packFile)).pack;
const registered = {};
const byFile = {};
for (const file of walk(path.join(root, 'src/ui')).concat(walk(path.join(root, 'src/export')))) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('registerStrings(')) continue;
  const found = extractRegistered(src, file);
  byFile[path.relative(root, file)] = Object.keys(found);
  for (const [k, v] of Object.entries(found)) {
    if (pack[k] !== undefined) continue;
    if (registered[k] !== undefined && registered[k] !== v) console.warn(`conflict for ${k}: keeping first definition`);
    if (registered[k] === undefined) registered[k] = v;
  }
}
const keys = Object.keys(registered);
console.log(`${keys.length} module-registered key(s) not yet in en-CA.js`);
for (const [f, ks] of Object.entries(byFile)) console.log(`  ${f}: ${ks.length}`);
if (check) process.exit(keys.length ? 1 : 0);
if (!keys.length) process.exit(0);
let text = fs.readFileSync(packFile, 'utf8');
const block = ['', '  // --- Consolidated from UI modules (registerStrings) ---------------------------', ...keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(registered[k])},`)].join('\n');
const idx = text.lastIndexOf('};');
text = `${text.slice(0, idx)}${block}\n${text.slice(idx)}`;
fs.writeFileSync(packFile, text);
console.log(`appended ${keys.length} key(s) to src/data/lang/en-CA.js`);
