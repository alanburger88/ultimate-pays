/**
 * Validates bundled data and languages:
 *  - every record reconciles (totals, line calculations, YTD chain, time, leave, bridges, payment)
 *  - every record references content keys that exist in each approved language
 *  - every interface language pack covers the reference key set (en-CA)
 *  - data index is generated from the manifest
 *  - modules use bundler-compatible syntax
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
let errors = 0;
let warnings = 0;
const fail = (msg) => { errors++; console.error(`  ✗ ${msg}`); };
const warn = (msg) => { warnings++; console.warn(`  ! ${msg}`); };

const { verifyRecord, explainLine } = await import(path.join(root, 'src/app/calc.js'));
const { coverage } = await import(path.join(root, 'src/app/i18n.js'));
const { createContent } = await import(path.join(root, 'src/app/content.js'));
const registry = await import(path.join(root, 'src/data/index.js'));
const { manifest } = await import(path.join(root, 'src/data/manifest.js'));

console.log('Data index');
try { execFileSync(process.execPath, [path.join(root, 'scripts/gen-data-index.js'), '--check'], { stdio: 'pipe' }); console.log('  ✓ up to date'); } catch (e) { fail('src/data/index.js is out of date — run node scripts/gen-data-index.js'); }

console.log('Module syntax');
try { execFileSync(process.execPath, [path.join(root, 'scripts/lint-modules.js')], { stdio: 'pipe' }); console.log('  ✓ bundler-compatible'); } catch (e) { fail(`lint failed:\n${e.stdout}${e.stderr}`); }

console.log('Records');
const stubs = [];
for (const [profileId, profile] of Object.entries(registry.profiles)) {
  if (profile.stub) stubs.push(`profile ${profileId}`);
  for (const record of registry.records[profileId] || []) {
    const label = `${profileId}/${record.scenario.id}`;
    if (record.stub) { stubs.push(`record ${label}`); }
    if (record.document.profileId !== profileId) fail(`${label}: document.profileId is ${record.document.profileId}`);
    if (record.document.currency !== profile.currency) fail(`${label}: currency ${record.document.currency} differs from profile ${profile.currency}`);
    for (const l of record.document.languages || []) if (!profile.locales.includes(l)) fail(`${label}: approved language ${l} is not in profile locales`);
    const ids = new Set();
    for (const line of record.lines) {
      if (ids.has(line.id)) fail(`${label}: duplicate line id ${line.id}`);
      ids.add(line.id);
      if (!Number.isInteger(line.amountMinor)) fail(`${label}: line ${line.id} amountMinor must be an integer`);
      if (line.ytdMinor !== undefined && !Number.isInteger(line.ytdMinor)) fail(`${label}: line ${line.id} ytdMinor must be an integer`);
      if (!['earning', 'deduction', 'employer', 'reimbursement', 'noncash', 'advance', 'info'].includes(line.category)) fail(`${label}: line ${line.id} has unknown category ${line.category}`);
      if (line.statutoryKey && !(profile.statutoryTerms || {})[line.statutoryKey]) fail(`${label}: line ${line.id} statutoryKey ${line.statutoryKey} not in profile.statutoryTerms`);
      if (line.category === 'deduction' && line.calc && line.calc.type === 'rate_base' && line.statutoryKey) warn(`${label}: statutory line ${line.id} uses rate_base — statutory amounts should be 'supplied' unless the rate is employer policy`);
    }
    const v = verifyRecord(record, profile);
    if (!v.totals.ok) for (const m of v.totals.mismatches) fail(`${label}: total ${m.id} computed ${m.computed} ≠ supplied ${m.supplied}`);
    for (const p of v.lineProblems) fail(`${label}: line ${p.id} (${p.type}) recomputes to ${p.computed} ≠ issued`);
    for (const p of v.ytd.problems) fail(`${label}: YTD chain for ${p.lineId} in ${p.periodId}: expected ${p.expected}, got ${p.actual}`);
    for (const p of v.time.problems) fail(`${label}: time reconciliation ${JSON.stringify(p)}`);
    for (const p of v.leave.problems) fail(`${label}: leave balance ${p.type}: expected ${p.expected}, got ${p.actual}`);
    for (const b of v.bridges) fail(`${label}: bridge from ${b.period.start} leaves ${b.unexplained} unexplained`);
    if (!v.paymentOk) fail(`${label}: payment amount ${record.payment.amountMinor} ≠ payable total`);
    // history totals
    for (const prior of record.history || []) {
      if (prior.suppliedTotals) {
        const { computeTotals, priorLines } = await import(path.join(root, 'src/app/calc.js'));
        const t = computeTotals(priorLines(prior), profile).totals;
        for (const [id, val] of Object.entries(prior.suppliedTotals)) if (t[id] !== val) fail(`${label}: prior ${prior.periodId} total ${id} computed ${t[id]} ≠ supplied ${val}`);
      }
    }
    // required disclosures present
    for (const key of profile.requiredDisclosures || []) {
      if (!(record.disclosures || []).some((d) => d.key === key)) fail(`${label}: required disclosure ${key} missing from record`);
    }
    if (!(record.disclosures || []).some((d) => d.key === 'constructed_notice')) fail(`${label}: constructed_notice disclosure missing (records must state they are constructed)`);
    if (record.document.provenance.kind !== 'constructed') fail(`${label}: provenance.kind must be 'constructed' for presentation data`);
    if (record.document.integrity.status === 'verified') fail(`${label}: integrity.status cannot be 'verified' without a real verification`);
    // content coverage for each approved language
    for (const locale of profile.locales) {
      const contents = registry.contents[profileId] || {};
      if (!contents[locale]) { fail(`${label}: no content pack for ${locale}`); continue; }
      const c = createContent({ profile, contents, locale });
      for (const line of record.lines) {
        if (!c.raw('lines', line.key)) fail(`${label} [${locale}]: content.lines.${line.key} missing`);
        if (line.explanationKey && !c.explanation(line.explanationKey)) fail(`${label} [${locale}]: explanation ${line.explanationKey} missing`);
        if (line.glossaryKey && !c.glossary(line.glossaryKey)) fail(`${label} [${locale}]: glossary ${line.glossaryKey} missing`);
        for (const pid of line.policyIds || []) if (!c.policy(pid)) fail(`${label} [${locale}]: policy ${pid} missing`);
      }
      for (const prior of record.history || []) for (const line of prior.lines) if (!c.raw('lines', line.key)) fail(`${label} [${locale}]: content.lines.${line.key} (history) missing`);
      for (const d of record.disclosures || []) if (!c.disclosure(d.key)) fail(`${label} [${locale}]: disclosure ${d.key} missing`);
      for (const pid of record.policies || []) if (!c.policy(pid)) fail(`${label} [${locale}]: policy ${pid} missing`);
      for (const b of record.benefits || []) if (!c.raw('benefits', b.key)) fail(`${label} [${locale}]: benefit ${b.key} missing`);
      for (const bal of (record.time && record.time.leave && record.time.leave.balances) || []) { if (!c.raw('leaveTypes', bal.type)) fail(`${label} [${locale}]: leaveType ${bal.type} missing`); if (bal.explanationKey && !c.explanation(bal.explanationKey)) fail(`${label} [${locale}]: explanation ${bal.explanationKey} missing`); }
      for (const def of profile.totals) if (!c.raw('totals', def.id)) fail(`${label} [${locale}]: totals.${def.id} label missing`);
      for (const cat of profile.categoryOrder) if (!c.raw('categories', cat)) fail(`${label} [${locale}]: categories.${cat} missing`);
      for (const line of record.lines) if (line.group && !c.raw('groups', line.group)) fail(`${label} [${locale}]: groups.${line.group} missing`);
      for (const r of record.employer.registrations || []) if (!c.raw('employerFields', r.key)) fail(`${label} [${locale}]: employerFields.${r.key} missing`);
      for (const r of record.employee.identifiers || []) if (!c.raw('employeeFields', r.key)) fail(`${label} [${locale}]: employeeFields.${r.key} missing`);
      if (record.payment && !c.raw('paymentMethods', record.payment.method)) fail(`${label} [${locale}]: paymentMethods.${record.payment.method} missing`);
      for (const a of record.adjustments || []) if (!c.raw('adjustments', a.key)) fail(`${label} [${locale}]: adjustments.${a.key} missing`);
      for (const h of record.highlights || []) { /* interface keys, checked below */ }
      for (const e of (record.time && record.time.entries) || []) { if (!c.raw('entryTypes', e.type)) fail(`${label} [${locale}]: entryTypes.${e.type} missing`); if (e.leaveType && !c.raw('leaveTypes', e.leaveType)) fail(`${label} [${locale}]: leaveTypes.${e.leaveType} missing`); }
      if (!c.document('title')) fail(`${label} [${locale}]: document.title missing`);
    }
    // explanations must be producible for every line
    for (const line of record.lines) { try { explainLine(line, record); } catch (e) { fail(`${label}: explainLine(${line.id}) threw ${e.message}`); } }
    if (!record.stub && (record.history || []).length < 3 && (record.history || []).length > 0) warn(`${label}: fewer than 3 prior periods (${record.history.length})`);
  }
}
if (stubs.length) { for (const s of stubs) (strict ? fail : warn)(`placeholder stub still present: ${s}`); }
else console.log('  ✓ no placeholder stubs');
if (!errors) console.log('  ✓ all records reconcile');

