/**
 * Minimal, valid .xlsx writer (OOXML in a STORED zip) for the complete record
 * and for the named selected-lines extract. No libraries.
 *
 * Types are preserved: amounts are numeric cells in major units (2 dp) with a
 * currency column, hours are numeric, dates are Excel serial numbers with a
 * date style, identifiers and every other string are inline strings
 * (t="inlineStr") — never shared strings, never formulas. Anything a person
 * typed (tags, private notes) is XML-escaped text, so "=SUM(...)" stays text.
 *
 * Contract: export function buildXlsx(ctx, { selectedOnly, includeNotes, generatedAt? }) -> Uint8Array
 */
import { recordModel } from './print.js';
import { minorDigits } from '../app/money.js';

// ---------------------------------------------------------------------------
// ZIP (STORED entries, CRC-32)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = Math.max(1980, d.getUTCFullYear());
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time: time & 0xffff, date: day & 0xffff };
}

/** Build a zip archive with STORED entries. entries: [{ name, data: Uint8Array }]. */
export function zipStored(entries, { date = new Date() } = {}) {
  const enc = new TextEncoder();
  const { time, date: dosDate } = dosDateTime(date);
  const parts = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  return out;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/** Escape text for XML content/attributes and drop characters XML 1.0 forbids. */
export function xmlEscape(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** ISO date (YYYY-MM-DD) → Excel serial day number (1900 date system). */
export function excelSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Cell constructors. Every string is an inline string; identifiers additionally carry the text ("@") style.
const S = { text: 0, money: 1, date: 2, header: 3, hours: 4, int: 5, moneyBold: 6, id: 7, title: 8, bold: 3, rate: 9, percent: 10 };
const T = (text) => ({ k: 'text', v: text === null || text === undefined ? '' : String(text), s: S.text });
const ID = (text) => ({ k: 'text', v: text === null || text === undefined ? '' : String(text), s: S.id });
const HDR = (text) => ({ k: 'text', v: String(text), s: S.header });
const TITLE = (text) => ({ k: 'text', v: String(text), s: S.title });
const B = (text) => ({ k: 'text', v: String(text), s: S.bold });
const M = (minor, digits, bold = false) => (typeof minor === 'number' ? { k: 'num', v: (minor / 10 ** digits).toFixed(digits), s: bold ? S.moneyBold : S.money } : T(''));
const H = (hundredths) => (typeof hundredths === 'number' ? { k: 'num', v: (hundredths / 100).toFixed(2), s: S.hours } : T(''));
const N = (n) => (typeof n === 'number' ? { k: 'num', v: String(n), s: S.int } : T(''));
const D = (iso) => { const v = excelSerial(iso); return v === null ? T(iso || '') : { k: 'num', v: String(v), s: S.date }; };
// Rates stay numbers: money per unit keeps any extra precision (#,##0.00##); percentages are true fractions (0.00##%).
const RATE = (rateMinor, digits) => (typeof rateMinor === 'number' ? { k: 'num', v: String(Number((rateMinor / 10 ** digits).toFixed(digits + 2))), s: S.rate } : T(''));
const PCT = (permyriad) => (typeof permyriad === 'number' ? { k: 'num', v: String(Number((permyriad / 10000).toFixed(6))), s: S.percent } : T(''));
const BOOL = (b) => (typeof b === 'boolean' ? { k: 'bool', v: b ? '1' : '0', s: S.text } : T(''));

function cellXml(cell, ref) {
  const c = cell && typeof cell === 'object' && 'k' in cell ? cell : T(cell);
  if (c.k === 'num') return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
  if (c.k === 'bool') return `<c r="${ref}" t="b"><v>${c.v}</v></c>`;
  if (c.v === '') return `<c r="${ref}" s="${c.s}"/>`;
  return `<c r="${ref}" t="inlineStr" s="${c.s}"><is><t xml:space="preserve">${xmlEscape(c.v)}</t></is></c>`;
}

function displayLength(cell) {
  const c = cell && typeof cell === 'object' && 'k' in cell ? cell : T(cell);
  if (c.k === 'num') return c.s === S.date ? 11 : Math.max(8, c.v.length + 2);
  if (c.k === 'bool') return 6;
  return Math.min(60, Math.max(...c.v.split('\n').map((l) => l.length)));
}

function sheetXml({ rows, freezeRow = 0, paper = 'a4' }) {
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const widths = new Array(colCount).fill(8);
  rows.forEach((r) => r.forEach((cell, ci) => { widths[ci] = Math.max(widths[ci], Math.min(60, displayLength(cell) + 2)); }));
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((cell, ci) => cellXml(cell, `${columnLetter(ci)}${ri + 1}`)).join('')}</row>`).join('');
  const view = freezeRow > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<dimension ref="A1:${columnLetter(colCount - 1)}${Math.max(1, rows.length)}"/>${view}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols>`
    + `<sheetData>${data}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="${paper === 'letter' ? 1 : 9}" orientation="landscape"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="#,##0.00##"/><numFmt numFmtId="167" formatCode="0.00##%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Excel sheet names: ≤ 31 characters, none of : \ / ? * [ ], unique within the workbook. */
function sheetName(raw, used) {
  let base = String(raw || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) { const suffix = ` (${i++})`; name = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}

function workbookParts(sheets, { title, subject, description, locale, generatedAt, paper }) {
  const enc = new TextEncoder();
  const used = new Set();
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Paylight</Application></Properties>`;
  const stamp = new Date(generatedAt);
  const w3c = Number.isNaN(stamp.getTime()) ? new Date().toISOString() : stamp.toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:subject>${xmlEscape(subject)}</dc:subject><dc:creator>Paylight</dc:creator><dc:description>${xmlEscape(description)}</dc:description><dc:language>${xmlEscape(locale)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${w3c}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${w3c}</dcterms:modified></cp:coreProperties>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${named.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const entries = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'docProps/app.xml', data: enc.encode(app) },
    { name: 'docProps/core.xml', data: enc.encode(core) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml({ rows: s.rows, freezeRow: s.freezeRow || 0, paper })) })),
  ];
  return zipStored(entries, { date: Number.isNaN(stamp.getTime()) ? new Date() : stamp });
}

