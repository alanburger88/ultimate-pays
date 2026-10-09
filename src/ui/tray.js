/**
 * Selection tray. A compact, fixed summary of the pay lines and time entries
 * the employee has selected, with review (tags, private notes, removal), Lumi
 * context, query creation and clearing.
 *
 * Amounts come from calc.js (sumLines) through amount(); labels from governed
 * content. Tags and notes live in interaction state only and never change the
 * issued record. The tray is re-rendered by the shell on every selection change.
 */
import { h, icon, announce, clear, append, uid } from '../app/dom.js';
import { registerStrings } from '../app/i18n.js';
import { sumLines } from '../app/calc.js';
import { amount, lineTitle, isNarrow } from './components/common.js';
import { openDialog, openSheet } from './components/overlay.js';

registerStrings({
  'select.cleared': 'Selection cleared.',
  'select.entries_title': 'Selected time entries',
  'select.remove_entry': 'Remove the entry for {date} from selection',
  'tags.removed': 'Tag removed from {line}',
});

/** Tag identifiers offered for a selected line. Labels are interface strings (tags.<id>). */
export const TAG_IDS = ['please_explain', 'hours_question', 'expected_different', 'missing_item', 'looks_right'];

export function tagLabel(ctx, tagId) {
  return tagId && TAG_IDS.includes(tagId) ? ctx.t(`tags.${tagId}`) : ctx.t('tags.none');
}

/** Time entries of the record matching the given ids (default: the current selection), in record order. */
export function selectedEntries(ctx, ids = null) {
  const wanted = ids || ctx.store.get().selection.entryIds || [];
  const entries = (ctx.doc.record.time && ctx.doc.record.time.entries) || [];
  return entries.filter((e) => wanted.includes(e.id));
}

/** Paid minutes of an entry formatted as hours. */
export function entryHours(ctx, entry) {
  const minutes = typeof entry.paidMinutes === 'number' ? entry.paidMinutes : (entry.type === 'work' ? entry.workedMinutes : entry.minutes) || 0;
  return ctx.fmt.minutesAsHours(minutes);
}

/** Governed label of an entry: entry type (or leave type) in the interface content. */
export function entryLabel(ctx, entry) {
  if (entry.type === 'leave' && entry.leaveType) return ctx.content.leaveType(entry.leaveType).label;
  return ctx.content.entryType(entry.type).label;
}

export function tagOptions(ctx, current) {
  return [
    h('option', { value: '', selected: !current ? true : null }, ctx.t('tags.none')),
    ...TAG_IDS.map((id) => h('option', { value: id, selected: current === id ? true : null }, ctx.t(`tags.${id}`))),
  ];
}

// Focus bookkeeping across shell re-renders (the host is cleared before renderTray runs).
let trayFocusKey = null;
let trayObserver = null;

function setTrayHeight(el) {
  const root = document.documentElement;
  if (trayObserver) { trayObserver.disconnect(); trayObserver = null; }
  if (!el) { root.style.removeProperty('--pl-tray-h'); return; }
  const measure = () => { if (el.isConnected) root.style.setProperty('--pl-tray-h', `${el.offsetHeight}px`); };
  requestAnimationFrame(measure);
  if (typeof ResizeObserver === 'function') { trayObserver = new ResizeObserver(measure); trayObserver.observe(el); }
}

function focusDropped() {
  return !document.activeElement || document.activeElement === document.body;
}

function focusMain() {
  const main = document.getElementById('pl-main');
  if (main) main.focus({ preventScroll: true });
}

/** Clear the selection and keep keyboard focus somewhere sensible once the tray disappears. */
export function clearSelection(ctx) {
  ctx.actions.clearSelection();
  announce(ctx.t('select.cleared'));
  requestAnimationFrame(() => { if (focusDropped()) focusMain(); });
}

