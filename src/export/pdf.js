/**
 * Text-based PDF writer for the complete record. No libraries: a tiny layout
 * engine (text runs, wrapped paragraphs, key/value blocks and paginated tables
 * with repeated header rows) over a minimal, valid PDF 1.4 serialiser with
 * correct xref offsets, Helvetica / Helvetica-Bold (WinAnsiEncoding), /Info
 * and /Lang. The output is searchable text, never an image.
 *
 * Every figure comes from the shared record model (print.js → calc.js /
 * money.js via ctx.fmt), every governed text from ctx.content and every label
 * from ctx.t. The active UI filter is never applied: a PDF is the whole record.
 *
 * Contract: export function buildPdf(ctx, { generatedAt? }) -> Uint8Array
 */
import { recordModel } from './print.js';

// ---------------------------------------------------------------------------
// WinAnsi encoding and Helvetica metrics
// ---------------------------------------------------------------------------

/** Unicode code point → WinAnsi (cp1252) byte for the 0x80–0x9F extras. */
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function isSpaceLike(cp) {
  return cp === 0x00a0 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0x2007 || cp === 0xfeff;
}

/** Encode a JavaScript string as WinAnsi bytes. Unknown characters become '?'. */
export function toWinAnsi(str) {
  const out = [];
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) { out.push(0x20); continue; }
    if (cp < 0x20) continue;
    if (cp < 0x7f) { out.push(cp); continue; }
    if (isSpaceLike(cp)) { out.push(0x20); continue; }
    if (cp === 0x2212 || cp === 0x2010 || cp === 0x2011 || cp === 0x2012) { out.push(0x2d); continue; }
    if (CP1252[cp] !== undefined) { out.push(CP1252[cp]); continue; }
    if (cp >= 0xa0 && cp <= 0xff) { out.push(cp); continue; }
    // Letters outside Latin-1 (ő, ş, ă …): fall back to the base letter when there is one.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const bcp = base.codePointAt(0);
    if (base && bcp !== cp && ((bcp >= 0x20 && bcp < 0x7f) || (bcp >= 0xa0 && bcp <= 0xff))) { out.push(bcp); continue; }
    out.push(0x3f);
  }
  return out;
}

// Helvetica AFM widths (1/1000 em) for ASCII 32–126.
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
// Helvetica-Bold AFM widths for ASCII 32–126.
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// Widths for the WinAnsi high range that are not plain accented letters.
const W_HIGH = {
  0x80: 556, 0x82: 222, 0x83: 556, 0x84: 333, 0x85: 1000, 0x86: 556, 0x87: 556, 0x88: 333, 0x89: 1000, 0x8a: 667, 0x8b: 333, 0x8c: 1000, 0x8e: 611,
  0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9a: 500, 0x9b: 333, 0x9c: 944, 0x9e: 500, 0x9f: 667,
  0xa0: 278, 0xa1: 333, 0xa2: 556, 0xa3: 556, 0xa4: 556, 0xa5: 556, 0xa6: 260, 0xa7: 556, 0xa8: 333, 0xa9: 737, 0xaa: 370, 0xab: 556, 0xac: 584, 0xad: 333, 0xae: 737, 0xaf: 333,
  0xb0: 400, 0xb1: 584, 0xb2: 333, 0xb3: 333, 0xb4: 333, 0xb5: 556, 0xb6: 537, 0xb7: 278, 0xb8: 333, 0xb9: 333, 0xba: 365, 0xbb: 556, 0xbc: 834, 0xbd: 834, 0xbe: 834, 0xbf: 611,
  0xc6: 1000, 0xd0: 722, 0xd7: 584, 0xd8: 778, 0xde: 667, 0xdf: 611, 0xe6: 889, 0xf0: 556, 0xf7: 584, 0xf8: 611, 0xfe: 556,
};
const W_HIGH_BOLD = { 0x82: 278, 0x84: 500, 0x91: 278, 0x92: 278, 0x93: 500, 0x94: 500, 0x9a: 556, 0xa6: 280, 0xb5: 611, 0xb6: 556, 0xf0: 611, 0xfe: 611 };
// Base letter for 0xC0–0xFF ('?' = handled by W_HIGH).
const BASE_LETTER = 'AAAAAA?CEEEEIIII?NOOOOO??UUUUY??aaaaaa?ceeeeiiii?nooooo??uuuuy?y';