console.log('Interface languages');
const reference = registry.languages['en-CA'];
const interfaceKeysUsed = new Set();
for (const [tag, pack] of Object.entries(registry.languages)) {
  if (tag === 'en-CA') continue;
  const cov = coverage(pack, reference);
  if (Object.keys(pack).length === 0) { (strict ? fail : warn)(`${tag}: empty placeholder pack`); continue; }
  if (cov.missing.length) fail(`${tag}: ${cov.missing.length} missing keys: ${cov.missing.slice(0, 8).join(', ')}${cov.missing.length > 8 ? '…' : ''}`);
  if (cov.extra.length) warn(`${tag}: ${cov.extra.length} keys not in reference: ${cov.extra.slice(0, 5).join(', ')}`);
  if (cov.untranslated.length > 30 && !tag.startsWith('en-')) warn(`${tag}: ${cov.untranslated.length} strings identical to English (check for untranslated text)`);
  // placeholders must match
  for (const k of Object.keys(reference)) {
    if (!pack[k]) continue;
    const refPh = (reference[k].match(/\{\w+\}/g) || []).sort().join(',');
    const ph = (pack[k].match(/\{\w+\}/g) || []).sort().join(',');
    if (refPh !== ph) fail(`${tag}: placeholder mismatch in ${k}: expected ${refPh || '(none)'} got ${ph || '(none)'}`);
  }
  if (!cov.missing.length) console.log(`  ✓ ${tag}: ${cov.total} keys`);
}
// profile/region/highlight keys referenced by data must exist in the reference pack
for (const profile of Object.values(registry.profiles)) {
  for (const k of [profile.countryKey, `region.${profile.id}`, profile.taxYear.basisKey, ...(profile.requiredFields || []).map((f) => f.reasonKey), (profile.reward || {}).definitionKey]) if (k && !reference[k]) fail(`reference pack missing key ${k} used by profile ${profile.id}`);
}
for (const list of Object.values(registry.records)) for (const r of list) for (const hl of r.highlights || []) if (!reference[hl.reasonKey]) fail(`reference pack missing key ${hl.reasonKey} used by record ${r.scenario.id}`);
for (const list of Object.values(registry.records)) for (const r of list) if (r.time && r.time.scheduleNote && !reference[`time.schedule_note_${r.time.scheduleNote}`]) fail(`reference pack missing key time.schedule_note_${r.time.scheduleNote}`);

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