/** Fixed selection tray. Returns null when nothing is selected. */
export function renderTray(ctx) {
  const t = ctx.t;
  const sel = ctx.store.get().selection;
  const lines = ctx.selectedLines();
  const entries = selectedEntries(ctx, sel.entryIds);
  const pendingKey = trayFocusKey;
  trayFocusKey = null;

  if (!lines.length && !entries.length) {
    setTrayHeight(null);
    if (pendingKey && focusDropped()) focusMain();
    return null;
  }

  const modules = ctx.modules();
  const el = h('div', {
    class: 'pl-tray', role: 'region', aria: { label: t('select.tray_label') },
    on: {
      focusin: (e) => { trayFocusKey = (e.target && e.target.dataset && e.target.dataset.focusKey) || null; },
      focusout: (e) => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) trayFocusKey = null; },
    },
  },
    h('div', { class: 'pl-tray-summary' },
      h('span', { class: 'count' },
        lines.length ? t('select.count', { count: lines.length }) : t('select.entries_count', { count: entries.length }),
        lines.length && entries.length ? h('small', null, t('select.entries_count', { count: entries.length })) : null,
      ),
      lines.length ? h('span', { class: 'pl-tray-total' }, h('span', { class: 'lbl' }, t('select.selected_total')), amount(ctx, sumLines(lines), { cls: 'val' })) : null,
      h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon pl-tray-clear', type: 'button', aria: { label: t('select.clear') }, title: t('select.clear'), dataset: { focusKey: 'tray-clear' }, on: { click: () => clearSelection(ctx) } }, icon('close')),
    ),
    h('div', { class: 'pl-tray-actions' },
      h('button', { class: 'pl-btn pl-btn-sm pl-btn-primary', type: 'button', dataset: { focusKey: 'tray-review' }, aria: { haspopup: 'dialog' }, on: { click: () => openReview(ctx) } }, icon('list', { size: 16 }), t('select.review')),
      modules.lumi ? h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'tray-lumi' }, aria: { haspopup: 'dialog' }, on: { click: () => ctx.actions.openLumi({ contextLineIds: ctx.store.get().selection.lineIds.slice() }) } }, icon('sparkle', { size: 16 }), t('select.ask_lumi')) : null,
      modules.queries ? h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'tray-query' }, aria: { haspopup: 'dialog' }, on: { click: () => { const s = ctx.store.get().selection; ctx.actions.openQuery({ lineIds: s.lineIds.slice(), entryIds: s.entryIds.slice() }); } } }, icon('send', { size: 16 }), t('select.create_query')) : null,
    ),
  );

  setTrayHeight(el);
  if (pendingKey && focusDropped()) {
    requestAnimationFrame(() => {
      if (!el.isConnected || !focusDropped()) return;
      const again = el.querySelector(`[data-focus-key="${pendingKey}"]`) || el.querySelector('button');
      if (again) again.focus({ preventScroll: true });
    });
  }
  return el;
}

function idsKey(sel) { return `${sel.lineIds.join(',')}|${sel.entryIds.join(',')}`; }