function glyphWidth(byte, bold) {
  if (byte >= 32 && byte <= 126) return (bold ? W_BOLD : W_REG)[byte - 32];
  if (byte >= 0xc0) {
    const base = BASE_LETTER[byte - 0xc0];
    if (base !== '?') return (bold ? W_BOLD : W_REG)[base.charCodeAt(0) - 32];
  }
  if (bold && W_HIGH_BOLD[byte] !== undefined) return W_HIGH_BOLD[byte];
  return W_HIGH[byte] !== undefined ? W_HIGH[byte] : 556;
}

/** Width in points of a WinAnsi byte array at a font size. */
export function textWidth(bytes, size, bold = false) {
  let w = 0;
  for (const b of bytes) w += glyphWidth(b, bold);
  return (w / 1000) * size;
}

// ---------------------------------------------------------------------------
// PDF string helpers
// ---------------------------------------------------------------------------

function bytesToBinary(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** Literal string for a content stream: WinAnsi bytes with ( ) \ escaped. */
function literal(bytes) {
  let s = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else if (b === 0x0d) s += '\\r';
    else if (b === 0x0a) s += '\\n';
    else s += String.fromCharCode(b);
  }
  return s + ')';
}

/** Text string for the document dictionary: UTF-16BE with BOM as a hex string (any Unicode is exact). */
function textString(str) {
  let hex = 'FEFF';
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function num(n) {
  return (Math.round(n * 100) / 100).toString();
}

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGIN = { top: 54, right: 46, bottom: 54, left: 46 };
const LINE = 1.32; // line height as a multiple of the font size
const GRAY_TEXT = 0.36;
const GRAY_RULE = 0.72;

/**
 * Wrap a string into lines that fit `width` at the given size/weight. Returns
 * [{ bytes, width }]. Words longer than the width are broken by character.
 */
function wrap(text, width, size, bold) {
  const lines = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push({ bytes: [], width: 0 }); continue; }
    let cur = [];
    let curW = 0;
    const space = textWidth([0x20], size, bold);
    const push = () => { lines.push({ bytes: cur, width: curW }); cur = []; curW = 0; };
    for (const word of words) {
      let wb = toWinAnsi(word);
      let ww = textWidth(wb, size, bold);
      if (ww > width) {
        // break an overlong word by characters
        if (cur.length) push();
        let chunk = [];
        let chunkW = 0;
        for (const b of wb) {
          const gw = textWidth([b], size, bold);
          if (chunkW + gw > width && chunk.length) { lines.push({ bytes: chunk, width: chunkW }); chunk = []; chunkW = 0; }
          chunk.push(b); chunkW += gw;
        }
        wb = chunk; ww = chunkW;
        cur = wb; curW = ww;
        continue;
      }
      if (cur.length && curW + space + ww > width) push();
      if (cur.length) { cur.push(0x20); curW += space; }
      cur.push(...wb); curW += ww;
    }
    if (cur.length || !lines.length) push();
  }
  return lines;
}

class Layout {
  constructor({ paper }) {
    const key = String(paper || 'a4').toLowerCase() === 'letter' ? 'letter' : 'a4';
    [this.pageW, this.pageH] = PAPER[key];
    this.paper = key;
    this.left = MARGIN.left;
    this.width = this.pageW - MARGIN.left - MARGIN.right;
    this.bottom = this.pageH - MARGIN.bottom;
    this.pages = [];
    this.onNewPage = null;
    this.newPage();
  }

  newPage() {
    this.page = { ops: [] };
    this.pages.push(this.page);
    this.y = MARGIN.top;
    if (this.onNewPage && this.pages.length > 1) this.onNewPage(this);
  }

  /** Make room for `height` points; starts a new page when needed. Returns true if a page break happened. */
  ensure(height) {
    if (this.y + height > this.bottom && this.y > MARGIN.top + 0.01) { this.newPage(); return true; }
    return false;
  }

  space(pts) { this.y += pts; }

  op(s) { this.page.ops.push(s); }

