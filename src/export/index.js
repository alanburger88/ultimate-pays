/**
 * Retention outputs — entry points used by ctx.actions.
 *
 *   exportPdf(ctx)                     searchable PDF of the complete record
 *   exportXlsx(ctx, { selectedOnly })  typed .xlsx (complete record, or the named selected-lines extract)
 *   exportIcs(ctx)                     neutral calendar file of scheduled pay dates
 *   buildPrintView(ctx)                DOM tree for #pl-print-host (print.js)
 *
 * Files download through a Blob and a temporary <a download>. Every outcome is
 * reported truthfully: "download started" only after the browser accepted the
 * link, "export failed" on any error, and a plain explanation when there is
 * nothing to export.
 */
import { h, announce } from '../app/dom.js';
import { registerStrings } from '../app/i18n.js';
import { openDialog } from '../ui/components/overlay.js';
import { buildPdf } from './pdf.js';
import { buildXlsx } from './xlsx.js';
import { buildIcs, payDates } from './ics.js';
import { buildPrintView as printView } from './print.js';

registerStrings({
  'export.include_notes_title': 'Include your tags and notes?',
  'export.include_notes_body': 'Your tags and private notes stay on this device. You can add them to this extract as extra columns. By default they are left out.',
  'export.include_notes_yes': 'Include tags and notes',
  'export.include_notes_no': 'Lines only',
  'export.no_pay_dates': 'No scheduled pay dates are listed in this record, so there is nothing to add to a calendar.',
  'export.download_unsupported': 'This browser cannot save files from the page. Use Print to keep a copy.',
});

const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ics: 'text/calendar;charset=utf-8',
};

function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || 'paylight-export';
}

/** Hand bytes (or text) to the browser as a download. Returns false when the browser offers no way to do it. */
function download(data, filename, mime) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof document === 'undefined') return false;
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: safeFilename(filename), hidden: true, rel: 'noopener' });
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

function reportStarted(ctx) {
  ctx.actions.toast(ctx.t('record.download_started'), { kind: 'success' });
  announce(ctx.t('record.download_started'));
}

function reportFailed(ctx, err) {
  if (err && typeof console !== 'undefined' && console.error) console.error('Paylight export failed', err);
  ctx.actions.toast(ctx.t('record.export_failed'), { kind: 'error' });
  announce(ctx.t('record.export_failed'), { assertive: true });
}

function reportUnsupported(ctx) {
  ctx.actions.toast(ctx.t('export.download_unsupported'), { kind: 'error' });
  announce(ctx.t('export.download_unsupported'), { assertive: true });
}

/** Let the browser paint the busy state before a synchronous build. */
function nextFrame() {
  return new Promise((resolve) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve()); else resolve(); });
}

/**
 * Ask once whether the extract should carry the person's tags and private
 * notes. Resolves 'yes' | 'no' | 'cancel'. Not asked when the selection has
 * neither a tag nor a note (there would be nothing to include).
 */
function askIncludeNotes(ctx) {
  const t = ctx.t;
  return new Promise((resolve) => {
    let result = 'cancel';
    openDialog({
      title: t('export.include_notes_title'),
      body: h('p', null, t('export.include_notes_body')),
      closeLabel: t('common.close'),
      actions: (dlg) => [
        h('button', { class: 'pl-btn', type: 'button', on: { click: () => dlg.close('cancel') } }, t('common.cancel')),
        h('button', { class: 'pl-btn', type: 'button', on: { click: () => { result = 'yes'; dlg.close('yes'); } } }, t('export.include_notes_yes')),
        h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { result = 'no'; dlg.close('no'); } } }, t('export.include_notes_no')),
      ],
      onClose: () => resolve(result),
    });
  });
}

export async function exportPdf(ctx) {
  const t = ctx.t;
  try {
    await nextFrame();
    const bytes = buildPdf(ctx);
    const ok = download(bytes, t('export.filename_pdf', { id: ctx.doc.record.document.id }), MIME.pdf);
    if (ok) reportStarted(ctx); else reportUnsupported(ctx);
  } catch (err) {
    // Never alter a name or term to fit the PDF font: say so and offer Print, which keeps every character.
    if (err && err.code === 'pdf_charset') { ctx.actions.toast(t('export.pdf_unsupported_chars', { chars: err.chars.slice(0, 6).join(' ') }), { kind: 'error', duration: 10000, action: { label: t('record.print'), onClick: () => ctx.actions.print() } }); return; }
    reportFailed(ctx, err);
  }
}

export async function exportXlsx(ctx, { selectedOnly = false } = {}) {
  const t = ctx.t;
  const id = ctx.doc.record.document.id;
  try {
    let includeNotes = false;
    if (selectedOnly) {
      const selection = ctx.store.get().selection || { lineIds: [], tags: {}, notes: {} };
      const ids = (selection.lineIds || []).filter((lineId) => ctx.line(lineId));
      if (!ids.length) {
        ctx.actions.toast(t('query.no_lines'), { kind: 'info' });
        announce(t('query.no_lines'));
        return;
      }
      const hasPersonal = ids.some((lineId) => (selection.tags && selection.tags[lineId]) || (selection.notes && selection.notes[lineId]));
      if (hasPersonal) {
        const answer = await askIncludeNotes(ctx);
        if (answer === 'cancel') return;
        includeNotes = answer === 'yes';
      }
    }
    await nextFrame();
    const bytes = buildXlsx(ctx, { selectedOnly, includeNotes });
    const ok = download(bytes, t(selectedOnly ? 'export.filename_selected' : 'export.filename_xlsx', { id }), MIME.xlsx);
    if (ok) reportStarted(ctx); else reportUnsupported(ctx);
  } catch (err) {
    reportFailed(ctx, err);
  }
}

export function exportIcs(ctx) {
  const t = ctx.t;
  try {
    if (!payDates(ctx).length) {
      ctx.actions.toast(t('export.no_pay_dates'), { kind: 'info' });
      announce(t('export.no_pay_dates'));
      return;
    }
    const text = buildIcs(ctx);
    const ok = download(text, t('export.filename_ics', { id: ctx.doc.record.document.id }), MIME.ics);
    if (ok) reportStarted(ctx); else reportUnsupported(ctx);
  } catch (err) {
    reportFailed(ctx, err);
  }
}

export function buildPrintView(ctx) {
  return printView(ctx);
}
