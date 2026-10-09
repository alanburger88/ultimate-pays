/**
 * iCalendar export of the scheduled pay dates: one all-day VEVENT per entry in
 * record.time.upcomingPayDates with a neutral title and description. The file
 * carries no amounts and no identifiers; the UID is derived from the date only
 * ('<yyyymmdd>-paylight@local'), so the same schedule always yields the same
 * UIDs and re-imports update rather than duplicate.
 *
 * Contract: export function buildIcs(ctx, { now? }) -> string (CRLF line endings)
 */

/** RFC 5545 TEXT escaping. */
export function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (continuation lines start with a space). */
export function icsFold(line) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + limit);
    // never split inside a UTF-8 sequence
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((start ? ' ' : '') + dec.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return out.join('\r\n');
}

function compactDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

function nextDay(iso) {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/** Scheduled pay dates from the record (valid ISO dates only, in order, de-duplicated). */
export function payDates(ctx) {
  const list = (ctx.doc.record.time && ctx.doc.record.time.upcomingPayDates) || [];
  const seen = new Set();
  const out = [];
  for (const iso of list) {
    const key = compactDate(iso);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(iso).slice(0, 10));
  }
  return out;
}

export function buildIcs(ctx, { now = new Date() } = {}) {
  const t = ctx.t;
  const dtstamp = stamp(now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paylight//Pay dates//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const iso of payDates(ctx)) {
    const day = compactDate(iso);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${day}-paylight@local`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${nextDay(iso)}`,
      `SUMMARY:${icsEscape(t('export.ics_title'))}`,
      `DESCRIPTION:${icsEscape(t('export.ics_description'))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
