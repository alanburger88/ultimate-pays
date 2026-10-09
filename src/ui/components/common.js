/** Shared presentational pieces used across sections. */
import { h, icon } from '../../app/dom.js';
import { openPopover } from './overlay.js';
import { selectionSummary } from '../../app/calc.js';

/** A money amount element. Respects presentation privacy (blur until activated). */
export function amount(ctx, minor, { sign = 'auto', cls = '', currency = null, tag = 'span' } = {}) {
  const text = ctx.fmt.money(minor, { signDisplay: sign, currency });
  const el = h(tag, { class: ['pl-amount', 'tabular', cls], dataset: { minor } }, text);
  if (ctx.privacy()) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', ctx.t('a11y.amount_hidden'));
    const reveal = () => { el.classList.add('is-revealed'); el.removeAttribute('aria-label'); };
    el.addEventListener('click', reveal);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } });
  }
  return el;
}

/** Signed delta with colour and sign. */
export function delta(ctx, minor, { cls = '' } = {}) {
  const sign = minor > 0 ? 'positive' : minor < 0 ? 'negative' : 'muted';
  return amount(ctx, minor, { sign: 'exceptZero', cls: [sign, cls].join(' ') });
}

/** Glossary term button: tap/click/keyboard opens a definition popover. */
export function termButton(ctx, termKey, label = null, { statutory = true } = {}) {
  const entry = ctx.content.glossary(termKey);
  const text = label || (entry ? entry.term : termKey);
  if (!entry) return h('span', null, text);
  const btn = h('button', { class: 'pl-term', type: 'button', aria: { expanded: 'false', haspopup: 'dialog', label: ctx.t('glossary.define', { term: text }) } }, text);
  btn.addEventListener('click', () => openTerm(ctx, termKey, btn));
  return btn;
}

export function termIconButton(ctx, termKey) {
  const entry = ctx.content.glossary(termKey);
  if (!entry) return null;
  const btn = h('button', { class: 'pl-term-icon', type: 'button', aria: { expanded: 'false', haspopup: 'dialog', label: ctx.t('glossary.define', { term: entry.term }) } }, icon('help', { size: 16 }));
  btn.addEventListener('click', () => openTerm(ctx, termKey, btn));
  return btn;
}

export function openTerm(ctx, termKey, anchor) {
  const entry = ctx.content.glossary(termKey);
  if (!entry) return;
  const statutory = ctx.content.statutory(termKey);
  const body = h('div', { class: 'stack' },
    h('p', null, entry.short),
    entry.long ? h('p', { class: 'muted small' }, entry.long) : null,
    statutory && statutory.term !== entry.term ? h('p', { class: 'pl-statutory', lang: statutory.locale }, `${statutory.term} — ${ctx.t('glossary.statutory_note')}`) : null,
  );
  openPopover({ anchor, title: entry.term, body, closeLabel: ctx.t('glossary.close') });
}

/** Line title: governed label plus statutory term (original language) and a definition control when available. */
export function lineTitle(ctx, line, { withTerm = true, withStatutory = true } = {}) {
  const label = ctx.content.lineLabel(line);
  const statutory = withStatutory && line.statutoryKey ? ctx.content.statutory(line.statutoryKey) : null;
  const termKey = line.glossaryKey || (line.statutoryKey && ctx.content.glossary(line.statutoryKey) ? line.statutoryKey : null);
  return h('span', { class: 'pl-line-title' },
    h('span', { class: 'cell-main' }, label),
    withTerm && termKey ? termIconButton(ctx, termKey) : null,
    statutory && statutory.term !== label ? h('span', { class: 'cell-sub pl-statutory', lang: statutory.locale }, statutory.term) : null,
  );
}

export function notice(ctx, text, { kind = 'info', iconName = null } = {}) {
  const name = iconName || (kind === 'warn' ? 'warn' : kind === 'error' ? 'warn' : kind === 'success' ? 'check' : 'info');
  return h('div', { class: 'pl-notice', dataset: { kind }, role: kind === 'error' ? 'alert' : null }, icon(name), h('div', null, text));
}

