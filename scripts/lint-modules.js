/** Checks every source module uses only the module syntax the bundler supports, and that imports resolve. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transformModule, moduleId } from './bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

let failures = 0;
for (const file of walk(srcRoot)) {
  const id = moduleId(root, file);
  const source = fs.readFileSync(file, 'utf8');
  try {
    transformModule(source, {
      id,
      resolve: (spec) => {
        if (!spec.startsWith('.')) throw new Error(`bare specifier "${spec}"`);
        const target = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(target)) throw new Error(`unresolved import "${spec}"`);
        return moduleId(root, target);
      },
    });
    if (/\bawait\b/.test(source.replace(/\basync\b[\s\S]*?\{/g, ''))) {
      // heuristic only; top-level await inside functions is fine
    }
  } catch (err) {
    failures++;
    console.error(`lint: ${id}: ${err.message}`);
  }
  // Full JavaScript syntax check: the import/export rewrite above does not parse function bodies.
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (err) { failures++; console.error(`lint: ${id}: syntax error\n${String(err.stderr).split('\n').slice(0, 5).join('\n')}`); }
}
if (failures) { console.error(`lint: ${failures} module problem(s).`); process.exit(1); }
console.log('lint: all modules use bundler-compatible syntax.');