// ---------------------------------------------------------------------------
// Sheets from the record model
// ---------------------------------------------------------------------------

function lineColumns(t, { withCategory = false, includeNotes = false } = {}) {
  return [
    HDR(t('export.col_line_id')), HDR(t('export.col_description')), HDR(t('export.col_statutory')),
    ...(withCategory ? [HDR(t('export.col_category'))] : []), HDR(t('export.col_group')),
    HDR(t('export.col_hours')), HDR(t('export.col_units')), HDR(t('export.col_rate')), HDR(t('export.col_amount')), HDR(t('export.col_currency')), HDR(t('export.col_ytd')),
    HDR(t('export.col_taxable')), HDR(t('export.col_cash')), HDR(t('export.col_source')),
    ...(includeNotes ? [HDR(t('export.col_tag')), HDR(t('export.col_note'))] : []),
  ];
}

function lineRow(r, { currency, digits, withCategory = false, includeNotes = false }) {
  return [
    ID(r.id), T(r.label), T(r.statutory || ''), ...(withCategory ? [T(r.categoryLabel)] : []), T(r.groupLabel || ''),
    H(r.hoursHundredths), T(r.units || ''), r.rateMinor !== null && r.rateMinor !== undefined ? RATE(r.rateMinor, digits) : r.ratePermyriad !== null && r.ratePermyriad !== undefined ? PCT(r.ratePermyriad) : T(r.rate || ''), M(r.amountMinor, digits), T(currency), r.ytdMinor === null ? T('') : M(r.ytdMinor, digits),
    BOOL(r.taxable), BOOL(r.cash), ID(r.sourceRef || ''),
    ...(includeNotes ? [T(r.tagLabel || ''), T(r.note || '')] : []),
  ];
}

