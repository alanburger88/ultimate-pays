/**
 * Unit tests for the retention outputs (src/export): PDF, XLSX and ICS builders.
 * A fake ctx is built from the real CA-ON data with computed values from calc.js.
 * t() returns the key plus its params as JSON (so assertions name the strings
 * used); a second ctx uses the real English pack to check the readable output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPdf, toWinAnsi, textWidth } from '../../src/export/pdf.js';
import { buildXlsx, crc32, zipStored, xmlEscape, excelSerial, columnLetter } from '../../src/export/xlsx.js';
import { buildIcs, icsFold, icsEscape } from '../../src/export/ics.js';
import { recordModel } from '../../src/export/print.js';
import { computeTotals, verifyRecord, rewardSummary, grossToNetFlow, varianceBridge, timeSummary } from '../../src/app/calc.js';
import { createContent } from '../../src/app/content.js';
import { setLanguage, t as realT } from '../../src/app/i18n.js';
import * as money from '../../src/app/money.js';
import { profile } from '../../src/data/profiles/CA-ON/profile.js';
import { content as contentEn } from '../../src/data/profiles/CA-ON/content.en-CA.js';
import { record } from '../../src/data/records/CA-ON/maya-bennett.js';
import { pack as packEn } from '../../src/data/lang/en-CA.js';

const fakeT = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);
const GENERATED = '2026-10-09T12:00:00Z';
const PDFTOTEXT = '/usr/bin/pdftotext';
const hasPdftotext = fs.existsSync(PDFTOTEXT);

function makeCtx({ t = fakeT, locale = 'en-CA', selection = null } = {}) {
  const rec = JSON.parse(JSON.stringify(record));
  const content = createContent({ profile, contents: { 'en-CA': contentEn }, locale });
  const totals = computeTotals(rec.lines, profile).totals;
  const computed = { totals, verify: verifyRecord(rec, profile), reward: rewardSummary(rec, profile), flow: grossToNetFlow(rec, profile), bridge: varianceBridge(rec, rec.history[0], profile), time: timeSummary(rec) };
  const o = () => ({ currency: rec.document.currency, locale });
  const fmt = {
    money: (minor, x = {}) => money.formatMoney(minor, { ...o(), ...x }),
    amount: (minor) => money.formatAmount(minor, o()),
    hours: (hh) => money.formatHours(hh, { locale }),
    minutesAsHours: (m) => money.formatMinutesAsHours(m, { locale }),
    days: (h) => `${money.formatNumber(h / 100, { locale, digits: 2 })} days`,
    number: (n, digits = 0) => money.formatNumber(n, { locale, digits }),
    percent: (p) => money.formatPercent(p, { locale }),
    rate: (minor, per) => money.formatRate(minor, { ...o(), per }),
    date: (iso, style) => money.formatDate(iso, { locale, style }),
    dateTime: (iso) => money.formatDateTime(iso, { locale }),
    period: (p) => money.formatPeriod(p, { locale }),
  };
  const state = { selection: selection || { lineIds: [], entryIds: [], tags: {}, notes: {} }, nav: { filters: { query: '', category: 'deduction', sort: 'default' } }, prefs: { presentation: {} } };
  return {
    t, fmt, content, locale,
    doc: { profile, record: rec, content, locale, computed },
    store: { get: () => state },
    line: (id) => rec.lines.find((l) => l.id === id) || null,
    selectedLines: () => state.selection.lineIds.map((id) => rec.lines.find((l) => l.id === id)).filter(Boolean),
    privacy: () => false,
    actions: { toast() {} },
  };
}

function realCtx(opts = {}) {
  setLanguage({ locale: 'en-CA', pack: packEn, fallbackLocale: 'en-CA', fallbackPack: packEn });
  return makeCtx({ ...opts, t: realT });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paylight-exports-'));
test.after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

/** Parse the xref table and check every offset points at "<n> 0 obj". */
function checkXref(bytes) {
  const s = latin1(bytes);
  const m = /startxref\n(\d+)\n%%EOF\n$/.exec(s);
  assert.ok(m, 'trailer ends with startxref/%%EOF');
  const xrefAt = Number(m[1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), 'xref', 'startxref points at the xref table');
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(xrefAt));
  const count = Number(head[1]);
  const entriesAt = xrefAt + head[0].length;
  for (let i = 0; i < count; i++) {
    const entry = s.slice(entriesAt + i * 20, entriesAt + (i + 1) * 20);
    assert.match(entry, /^\d{10} \d{5} [nf] \n$/, `xref entry ${i} is 20 bytes`);
    if (i === 0) continue;
    const off = Number(entry.slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${i} 0 obj\n`), `object ${i} starts at its xref offset (${off})`);
  }
  const trailer = /trailer\n<< \/Size (\d+) \/Root 1 0 R \/Info (\d+) 0 R >>/.exec(s);
  assert.ok(trailer, 'trailer has Size, Root and Info');
  assert.equal(Number(trailer[1]), count);
  return { count, text: s };
}

// ---------------------------------------------------------------------------
// WinAnsi encoding
// ---------------------------------------------------------------------------

test('toWinAnsi maps Latin-1, the cp1252 extras, spaces and unknowns', () => {
  assert.deepEqual(toWinAnsi('€–—‘’“”•…'), [0x80, 0x96, 0x97, 0x91, 0x92, 0x93, 0x94, 0x95, 0x85]);
  assert.deepEqual(toWinAnsi('é'), [0xe9]);
  assert.deepEqual(toWinAnsi('a b c'), [0x61, 0x20, 0x62, 0x20, 0x63]);
  assert.deepEqual(toWinAnsi('− 5'), [0x2d, 0x20, 0x35]);
  assert.deepEqual(toWinAnsi('ő'), [0x6f]);
  assert.deepEqual(toWinAnsi('∑'), [0x3f]);
  assert.deepEqual(toWinAnsi('()\\'), [0x28, 0x29, 0x5c]);
  assert.ok(textWidth(toWinAnsi('MMM'), 10, true) > textWidth(toWinAnsi('iii'), 10, false));
});

// ---------------------------------------------------------------------------
// Record model
// ---------------------------------------------------------------------------

test('record model is complete and ignores the active UI filter', () => {
  const ctx = makeCtx();
  const m = recordModel(ctx, { generatedAt: GENERATED });
  const ids = m.categories.flatMap((c) => c.lines.map((l) => l.id));
  assert.equal(ids.length, record.lines.length, 'every line is present despite the deduction filter');
  assert.deepEqual(m.categories.map((c) => c.id), ['earning', 'reimbursement', 'deduction', 'noncash', 'employer']);
  assert.equal(m.totals.find((x) => x.id === 'net').minor, 219210);
  assert.equal(m.totals.find((x) => x.id === 'payable').minor, 227850);
  assert.equal(m.categories.find((c) => c.id === 'deduction').subtotalMinor, 92790);
  assert.ok(m.disclosures.some((d) => d.key === 'constructed_notice'));
  assert.ok(m.notices.includes('export.notice_constructed'));
  assert.ok(m.notices.includes('export.notice_convenience'));
  assert.equal(m.time.entries.length, 10);
  assert.equal(m.time.balances.length, 2);
  assert.equal(m.history.length, 3);
  const cpp = m.categories.find((c) => c.id === 'deduction').lines.find((l) => l.id === 'd-cpp');
  assert.equal(cpp.statutory, 'Canada Pension Plan (CPP)');
});

test('selected model restricts line rows only and carries tags and notes', () => {
  const ctx = makeCtx({ selection: { lineIds: ['d-cpp', 'e-retro'], entryIds: [], tags: { 'd-cpp': 'please_explain' }, notes: { 'd-cpp': 'why higher?' } } });
  const m = recordModel(ctx, { generatedAt: GENERATED, selectedOnly: true });
  const ids = m.categories.flatMap((c) => c.lines.map((l) => l.id));
  assert.deepEqual(ids, ['e-retro', 'd-cpp']);
  assert.equal(m.totals.find((x) => x.id === 'net').minor, 219210, 'totals stay the record totals');
  assert.equal(m.scopeText, 'export.scope_selected{"count":2,"total":14}');
  const cpp = m.categories.find((c) => c.id === 'deduction').lines[0];
  assert.equal(cpp.tag, 'please_explain');
  assert.equal(cpp.note, 'why higher?');
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

test('PDF is a valid 1.4 file with correct xref offsets, fonts, Info and Lang', () => {
  const ctx = makeCtx();
  const bytes = buildPdf(ctx, { generatedAt: GENERATED });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(latin1(bytes.subarray(0, 8)), '%PDF-1.4');
  const { text } = checkXref(bytes);
  assert.match(text, /\/Type \/Catalog \/Pages 2 0 R \/Lang \(en-CA\)/);
  assert.match(text, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(text, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.match(text, /\/Author <FEFF005000610079006C0069006700680074>/, 'Author "Paylight" as UTF-16BE');
  assert.match(text, /\/CreationDate \(D:20261009120000Z\)/);
  assert.match(text, /\/Title <FEFF/);
  assert.match(text, /\/Subject <FEFF/);
  assert.doesNotMatch(text, /\/MarkInfo/);
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)[1]);
  assert.ok(pages >= 2, `complete record spans several pages (${pages})`);
  // every content stream length matches its data
  const re = /<< \/Length (\d+) >>\nstream\n/g;
  let mm;
  let streams = 0;
  while ((mm = re.exec(text))) {
    const start = mm.index + mm[0].length;
    assert.equal(text.slice(start + Number(mm[1]), start + Number(mm[1]) + 10), '\nendstream', 'stream length is exact');
    streams++;
  }
  assert.equal(streams, pages);
});

test('PDF text is searchable: employee name, net pay and labels extract with pdftotext', { skip: !hasPdftotext && 'pdftotext not installed' }, () => {
  const ctx = realCtx();
  const bytes = buildPdf(ctx, { generatedAt: GENERATED });
  const file = path.join(tmp, 'statement.pdf');
  fs.writeFileSync(file, bytes);
  const out = execFileSync(PDFTOTEXT, ['-layout', file, '-'], { encoding: 'utf8' });
  assert.ok(out.includes('Maya Bennett'), 'employee name is text');
  assert.ok(out.includes(ctx.fmt.money(219210)), `net pay ${ctx.fmt.money(219210)} is text`);
  assert.ok(out.includes(ctx.fmt.money(227850)), 'amount paid is text');
  assert.ok(out.includes('Statement of earnings'), 'governed document title');
  assert.ok(out.includes('Canada Pension Plan (CPP)'), 'statutory term in parentheses');
  assert.ok(out.includes('Constructed presentation record'), 'constructed notice');
  assert.ok(out.includes('Convenience copy'), 'convenience notice');
  assert.ok(out.includes('Keep this statement for your records'), 'required disclosure text');
  assert.ok(out.includes('Avenlo Group RRSP plan'), 'policy title');
  assert.ok(out.includes('This is the current version'), 'version lineage');
  assert.ok(out.includes('AVN-CA-ON-2026-20-0412'), 'record id');
  assert.ok(out.includes('English (Canada)'), 'language');
  assert.match(out, /Page 1 of \d+/);
  assert.ok(out.includes('Leave balances'), 'leave balances table');
  assert.ok(out.includes('Vacation'), 'leave type');
  assert.doesNotMatch(out, /⟦/, 'no missing interface keys');
  assert.doesNotMatch(out, /\?\?/, 'no unencodable runs');
});

test('PDF honours the profile paper size', () => {
  const ctx = makeCtx();
  const letter = latin1(buildPdf(ctx, { generatedAt: GENERATED }));
  assert.match(letter, /\/MediaBox \[0 0 612 792\]/);
  const a4ctx = makeCtx();
  a4ctx.doc.profile = { ...profile, paper: 'a4' };
  const a4 = latin1(buildPdf(a4ctx, { generatedAt: GENERATED }));
  assert.match(a4, /\/MediaBox \[0 0 595\.28 841\.89\]/);
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

test('zip writer: CRC-32 and STORED entries pass an independent integrity check', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = zipStored([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'dir/b.xml', data: new TextEncoder().encode('<x/>') }], { date: new Date(GENERATED) });
  const file = path.join(tmp, 'plain.zip');
  fs.writeFileSync(file, zip);
  const report = execFileSync('python3', ['-I', '-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nprint(z.testzip())\nprint(",".join(i.filename for i in z.infolist()))\nprint(z.read("a.txt").decode())', file], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(report[0], 'None');
  assert.equal(report[1], 'a.txt,dir/b.xml');
  assert.equal(report[2], 'hello');
});

test('xml and cell helpers', () => {
  assert.equal(xmlEscape('a<b>&"c"\u0001'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  assert.equal(excelSerial('2026-10-02'), 46297);
  assert.equal(excelSerial('1900-03-01'), 61);
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(25), 'Z');
  assert.equal(columnLetter(26), 'AA');
});

function unzipParts(bytes, name) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, bytes);
  const script = 'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename: z.read(i.filename).decode("utf-8") for i in z.infolist()}))';
  return JSON.parse(execFileSync('python3', ['-I', '-c', script, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

test('full workbook is a valid typed .xlsx with every sheet and every line', () => {
  const ctx = realCtx();
  const parts = unzipParts(buildXlsx(ctx, { generatedAt: GENERATED }), 'statement.xlsx');
  const names = Object.keys(parts);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) assert.ok(names.includes(p), p);
  assert.equal(names.filter((n) => n.startsWith('xl/worksheets/sheet')).length, 8);
  const sheetNames = [...parts['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sheetNames, ['Summary', 'Earnings', 'Deductions', 'Employer contributions', 'Other amounts', 'Time and leave', 'Prior periods', 'Document']);
  assert.match(parts['xl/styles.xml'], /formatCode="#,##0\.00"/);
  assert.match(parts['xl/styles.xml'], /formatCode="yyyy-mm-dd"/);
  const earnings = parts['xl/worksheets/sheet2.xml'];
  assert.match(earnings, /<c r="A1" t="inlineStr" s="3"><is><t xml:space="preserve">Line ID<\/t><\/is><\/c>/);
  assert.match(earnings, /<c r="B2" t="inlineStr" s="0"><is><t xml:space="preserve">Base salary<\/t><\/is><\/c>/, 'description is an inline string');
  assert.match(earnings, /<c r="A2" t="inlineStr" s="7"><is><t xml:space="preserve">e-base<\/t><\/is><\/c>/, 'line id is a text cell');
  assert.match(earnings, /<c r="E2" s="4"><v>80\.00<\/v><\/c>/, 'hours are numeric');
  assert.match(earnings, /<c r="H2" s="1"><v>3000\.00<\/v><\/c>/, 'amount is a numeric cell in major units');
  assert.match(earnings, /<c r="I2" t="inlineStr" s="0"><is><t xml:space="preserve">CAD<\/t><\/is><\/c>/);
  assert.match(earnings, /<c r="J2" s="1"><v>60000\.00<\/v><\/c>/, 'YTD numeric');
  assert.match(earnings, /<c r="K2" t="b"><v>1<\/v><\/c>/, 'taxable is a boolean');
  assert.match(earnings, /Subtotal/);
  assert.doesNotMatch(earnings, /<f>/, 'no formulas');
  const deductions = parts['xl/worksheets/sheet3.xml'];
  assert.match(deductions, /Canada Pension Plan \(CPP\)/);
  const all = names.filter((n) => n.startsWith('xl/worksheets/')).map((n) => parts[n]).join('\n');
  for (const line of record.lines) assert.match(all, new RegExp(`<t xml:space="preserve">${line.id}</t>`), `line ${line.id} exported despite the active filter`);
  const time = parts['xl/worksheets/sheet6.xml'];
  assert.match(time, /<c r="A4" s="2"><v>46279<\/v><\/c>/, 'entry date is a date-styled serial (2026-09-14)');
  assert.match(time, /Leave balances/);
  const history = parts['xl/worksheets/sheet7.xml'];
  assert.match(history, /<c r="B2" s="2"><v>46283<\/v><\/c>/, 'prior pay date 2026-09-18 is a date cell');
  const doc = parts['xl/worksheets/sheet8.xml'];
  assert.match(doc, /Constructed presentation record/);
  assert.match(doc, /Convenience copy/);
  assert.match(doc, /Keep this statement for your records/);
  assert.match(doc, /This is the current version/);
  assert.match(parts['docProps/core.xml'], /<dc:creator>Paylight<\/dc:creator>/);
  assert.match(parts['docProps/core.xml'], /<dc:language>en-CA<\/dc:language>/);
  assert.doesNotMatch(all, /⟦/, 'no missing interface keys');
});

test('selected extract names its scope, keeps notes as text and never as formulas', () => {
  const selection = { lineIds: ['d-cpp', 'e-base'], entryIds: [], tags: { 'd-cpp': 'please_explain' }, notes: { 'd-cpp': '=SUM(A1:A9)', 'e-base': '<b>&"quotes"' } };
  const withNotes = unzipParts(buildXlsx(realCtx({ selection }), { selectedOnly: true, includeNotes: true, generatedAt: GENERATED }), 'selected-notes.xlsx');
  const sheetNames = [...withNotes['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sheetNames, ['Selected lines']);
  const sheet = withNotes['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="A1" t="inlineStr" s="8"><is><t xml:space="preserve">Selected lines extract \(2 of 14 lines\)<\/t><\/is><\/c>/);
  assert.match(sheet, /This is a selected extract, not the complete record\./);
  assert.match(sheet, /<c r="[A-Z]+\d+" t="inlineStr" s="0"><is><t xml:space="preserve">=SUM\(A1:A9\)<\/t><\/is><\/c>/, 'a note starting with = is an inline string');
  assert.match(sheet, /&lt;b&gt;&amp;&quot;quotes&quot;/, 'note is XML-escaped');
  assert.match(sheet, /Please explain/, 'tag label');
  assert.doesNotMatch(sheet, /<f>/);
  assert.equal((sheet.match(/<t xml:space="preserve">(?:e-base|d-cpp)<\/t>/g) || []).length, 2, 'only the selected lines');
  assert.doesNotMatch(sheet, /e-retro/);
  const without = unzipParts(buildXlsx(realCtx({ selection }), { selectedOnly: true, includeNotes: false, generatedAt: GENERATED }), 'selected-plain.xlsx');
  assert.doesNotMatch(without['xl/worksheets/sheet1.xml'], /=SUM/);
  assert.doesNotMatch(without['xl/worksheets/sheet1.xml'], /Please explain/);
});

// ---------------------------------------------------------------------------
// ICS
// ---------------------------------------------------------------------------

test('ICS has one neutral all-day event per upcoming pay date and no amounts or identifiers', () => {
  const ctx = realCtx();
  const ics = buildIcs(ctx, { now: new Date(GENERATED) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.includes('UID:20261016-paylight@local\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261016\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261017\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261009T120000Z\r\n'));
  assert.ok(ics.includes('SUMMARY:Pay day\r\n'));
  assert.ok(ics.includes('DESCRIPTION:Scheduled pay date\r\n'));
  assert.doesNotMatch(ics, /\$|AVN-CA-ON|Bennett|Avenlo/);
  assert.doesNotMatch(ics, /[^\r]\n/, 'CRLF line endings only');
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const folded = icsFold(`DESCRIPTION:${'x'.repeat(100)}`);
  assert.ok(folded.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  assert.ok(folded.split('\r\n')[1].startsWith(' '));
});

test('ICS with no scheduled dates is an empty calendar', () => {
  const ctx = makeCtx();
  ctx.doc.record.time.upcomingPayDates = [];
  const ics = buildIcs(ctx, { now: new Date(GENERATED) });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0);
});
