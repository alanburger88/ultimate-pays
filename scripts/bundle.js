/**
 * Tiny ES-module concatenating bundler used for the single-file build.
 *
 * Source modules use standard ES module syntax in development (served as-is).
 * For the portable build, each module is wrapped in a function with a small
 * CommonJS-style registry so the whole application, its styles and its data
 * live in ONE html file with no network dependency.
 *
 * Supported module syntax (enforced by scripts/lint-modules.js):
 *   import { a, b as c } from './x.js';
 *   import * as ns from './x.js';
 *   import './x.js';
 *   export function f() {}        export async function f() {}
 *   export const x = …; export let x = …; export class X {}
 *   export { a, b as c };
 * Not supported on purpose: default exports, re-exports, dynamic import(),
 * import.meta, and top-level await.
 */
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_NAMED = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const IMPORT_NS = /^[ \t]*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const IMPORT_SIDE = /^[ \t]*import\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_FN = /^[ \t]*export\s+(async\s+function|function)\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const EXPORT_VAR = /^[ \t]*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_CLASS = /^[ \t]*export\s+class\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

export function moduleId(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function transformModule(source, { id, resolve }) {
  const hoisted = [];
  const trailing = [];
  let out = source;

  out = out.replace(IMPORT_NAMED, (m, names, spec) => {
    const target = resolve(spec);
    const bindings = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const parts = s.split(/\s+as\s+/);
      return parts.length === 2 ? `${parts[0]}: ${parts[1]}` : parts[0];
    });
    return `const { ${bindings.join(', ')} } = __req(${JSON.stringify(target)});`;
  });
  out = out.replace(IMPORT_NS, (m, name, spec) => `const ${name} = __req(${JSON.stringify(resolve(spec))});`);
  out = out.replace(IMPORT_SIDE, (m, spec) => `__req(${JSON.stringify(resolve(spec))});`);
  out = out.replace(EXPORT_FN, (m, kw, name) => { hoisted.push(name); return m.replace(/^([ \t]*)export\s+/, '$1'); });
  out = out.replace(EXPORT_VAR, (m, kw, name) => { trailing.push(name); return m.replace(/^([ \t]*)export\s+/, '$1'); });
  out = out.replace(EXPORT_CLASS, (m, name) => { trailing.push(name); return m.replace(/^([ \t]*)export\s+/, '$1'); });
  out = out.replace(EXPORT_LIST, (m, names) => {
    for (const s of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      const parts = s.split(/\s+as\s+/);
      trailing.push(parts.length === 2 ? `${parts[1]}:${parts[0]}` : s);
    }
    return '';
  });

  const forbidden = [
    [/^\s*export\s+default\b/m, 'export default'],
    [/\bimport\s*\(/, 'dynamic import()'],
    [/\bimport\.meta\b/, 'import.meta'],
    [/^\s*export\s+\*/m, 'export *'],
    [/^\s*export\s*\{[^}]*\}\s*from\b/m, 'export … from'],
    [/^\s*import\s+[A-Za-z_$][\w$]*\s*(,|from)/m, 'default import'],
  ];
  for (const [re, label] of forbidden) {
    if (re.test(source)) throw new Error(`${id}: ${label} is not supported by the single-file bundler.`);
  }

  const head = hoisted.map((n) => `__exports.${n} = ${n};`).join(' ');
  const tail = trailing.map((n) => {
    const [exp, local] = n.includes(':') ? n.split(':') : [n, n];
    return `__exports.${exp} = ${local};`;
  }).join(' ');
  return `${head}\n${out}\n${tail}`;
}

/**
 * Bundle an entry module (absolute path) into a self-contained script string.
 * `replacements` maps module ids to alternative files (used to strip Studio or
 * substitute a filtered data registry in employee packages).
 * `virtual` maps module ids to in-memory source text.
 */
export function bundle({ root, entry, replacements = {}, virtual = {} }) {
  const modules = new Map();
  const order = [];
  const stack = [];

  function readSource(id) {
    if (virtual[id] !== undefined) return virtual[id];
    const file = replacements[id] ? path.resolve(root, replacements[id]) : path.resolve(root, id);
    return fs.readFileSync(file, 'utf8');
  }

  function visit(id) {
    if (modules.has(id)) return;
    if (stack.includes(id)) throw new Error(`Circular import: ${[...stack, id].join(' -> ')}`);
    stack.push(id);
    const source = readSource(id);
    const deps = [];
    const resolve = (spec) => {
      if (!spec.startsWith('.')) throw new Error(`${id}: bare specifier "${spec}" is not supported (relative imports only).`);
      const dep = moduleId(root, path.resolve(root, path.dirname(id), spec));
      deps.push(dep);
      return dep;
    };
    const code = transformModule(source, { id, resolve });
    for (const dep of deps) visit(dep);
    stack.pop();
    modules.set(id, code);
    order.push(id);
  }

  visit(moduleId(root, entry));

  const parts = [];
  parts.push('(function(){"use strict";\nconst __defs = Object.create(null); const __cache = Object.create(null);');
  parts.push('function __req(id){ if (__cache[id]) return __cache[id]; const __exports = {}; __cache[id] = __exports; const def = __defs[id]; if (!def) throw new Error("Missing module " + id); def(__exports); return __exports; }');
  for (const id of order) {
    parts.push(`__defs[${JSON.stringify(id)}] = function(__exports){\n${modules.get(id)}\n};`);
  }
  parts.push(`__req(${JSON.stringify(moduleId(root, entry))});\n})();`);
  return { code: parts.join('\n'), modules: order };
}