  /** Draw one line of WinAnsi bytes with its top at `top` (page coordinates from the top edge). */
  drawBytes(bytes, { x, top, size, bold = false, gray = 0, page = this.page }) {
    if (!bytes.length) return;
    const baseline = this.pageH - (top + size * 0.93);
    page.ops.push(`BT ${gray ? `${num(gray)} g ` : ''}/${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(baseline)} Td ${literal(bytes)} Tj${gray ? ' 0 g' : ''} ET`);
  }

  rule(x1, x2, top, { width = 0.5, gray = GRAY_RULE, page = this.page } = {}) {
    const y = this.pageH - top;
    page.ops.push(`${num(gray)} G ${num(width)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S 0 G`);
  }

  /** Wrapped paragraph flowing down the page. */
  paragraph(text, { size = 9.5, bold = false, gray = 0, x = this.left, width = this.width, after = 4, align = 'left', indent = 0 } = {}) {
    const lh = size * LINE;
    const lines = wrap(text, width - indent, size, bold);
    lines.forEach((ln) => {
      this.ensure(lh);
      const dx = align === 'right' ? width - ln.width : align === 'center' ? (width - ln.width) / 2 : indent;
      this.drawBytes(ln.bytes, { x: x + dx, top: this.y, size, bold, gray });
      this.y += lh;
    });
    this.y += after;
  }

  heading(text, { size = 12, after = 4, before = 6, rule = true } = {}) {
    const lh = size * LINE;
    this.y += before;
    // keep the heading with at least two lines of what follows
    this.ensure(lh + 9.5 * LINE * 2 + after + 6);
    const lines = wrap(text, this.width, size, true);
    for (const ln of lines) { this.drawBytes(ln.bytes, { x: this.left, top: this.y, size, bold: true }); this.y += lh; }
    if (rule) { this.rule(this.left, this.left + this.width, this.y + 1, { width: 0.75, gray: 0.4 }); this.y += 3; }
    this.y += after;
  }

  /** Label/value rows (two columns; values may span several lines). */
  keyValues(rows, { size = 9, labelWidth = 0.32, x = this.left, width = this.width, after = 6 } = {}) {
    const lh = size * LINE;
    const lw = width * labelWidth;
    const vw = width - lw - 8;
    for (const r of rows) {
      const labelLines = wrap(r.label, lw - 6, size, true);
      const valueLines = (Array.isArray(r.lines) ? r.lines : [String(r.lines)]).flatMap((v) => wrap(v, vw, size, false));
      const n = Math.max(labelLines.length, valueLines.length);
      const h = n * lh + 2;
      this.ensure(h);
      labelLines.forEach((ln, i) => this.drawBytes(ln.bytes, { x, top: this.y + i * lh, size, bold: true, gray: GRAY_TEXT }));
      valueLines.forEach((ln, i) => this.drawBytes(ln.bytes, { x: x + lw + 8, top: this.y + i * lh, size }));
      this.y += h;
    }
    this.y += after;
  }