function categorySheet(t, m, name, categories, { currency, digits, withCategory = false }) {
  const rows = [lineColumns(t, { withCategory })];
  for (const cat of m.categories) {
    if (!categories.includes(cat.id)) continue;
    for (const r of cat.lines) rows.push(lineRow(r, { currency, digits, withCategory }));
    if (cat.subtotalMinor !== null) {
      const row = [T(''), B(t('details.subtotal', { category: cat.label })), T(''), ...(withCategory ? [T('')] : []), T(''), T(''), T(''), T(''), M(cat.subtotalMinor, digits, true), T(currency)];
      rows.push(row);
    }
  }
  if (rows.length === 1) rows.push([T(t('export.no_rows'))]);
  return { name, rows, freezeRow: 1 };
}

/**
 * One particulars row with typed values: amounts are numbers, single dates are date cells, and a period's
 * start and end are date cells in the Start / End columns (its readable text stays in Value). Issue times keep
 * their zone-labelled text, since a spreadsheet date-time has no time zone.
 */
function particularRow(r, { currency, digits }) {
  const text = r.lines.join('\n');
  if (typeof r.minor === 'number') return [T(r.label), M(r.minor, digits), T(currency)];
  if (r.date) return [T(r.label), D(r.date)];
  if (r.period) return [T(r.label), T(text), T(''), D(r.period.start), D(r.period.end)];
  return [T(r.label), r.id ? ID(text) : T(text)];
}

const particularsHeader = (t) => [HDR(t('export.col_field')), HDR(t('export.col_value')), HDR(t('export.col_currency')), HDR(t('export.col_start')), HDR(t('export.col_end'))];

function adjustmentRows(t, m, { currency, digits }) {
  if (!m.adjustments.length) return [];
  return [
    [],
    [HDR(t('mypay.separate_payment')), HDR(t('export.col_amount')), HDR(t('export.col_currency')), HDR(t('export.col_pay_date'))],
    ...m.adjustments.map((a) => [T(a.label), M(a.minor, digits), T(currency), a.paymentDate ? D(a.paymentDate) : T('')]),
  ];
}

function summarySheet(t, m, { currency, digits }) {
  const d = m.particulars.document.rows;
  const rows = [
    [TITLE(m.header)],
    [T(m.scopeText)],
    [],
    particularsHeader(t),
    [T(t('masthead.employer')), T(m.employerName)],
    [T(t('common.employee')), T(m.employeeName)],
    ...d.map((r) => particularRow(r, { currency, digits })),
    ...m.particulars.payment.rows.map((r) => particularRow(r, { currency, digits })),
    [],
    [HDR(t('export.totals')), HDR(t('export.col_amount')), HDR(t('export.col_currency'))],
    ...m.totals.map((x) => [x.prominent ? B(x.label) : T(x.label), M(x.minor, digits, x.prominent), T(currency)]),
    ...adjustmentRows(t, m, { currency, digits }),
    [],
    ...m.notices.map((n) => [T(n)]),
  ];
  return { name: t('export.sheet_summary'), rows };
}

/** Employer, employee, document and payment particulars: the statement's mandatory content, kept with the figures. */
function particularsSheet(t, m, money) {
  const rows = [[TITLE(t('record.particulars'))]];
  for (const group of [m.particulars.employer, m.particulars.employee, m.particulars.document, m.particulars.payment]) {
    if (!group.rows.length) continue;
    rows.push([], [B(group.title)], particularsHeader(t));
    for (const r of group.rows) rows.push(particularRow(r, money));
  }
  return { name: t('record.particulars'), rows };
}