export function kpi(ctx, { label, value, sub = null, size = '', cls = '' }) {
  return h('div', { class: ['pl-card pl-kpi', cls] }, h('span', { class: 'lbl' }, label), h('span', { class: ['val', size] }, value), sub ? h('span', { class: 'sub' }, sub) : null);
}

export function emptyState(text, action = null) {
  return h('div', { class: 'pl-empty' }, h('p', null, text), action);
}

export function sectionHeader(ctx, title, intro, actions = null) {
  return h('div', { class: 'pl-section-header row-between' }, h('div', null, h('h1', null, title), intro ? h('p', null, intro) : null), actions ? h('div', { class: 'pl-btn-group pl-section-actions' }, actions) : null);
}

/** Chart/table toggle wrapper. In low-data mode or when emphasis is 'table', the table is shown first. */
/** The employee's chart/table choice per chart, kept across re-renders and section changes for this page. */
const chartViewChoice = new Map();

export function chartWithTable(ctx, { chart, table, label, defaultView = null }) {
  const lowData = ctx.lowData();
  const emphasis = ctx.store.get().prefs.presentation.emphasis || 'balanced';
  const choiceKey = `${ctx.store.get().nav.section}|${label}`;
  let view = chartViewChoice.get(choiceKey) || defaultView || (lowData || emphasis === 'table' ? 'table' : 'chart');
  if (lowData) view = 'table';
  const host = h('div', { class: 'pl-chart-host' });
  const chartEl = h('div', { class: 'pl-chart-view' }, chart);
  const tableEl = h('div', { class: 'pl-chart-table' }, table);
  const toggle = lowData ? h('p', { class: 'muted xs' }, ctx.t('chart.low_data')) : h('div', { class: 'pl-seg', role: 'group', aria: { label } },
    h('button', { type: 'button', dataset: { focusKey: `${choiceKey}|chart` }, aria: { pressed: String(view === 'chart') }, on: { click: () => { chartViewChoice.set(choiceKey, 'chart'); set('chart'); } } }, icon('trend', { size: 16 }), ctx.t('common.chart')),
    h('button', { type: 'button', dataset: { focusKey: `${choiceKey}|table` }, aria: { pressed: String(view === 'table') }, on: { click: () => { chartViewChoice.set(choiceKey, 'table'); set('table'); } } }, icon('table', { size: 16 }), ctx.t('common.table')),
  );
  function set(v) {
    view = v;
    chartEl.hidden = v !== 'chart';
    tableEl.hidden = v !== 'table';
    if (toggle.querySelectorAll) toggle.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'chart' : 'table') === v)));
  }
  host.append(h('div', { class: 'row-between', style: { marginBottom: '8px' } }, h('span', { class: 'muted small' }, label), toggle), chartEl, tableEl);
  set(view);
  return host;
}

/** Simple data table from columns/rows. cols: [{key, label, num, render?}] */
export function dataTable(ctx, { caption = null, cols, rows, foot = null, compact = false, className = '' }) {
  const table = h('table', { class: ['pl-table', compact && 'pl-table-compact', className] },
    caption ? h('caption', null, caption) : null,
    h('thead', null, h('tr', null, cols.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', { dataset: r._data || null, class: r._class || null }, cols.map((c) => h('td', { class: c.num ? 'num' : null }, c.render ? c.render(r) : r[c.key]))))),
    foot ? h('tfoot', null, h('tr', null, cols.map((c) => h('td', { class: c.num ? 'num' : null }, foot[c.key] !== undefined ? foot[c.key] : '')))) : null,
  );
  return h('div', { class: 'pl-table-wrap' }, table);
}

/** Mobile detection shared by sections: cards under 720px. */
export function isNarrow() { return window.matchMedia('(max-width: 720px)').matches; }

/**
 * Totals for a set of selected lines. Earnings, deductions and employer contributions are never added
 * together: one total when every line shares a category, otherwise one subtotal per category.
 * Returns [{ label, minor }].
 */
export function selectionTotals(ctx, lines) {
  const sum = selectionSummary(lines);
  if (!sum.count) return [];
  if (sum.single) return [{ label: ctx.t('select.selected_total'), minor: sum.single.amount }];
  return sum.categories.map((c) => ({ label: ctx.content.category(c.category), minor: c.amount }));
}