  /**
   * Table with repeated header rows across pages.
   * columns: [{ label, width (fraction of table width), align: 'left'|'right' }]
   * rows: [{ cells: [string | { text, bold?, gray?, sub? }], bold?, ruleAbove? }]
   */
  table({ columns, rows, size = 8.6, x = this.left, width = this.width, caption = null, after = 8, emptyText = null }) {
    const lh = size * LINE;
    const padX = 4;
    const padY = 2.4;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const cols = columns.map((c) => ({ ...c, pts: (c.width / total) * width }));
    const headerCells = cols.map((c) => wrap(c.label, c.pts - padX * 2, size, true));
    const headerH = Math.max(...headerCells.map((l) => l.length)) * lh + padY * 2 + 1;

    const drawHeader = () => {
      let cx = x;
      cols.forEach((c, i) => {
        headerCells[i].forEach((ln, li) => {
          const dx = c.align === 'right' ? c.pts - padX - ln.width : padX;
          this.drawBytes(ln.bytes, { x: cx + dx, top: this.y + padY + li * lh, size, bold: true, gray: GRAY_TEXT });
        });
        cx += c.pts;
      });
      this.y += headerH;
      this.rule(x, x + width, this.y, { width: 0.75, gray: 0.4 });
      this.y += 1;
    };

    if (caption) {
      this.ensure(size * 1.1 * LINE + headerH + lh * 2);
      this.drawBytes(toWinAnsi(caption), { x, top: this.y, size: size * 1.1, bold: true });
      this.y += size * 1.1 * LINE + 2;
    } else {
      this.ensure(headerH + lh * 2);
    }
    drawHeader();

    const body = rows.length ? rows : (emptyText ? [{ cells: [{ text: emptyText, gray: GRAY_TEXT }], span: true }] : []);
    for (const row of body) {
      const cellLines = cols.map((c, i) => {
        const raw = row.span ? (i === 0 ? row.cells[0] : '') : (row.cells[i] === undefined || row.cells[i] === null ? '' : row.cells[i]);
        const cell = typeof raw === 'object' ? raw : { text: String(raw) };
        const cw = row.span ? width - padX * 2 : c.pts - padX * 2;
        const bold = Boolean(row.bold || cell.bold);
        const main = wrap(cell.text, cw, size, bold).map((ln) => ({ ...ln, bold, gray: cell.gray || 0, size }));
        const sub = cell.sub ? wrap(cell.sub, cw, size * 0.9, false).map((ln) => ({ ...ln, bold: false, gray: GRAY_TEXT, size: size * 0.9 })) : [];
        return { lines: [...main, ...sub], align: c.align };
      });
      const rowH = Math.max(1, ...cellLines.map((cl) => cl.lines.length)) * lh + padY * 2;
      if (this.ensure(rowH)) drawHeader();
      if (row.ruleAbove) this.rule(x, x + width, this.y, { width: 0.75, gray: 0.4 });
      let cx = x;
      cols.forEach((c, i) => {
        const cl = cellLines[i];
        let ty = this.y + padY;
        for (const ln of cl.lines) {
          const dx = cl.align === 'right' ? c.pts - padX - ln.width : padX;
          this.drawBytes(ln.bytes, { x: cx + dx, top: ty, size: ln.size, bold: ln.bold, gray: ln.gray });
          ty += ln.size * LINE;
        }
        cx += c.pts;
      });
      this.y += rowH;
      this.rule(x, x + width, this.y, { width: 0.3, gray: GRAY_RULE });
    }
    this.y += after;
  }
}

// ---------------------------------------------------------------------------
// Serialiser
// ---------------------------------------------------------------------------