/** Review overlay: selected lines with tag chooser, private note and removal; selected time entries; actions. */
export function openReview(ctx) {
  const t = ctx.t;
  const host = h('div', { class: 'pl-tray-review stack' });
  const intro = h('p', { class: 'muted small pl-tray-review-intro', tabindex: '-1' }, t('tags.note_private'));
  let renderedKey = null;
  let pendingFocus = null; // { kind: 'line'|'entry', index }
  let unsub = null;
  let dlg = null;

  function lineItem(line, index, count) {
    const label = ctx.content.lineLabel(line);
    const sel = ctx.store.get().selection;
    const tagId = uid('tag');
    const noteId = uid('note');
    return h('li', { class: 'pl-tray-line', dataset: { lineId: line.id } },
      h('div', { class: 'pl-tray-line-head' },
        lineTitle(ctx, line),
        amount(ctx, line.amountMinor, { cls: 'pl-tray-line-amt' }),
        h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: t('select.remove_line', { line: label }) }, title: t('common.remove'), dataset: { focusKey: `remove-${line.id}` },
          on: { click: () => { pendingFocus = { kind: 'line', index: Math.min(index, count - 2) }; ctx.actions.deselect([line.id]); announce(t('select.line_deselected', { line: label })); } } }, icon('close', { size: 16 })),
      ),
      h('div', { class: 'pl-tray-line-fields' },
        h('div', { class: 'pl-field' },
          h('label', { for: tagId }, t('select.tag')),
          h('select', { class: 'pl-select', id: tagId, dataset: { focusKey: `tag-${line.id}` }, on: { change: (e) => { const v = e.target.value || null; ctx.actions.setTag(line.id, v); announce(v ? t('tags.applied', { line: label, tag: tagLabel(ctx, v) }) : t('tags.removed', { line: label })); } } }, tagOptions(ctx, sel.tags[line.id])),
        ),
        h('div', { class: 'pl-field' },
          h('label', { for: noteId }, t('tags.note_label')),
          h('textarea', { class: 'pl-textarea pl-textarea-sm', id: noteId, rows: 2, maxlength: 1000, placeholder: t('tags.note_placeholder'), dataset: { focusKey: `note-${line.id}` }, on: { change: (e) => ctx.actions.setNote(line.id, e.target.value) } }, sel.notes[line.id] || ''),
        ),
      ),
    );
  }

  function entryItem(entry, index, count) {
    const date = ctx.fmt.date(entry.date, 'weekday');
    return h('li', { class: 'pl-tray-entry', dataset: { entryId: entry.id } },
      h('span', { class: 'pl-tray-entry-main' }, h('span', { class: 'cell-main' }, date), h('span', { class: 'cell-sub' }, entryLabel(ctx, entry), entry.start && entry.end ? ` · ${t('time.entry_detail', { start: entry.start, end: entry.end })}` : '')),
      h('span', { class: 'tabular strong nowrap' }, entryHours(ctx, entry)),
      h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: t('select.remove_entry', { date }) }, title: t('common.remove'), dataset: { focusKey: `remove-entry-${entry.id}` },
        on: { click: () => { pendingFocus = { kind: 'entry', index: Math.min(index, count - 2) }; ctx.actions.toggleSelectEntry(entry.id); } } }, icon('close', { size: 16 })),
    );
  }

  function render() {
    const sel = ctx.store.get().selection;
    const lines = ctx.selectedLines();
    const entries = selectedEntries(ctx, sel.entryIds);
    renderedKey = idsKey(sel);
    clear(host);
    append(host, [
      intro,
      lines.length ? h('ul', { class: 'pl-tray-lines', aria: { label: t('select.review_title') } }, lines.map((line, i) => lineItem(line, i, lines.length))) : null,
      lines.length ? h('div', { class: 'pl-kv total' }, h('span', { class: 'k' }, t('select.selected_total')), amount(ctx, sumLines(lines), { cls: 'v' })) : null,
      entries.length ? h('div', { class: 'pl-tray-entries-block' }, h('h3', null, t('select.entries_title')), h('ul', { class: 'pl-tray-entries', aria: { label: t('select.entries_title') } }, entries.map((e, i) => entryItem(e, i, entries.length)))) : null,
    ]);
    if (pendingFocus) {
      const list = pendingFocus.kind === 'line' ? host.querySelectorAll('.pl-tray-line button.pl-btn-icon') : host.querySelectorAll('.pl-tray-entry button.pl-btn-icon');
      const target = list[Math.max(0, pendingFocus.index)] || host.querySelector('button, select, textarea') || intro;
      pendingFocus = null;
      target.focus({ preventScroll: true });
    }
  }

  const opener = isNarrow() ? openSheet : openDialog;
  dlg = opener({
    title: t('select.review_title'),
    closeLabel: t('common.close'),
    className: 'pl-tray-review-dialog',
    initialFocus: intro,
    body: () => { render(); return host; },
    actions: (api) => [
      ctx.modules().lumi ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { const ids = ctx.store.get().selection.lineIds.slice(); api.close('lumi'); ctx.actions.openLumi({ contextLineIds: ids }); } } }, icon('sparkle', { size: 16 }), t('select.ask_lumi')) : null,
      h('button', { class: 'pl-btn pl-btn-quiet', type: 'button', on: { click: () => { api.close('clear'); clearSelection(ctx); } } }, t('select.clear')),
      ctx.modules().queries ? h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { const s = ctx.store.get().selection; const lineIds = s.lineIds.slice(); const entryIds = s.entryIds.slice(); api.close('query'); ctx.actions.openQuery({ lineIds, entryIds }); } } }, icon('send', { size: 16 }), t('select.create_query')) : null,
      h('button', { class: 'pl-btn', type: 'button', on: { click: () => api.close('done') } }, t('common.done')),
    ].filter(Boolean),
    onClose: () => {
      if (unsub) { unsub(); unsub = null; }
      // The tray re-renders while the overlay is open, so the overlay's own focus restore may find its opener gone.
      requestAnimationFrame(() => {
        if (!focusDropped()) return;
        const again = document.querySelector('#pl-tray-host [data-focus-key="tray-review"]');
        if (again) again.focus({ preventScroll: true }); else focusMain();
      });
    },
  });

  unsub = ctx.store.subscribe((s) => {
    const sel = s.selection;
    if (!ctx.selectedLines().length && !selectedEntries(ctx, sel.entryIds).length) { dlg.close('empty'); return; }
    if (idsKey(sel) !== renderedKey) render();
  }, ['selection']);
  return dlg;
}