function timeSheet(t, m) {
  const tm = m.time;
  const rows = [];
  if (!tm) { rows.push([HDR(t('export.col_date')), HDR(t('export.col_type'))], [T(t('export.no_rows'))]); return { name: t('export.sheet_time'), rows }; }
  rows.push([TITLE(t('time.entries_title'))]);
  if (tm.scheduleNote) rows.push([T(tm.scheduleNote)]);
  rows.push([HDR(t('export.col_date')), HDR(t('export.col_type')), HDR(t('export.col_start')), HDR(t('export.col_end')), HDR(t('export.col_break_minutes')), HDR(t('export.col_minutes')), HDR(t('export.col_regular_minutes')), HDR(t('export.col_overtime_minutes')), HDR(t('export.col_paid_minutes')), HDR(t('export.col_hours')), HDR(t('export.col_leave_type')), HDR(t('export.col_holiday'))]);
  if (!tm.entries.length) rows.push([T(t('export.no_rows'))]);
  for (const e of tm.entries) rows.push([D(e.date), T(e.typeLabel), T(e.start || ''), T(e.end || ''), N(e.breakMinutes), N(e.minutes), N(e.regularMinutes), N(e.overtimeMinutes), N(e.paidMinutes), H(Math.round((e.minutes / 60) * 100)), T(e.leaveTypeLabel || ''), T(e.holidayKey ? t('time.holiday') : '')]);
  rows.push([]);
  rows.push([TITLE(t('time.hours_summary'))]);
  rows.push([HDR(t('common.type')), HDR(t('export.col_minutes')), HDR(t('export.col_hours'))]);
  for (const s of tm.summary) rows.push([T(s.label), N(s.minutes), H(Math.round((s.minutes / 60) * 100))]);
  rows.push([]);
  rows.push([TITLE(t('time.balances_title'))]);
  rows.push([HDR(t('export.col_leave_type')), HDR(t('export.unit')), HDR(t('export.balance_opening')), HDR(t('export.balance_accrued')), HDR(t('export.balance_taken')), HDR(t('export.col_adjusted')), HDR(t('export.balance_closing')), HDR(t('export.col_as_of'))]);
  if (!tm.balances.length) rows.push([T(t('export.no_rows'))]);
  for (const b of tm.balances) rows.push([T(b.typeLabel), T(b.unitLabel), H(b.opening), H(b.accrued), H(b.taken), H(b.adjusted), H(b.closing), b.asOf ? D(b.asOf) : T('')]);
  return { name: t('export.sheet_time'), rows };
}

function historySheet(t, m, { currency, digits }) {
  const rows = [[HDR(t('export.col_period')), HDR(t('export.col_start')), HDR(t('export.col_end')), HDR(t('export.col_pay_date')), HDR(t('export.col_tax_year')), HDR(t('export.col_line_id')), HDR(t('export.col_description')), HDR(t('export.col_category')), HDR(t('export.col_group')), HDR(t('export.col_hours')), HDR(t('export.col_amount')), HDR(t('export.col_currency')), HDR(t('export.col_ytd'))]];
  for (const p of m.history) {
    const span = [p.periodStart ? D(p.periodStart) : T(''), p.periodEnd ? D(p.periodEnd) : T('')];
    for (const r of p.lines) rows.push([T(p.periodText), ...span, p.payDate ? D(p.payDate) : T(''), T(p.taxYearLabel || ''), ID(r.id), T(r.label), T(r.categoryLabel), T(r.groupLabel || ''), r.hoursHundredths !== null ? H(r.hoursHundredths) : T(''), M(r.amountMinor, digits), T(currency), r.ytdMinor === null ? T('') : M(r.ytdMinor, digits)]);
    rows.push([T(p.periodText), ...span, p.payDate ? D(p.payDate) : T(''), T(p.taxYearLabel || ''), T(''), B(p.netLabel), T(''), T(''), T(''), M(p.netMinor, digits, true), T(currency)]);
  }
  if (rows.length === 1) rows.push([T(t('export.no_rows'))]);
  return { name: t('export.sheet_history'), rows, freezeRow: 1 };
}