function serialize({ layout, info, lang }) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const infoObj = add(`<< /Title ${textString(info.title)} /Author ${textString('Paylight')} /Subject ${textString(info.subject)} /Creator ${textString('Paylight')} /Producer ${textString('Paylight')}${info.creationDate ? ` /CreationDate (${info.creationDate})` : ''} >>`);
  const kids = [];
  for (const page of layout.pages) {
    const stream = page.ops.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageNo = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(layout.pageW)} ${num(layout.pageH)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ProcSet [/PDF /Text] >> /Contents ${content} 0 R >>`);
    kids.push(`${pageNo} 0 R`);
  }
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  const langStr = /^[\x20-\x7e]*$/.test(lang) ? `(${lang.replace(/[()\\]/g, '\\$&')})` : textString(lang);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /Lang ${langStr} /ViewerPreferences << /DisplayDocTitle true >> >>`;

  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

// ---------------------------------------------------------------------------
// Document content
// ---------------------------------------------------------------------------

const dash = '—';

function kvRows(group) {
  return group.rows.map((r) => ({ label: r.label, lines: r.lines }));
}

function linesTable(ctx, L, cat) {
  const t = ctx.t;
  const rows = cat.lines.map((r) => ({
    cells: [
      { text: r.statutory ? `${r.label} (${r.statutory})` : r.label, sub: r.groupLabel || null },
      r.hours === null ? dash : r.hours,
      r.rate === null ? dash : r.rate,
      ctx.fmt.money(r.amountMinor),
      r.ytdMinor === null ? dash : ctx.fmt.money(r.ytdMinor),
    ],
  }));
  if (cat.subtotalMinor !== null) rows.push({ cells: [t('details.subtotal', { category: cat.label }), '', '', ctx.fmt.money(cat.subtotalMinor), ''], bold: true, ruleAbove: true });
  L.table({
    caption: cat.label,
    columns: [
      { label: t('details.col_description'), width: 0.42 },
      { label: t('details.col_hours'), width: 0.15, align: 'right' },
      { label: t('details.col_rate'), width: 0.15, align: 'right' },
      { label: t('details.col_amount'), width: 0.14, align: 'right' },
      { label: t('details.col_ytd'), width: 0.14, align: 'right' },
    ],
    rows,
    emptyText: t('export.no_rows'),
  });
}

function totalsTable(ctx, L, m) {
  const t = ctx.t;
  L.table({
    caption: t('export.totals'),
    columns: [{ label: t('export.totals'), width: 0.72 }, { label: t('details.col_amount'), width: 0.28, align: 'right' }],
    rows: m.totals.map((x) => ({
      cells: [`${x.label}${x.primary ? ` (${t('masthead.net_pay')})` : x.payable ? ` (${t('masthead.amount_paid')})` : ''}`, ctx.fmt.money(x.minor)],
      bold: x.prominent,
    })),
  });
}

function timeSection(ctx, L, m) {
  const t = ctx.t;
  const tm = m.time;
  if (!tm) return;
  L.heading(t('time.title'));
  if (tm.scheduleNote) L.paragraph(tm.scheduleNote, { size: 9 });
  L.table({
    caption: t('time.hours_summary'),
    columns: [{ label: t('common.type'), width: 0.7 }, { label: t('common.hours'), width: 0.3, align: 'right' }],
    rows: tm.summary.map((r) => ({ cells: [r.label, r.value] })),
  });
  if (tm.entries.length) {
    L.table({
      caption: t('time.entries_title'),
      columns: [
        { label: t('export.col_date'), width: 0.2 }, { label: t('export.col_type'), width: 0.16 },
        { label: t('export.col_start'), width: 0.1 }, { label: t('export.col_end'), width: 0.1 },
        { label: t('export.col_break_minutes'), width: 0.12, align: 'right' }, { label: t('common.hours'), width: 0.12, align: 'right' },
        { label: t('export.col_leave_type'), width: 0.2 },
      ],
      rows: tm.entries.map((e) => ({ cells: [e.dateText, e.typeLabel, e.start || dash, e.end || dash, e.breakMinutes === null ? dash : ctx.fmt.number(e.breakMinutes), e.hoursText, e.leaveTypeLabel || (e.holidayKey ? t('time.holiday') : dash)] })),
    });
  }
  if (tm.balances.length) {
    L.table({
      caption: t('time.balances_title'),
      columns: [
        { label: t('export.col_leave_type'), width: 0.2 }, { label: t('export.unit'), width: 0.1 },
        { label: t('export.balance_opening'), width: 0.11, align: 'right' }, { label: t('export.balance_accrued'), width: 0.11, align: 'right' },
        { label: t('export.balance_taken'), width: 0.11, align: 'right' }, { label: t('export.col_adjusted'), width: 0.11, align: 'right' },
        { label: t('export.balance_closing'), width: 0.11, align: 'right' }, { label: t('export.col_as_of'), width: 0.15 },
      ],
      rows: tm.balances.map((b) => ({ cells: [b.typeLabel, b.unitLabel, b.text(b.opening), b.text(b.accrued), b.text(b.taken), b.text(b.adjusted), b.text(b.closing), b.asOfText || dash] })),
    });
  }
}

function historySection(ctx, L, m) {
  const t = ctx.t;
  if (!m.history.length) return;
  L.heading(t('record.history_title'));
  L.paragraph(t('record.history_desc'), { size: 9, gray: GRAY_TEXT });
  L.table({
    columns: [
      { label: t('export.col_period'), width: 0.34 }, { label: t('export.col_pay_date'), width: 0.18 },
      { label: t('export.col_tax_year'), width: 0.14 }, { label: t('export.col_lines'), width: 0.12, align: 'right' },
      { label: m.history[0].netLabel, width: 0.22, align: 'right' },
    ],
    rows: m.history.map((p) => ({ cells: [p.periodText, p.payDateText || dash, p.taxYearLabel || dash, ctx.fmt.number(p.count), ctx.fmt.money(p.netMinor)] })),
  });
}

/**
 * Build the complete record as a searchable PDF. Returns the file bytes.
 */
export function buildPdf(ctx, { generatedAt = new Date().toISOString() } = {}) {
  const t = ctx.t;
  const m = recordModel(ctx, { generatedAt });
  const L = new Layout({ paper: ctx.doc.profile.paper });
  const continued = `${m.header} ${t('export.print_continued')}`;
  L.onNewPage = (lay) => {
    // running header on continuation pages
    lay.drawBytes(toWinAnsi(continued), { x: lay.left, top: MARGIN.top - 26, size: 8, gray: GRAY_TEXT });
    lay.rule(lay.left, lay.left + lay.width, MARGIN.top - 14, { width: 0.3 });
  };

  // Title block
  L.paragraph(m.header, { size: 16, bold: true, after: 2 });
  L.paragraph([m.employerName, m.employeeName].filter(Boolean).join(` ${dash} `), { size: 10.5, after: 1 });
  L.paragraph([`${t('masthead.reference')}: ${m.recordId}`, m.versionText, `${t('export.language')}: ${m.language}`].join(' · '), { size: 8.5, gray: GRAY_TEXT, after: 6 });
  if (m.constructed) {
    L.rule(L.left, L.left + L.width, L.y, { width: 0.75, gray: 0.4 });
    L.y += 4;
    L.paragraph(t('export.notice_constructed'), { size: 9, bold: true, after: 3 });
    L.rule(L.left, L.left + L.width, L.y, { width: 0.75, gray: 0.4 });
    L.y += 8;
  }

  // Particulars
  L.heading(t('record.particulars'));
  for (const g of [m.particulars.employer, m.particulars.employee, m.particulars.document, m.particulars.payment]) {
    if (!g.rows.length) continue;
    L.ensure(10.5 * LINE + 9 * LINE * 2);
    L.paragraph(g.title, { size: 10.5, bold: true, after: 2 });
    L.keyValues(kvRows(g));
  }

  // Lines by category, then totals
  L.heading(t('record.full_record'));
  for (const cat of m.categories) linesTable(ctx, L, cat);
  totalsTable(ctx, L, m);

  // Time and leave
  timeSection(ctx, L, m);

  // Disclosures
  L.heading(t('record.disclosures'));
  m.disclosures.forEach((d, i) => L.paragraph(`${i + 1}. ${d.text}${d.required ? ` [${t('common.required')}]` : ''}`, { size: 9, after: 3 }));

  // Policies referenced
  if (m.policies.length) {
    L.heading(t('record.policies'));
    for (const p of m.policies) L.paragraph(`• ${p.title}`, { size: 9, after: 1.5, indent: 0 });
    L.space(3);
  }

  // Provenance and lineage
  L.heading(t('record.provenance'));
  for (const line of m.provenance) L.paragraph(line, { size: 9, after: 2 });
  L.paragraph(t('record.version_lineage'), { size: 10, bold: true, after: 2 });
  for (const line of m.lineage) L.paragraph(line, { size: 9, after: 2 });
  L.space(2);

  // Prior periods
  historySection(ctx, L, m);

  // Notices, language and generation time
  L.space(4);
  L.rule(L.left, L.left + L.width, L.y, { width: 0.75, gray: 0.4 });
  L.y += 5;
  for (const n of m.notices) L.paragraph(n, { size: 9, bold: true, after: 2 });
  L.paragraph(`${t('export.language')}: ${m.language} · ${t('export.generated', { date: m.generatedText })}`, { size: 8.5, gray: GRAY_TEXT });

  // Footers (page n of N known only now)
  const total = L.pages.length;
  L.pages.forEach((page, i) => {
    const top = L.pageH - MARGIN.bottom + 14;
    L.rule(L.left, L.left + L.width, top - 4, { width: 0.3, page });
    const left = toWinAnsi(`${m.recordId} · ${m.versionText} · ${m.language} · ${t('export.generated', { date: m.generatedText })}`);
    const right = toWinAnsi(t('export.page_of', { page: i + 1, total }));
    const rw = textWidth(right, 7.5);
    L.drawBytes(left, { x: L.left, top, size: 7.5, gray: GRAY_TEXT, page });
    L.drawBytes(right, { x: L.left + L.width - rw, top, size: 7.5, gray: GRAY_TEXT, page });
  });

  return serialize({
    layout: L,
    lang: ctx.locale,
    info: { title: m.pdfTitle, subject: m.subject, creationDate: pdfDate(generatedAt) },
  });
}