function documentSheet(t, m) {
  const money = { currency: m.currency, digits: minorDigits(m.currency) };
  const rows = [particularsHeader(t)];
  for (const r of m.particulars.document.rows) rows.push(particularRow(r, money));
  rows.push([T(t('export.field_generated')), T(m.generatedText)]);
  rows.push([T(t('export.field_scope')), T(m.scopeText)]);
  rows.push([T(t('export.field_integrity_status')), T(m.integrityStatusText)]);
  if (m.supersedes) rows.push([T(t('export.field_supersedes')), ID(m.supersedes)]);
  if (m.supersededBy) rows.push([T(t('export.field_superseded_by')), ID(m.supersededBy)]);
  rows.push([]);
  rows.push([HDR(t('record.provenance'))]);
  for (const line of m.provenance) rows.push([T(line)]);
  rows.push([]);
  rows.push([HDR(t('record.version_lineage'))]);
  for (const line of m.lineage) rows.push([T(line)]);
  rows.push([]);
  rows.push([HDR(t('export.disclosures')), HDR(t('export.col_required'))]);
  for (const d of m.disclosures) rows.push([T(d.text), BOOL(d.required)]);
  rows.push([]);
  rows.push([HDR(t('record.policies'))]);
  for (const p of m.policies) rows.push([T(p.title)]);
  rows.push([]);
  for (const n of m.notices) rows.push([B(n)]);
  return { name: t('export.sheet_document'), rows };
}

function selectedSheet(t, m, { currency, digits, includeNotes }) {
  const rows = [
    [TITLE(m.scopeText)],
    [B(t('export.notice_extract'))],
    ...m.notices.map((n) => [T(n)]),
    [T(`${t('masthead.reference')}: ${m.recordId}`), T(m.versionText), T(`${t('export.language')}: ${m.language}`), T(t('export.generated', { date: m.generatedText }))],
    [],
    lineColumns(t, { withCategory: true, includeNotes }),
  ];
  const header = rows.length;
  for (const cat of m.categories) for (const r of cat.lines) rows.push(lineRow(r, { currency, digits, withCategory: true, includeNotes }));
  if (rows.length === header) rows.push([T(t('export.no_rows'))]);
  return { name: t('export.sheet_selected'), rows, freezeRow: header };
}

/**
 * Build the workbook bytes. `selectedOnly` produces the single named extract
 * sheet; `includeNotes` adds the tag and private-note columns to it (never to
 * the full export).
 */
export function buildXlsx(ctx, { selectedOnly = false, includeNotes = false, generatedAt = new Date().toISOString() } = {}) {
  const t = ctx.t;
  const m = recordModel(ctx, { generatedAt, selectedOnly });
  const currency = m.currency;
  const digits = minorDigits(currency);
  const money = { currency, digits };
  const sheets = selectedOnly
    ? [selectedSheet(t, m, { ...money, includeNotes })]
    : [
      summarySheet(t, m, money),
      particularsSheet(t, m, money),
      categorySheet(t, m, t('export.sheet_earnings'), ['earning'], money),
      categorySheet(t, m, t('export.sheet_deductions'), ['deduction'], money),
      categorySheet(t, m, t('export.sheet_employer'), ['employer'], money),
      categorySheet(t, m, t('export.sheet_other'), ['reimbursement', 'noncash', 'advance', 'info'], { ...money, withCategory: true }),
      timeSheet(t, m),
      historySheet(t, m, money),
      documentSheet(t, m),
    ];
  return workbookParts(sheets, {
    title: m.pdfTitle,
    subject: m.subject,
    description: [m.scopeText, ...m.notices].join(' '),
    locale: m.locale,
    generatedAt,
    paper: String(ctx.doc.profile.paper || 'a4').toLowerCase() === 'letter' ? 'letter' : 'a4',
  });
}
