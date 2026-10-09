/**
 * Pay details — every line of the statement, grouped by category, searchable,
 * sortable and selectable, with calculation disclosure, row actions and the
 * totals reconciliation. Desktop renders tables; narrow screens render
 * labelled, selectable cards that keep category, hours, rate, amount and YTD.
 *
 * Filter state lives in store.nav.filters { query, category, sort } and is
 * persisted by the shell. Money is only ever rendered through amount()/delta();
 * numbers only come from calc.js and the record. Governed text comes from
 * ctx.content.
 *
 * Contract: export function render(ctx) -> HTMLElement
 */
import { h, icon, announce, debounce, uid, replaceChildren } from '../../app/dom.js';
import { registerStrings } from '../../app/i18n.js';
import { sumLines, priorLines } from '../../app/calc.js';
import { amount, delta, lineTitle, notice, sectionHeader, isNarrow, emptyState, termButton } from '../components/common.js';
import { openSheet, openPopover, closePopover } from '../components/overlay.js';
import { calcIcon, calcSummary, hoursText, rateText, sensitiveText, textWithAmount } from '../calc-dialog.js';

registerStrings({
  'details.focus_outside_filter': 'Showing “{line}” because you navigated to it. It does not match the current filter.',
  'details.no_results_filter': 'No lines match the current filter.',
  'details.group_shown': '{shown} of {total} shown',
  'details.expand_row': 'Details for {line}',
  'details.tag_removed': 'Tag removed from {line}',
  'details.change_vs_prior': 'Change since {period}',
  'details.prior_amount': 'Prior period: {amount}',
  'details.no_prior_line': 'Not on the prior statement.',
  'details.open_line': 'Open {line}',
  'details.sort_reset': 'Statement order restored',
  'details.sorted': 'Sorted by {sort}',
});

const SORTS = ['default', 'amount_desc', 'amount_asc', 'name', 'change'];
const TAGS = ['please_explain', 'hours_question', 'expected_different', 'missing_item', 'looks_right'];

/** Expanded description panels survive re-renders (selection, filters). */
const expanded = new Set();
/** Caret position to restore in the search box after the shell re-renders the section. */
let pendingCaret = null;
/**
 * Cards replace the eight-column table below 1000px: the shared mobile rule
 * (isNarrow, ≤720px) plus the tablet band where the table cannot fit without
 * horizontal scrolling or hiding columns.
 */
const CARDS_QUERY = '(max-width: 999px)';
/** Language/width combinations where the table was measured too wide; cards are used there instead. */
const tooWide = new Set();
function fitKey(ctx) { return `${ctx.locale}|${window.innerWidth}`; }
function useCards(ctx) { return isNarrow() || (window.matchMedia && window.matchMedia(CARDS_QUERY).matches) || (ctx && tooWide.has(fitKey(ctx))); }

/** Current ctx so the module can re-render when the viewport crosses the card/table breakpoint. */
let liveCtx = null;
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia(CARDS_QUERY);
  const onChange = () => { if (liveCtx && liveCtx.store.get().nav.section === 'pay-details') liveCtx.store.update('nav', (n) => ({ ...n })); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function normaliseFilters(filters, categories, hasHistory) {
  const f = { query: '', category: 'all', sort: 'default', ...(filters || {}) };
  if (typeof f.query !== 'string') f.query = '';
  if (f.category !== 'all' && !categories.includes(f.category)) f.category = 'all';
  if (!SORTS.includes(f.sort) || (f.sort === 'change' && !hasHistory)) f.sort = 'default';
  return f;
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function sortRows(rows, sort, locale) {
  const out = rows.slice();
  switch (sort) {
    case 'amount_desc': out.sort((a, b) => b.line.amountMinor - a.line.amountMinor || a.idx - b.idx); break;
    case 'amount_asc': out.sort((a, b) => a.line.amountMinor - b.line.amountMinor || a.idx - b.idx); break;
    case 'name': out.sort((a, b) => a.label.localeCompare(b.label, locale) || a.idx - b.idx); break;
    case 'change': out.sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0) || a.idx - b.idx); break;
    default: out.sort((a, b) => a.idx - b.idx);
  }
  return out;
}

/** Categories in profile order, then any further categories the record uses; only those with lines. */
function categoriesOf(ctx) {
  const { record, profile } = ctx.doc;
  const cats = [...(profile.categoryOrder || [])];
  for (const l of record.lines) if (!cats.includes(l.category)) cats.push(l.category);
  return cats.filter((c) => record.lines.some((l) => l.category === c));
}

function buildModel(ctx, rawFilters, focusId) {
  const { record, content } = ctx.doc;
  const history = record.history || [];
  const prior = history[0] ? priorLines(history[0]) : null;
  const categories = categoriesOf(ctx);
  const filters = normaliseFilters(rawFilters, categories, Boolean(prior));
  const q = norm(filters.query.trim());
  const sel = ctx.store.get().selection;
  const highlights = record.highlights || [];
  const rows = record.lines.map((line, idx) => {
    const prev = prior ? prior.find((p) => p.id === line.id) || null : null;
    const statutory = line.statutoryKey ? content.statutory(line.statutoryKey) : null;
    return {
      line, idx, prev,
      change: prior ? line.amountMinor - (prev ? prev.amountMinor : 0) : null,
      isNew: prior ? !prev : false,
      label: content.lineLabel(line),
      plain: content.linePlain(line),
      statutory,
      selected: (sel.lineIds || []).includes(line.id),
      tag: (sel.tags || {})[line.id] || null,
      note: (sel.notes || {})[line.id] || null,
      highlights: highlights.filter((x) => x.lineId === line.id),
    };
  });
  const matches = (r) => {
    if (filters.category !== 'all' && r.line.category !== filters.category) return false;
    if (!q) return true;
    const hay = [r.label, r.plain, r.statutory && r.statutory.term, content.group(r.line.group), content.category(r.line.category)].filter(Boolean).map(norm).join('\n');
    return hay.includes(q);
  };
  let forced = null;
  const groups = categories.map((category) => {
    const all = rows.filter((r) => r.line.category === category);
    let shown = all.filter(matches);
    if (focusId && !shown.some((r) => r.line.id === focusId)) {
      const f = all.find((r) => r.line.id === focusId);
      if (f) { shown = [...shown, f]; forced = f; }
    }
    return { category, label: content.category(category), rows: sortRows(shown, filters.sort, ctx.locale), all, subtotal: sumLines(all.map((r) => r.line)) };
  });
  const shownCount = groups.reduce((s, g) => s + g.rows.length, 0);
  return {
    filters, categories, groups: groups.filter((g) => g.rows.length), shownCount, totalCount: rows.length, forced,
    hasHistory: Boolean(prior), priorPeriod: history[0] ? history[0].period : null,
    filtered: Boolean(q) || filters.category !== 'all',
  };
}

function setFilters(ctx, patch) {
  // Leaving the focused line behind: otherwise the shell re-scrolls and re-focuses it on every re-render.
  ctx.store.update('nav', (nav) => ({ ...nav, lineId: null, filters: { query: '', category: 'all', sort: 'default', ...(nav.filters || {}), ...patch } }));
}

function releaseLine(ctx) {
  ctx.store.update('nav', (nav) => (nav.lineId ? { ...nav, lineId: null } : nav));
}

function announceCount(ctx, filters) {
  announce(ctx.t('details.results', { count: buildModel(ctx, filters, null).shownCount }));
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx) {
  liveCtx = ctx;
  closePopover();
  const t = ctx.t;
  const nav = ctx.store.get().nav;
  const model = buildModel(ctx, nav.filters, nav.lineId);
  const narrow = useCards(ctx);
  const selected = ctx.selectedLines();
  if (!narrow) {
    // After layout, check that every table fits; long translations can make one wider than the page.
    requestAnimationFrame(() => {
      const over = Array.from(document.querySelectorAll('#pl-section-host .pl-dtable')).some((tbl) => tbl.parentElement && tbl.scrollWidth > tbl.parentElement.clientWidth + 1);
      if (over && liveCtx === ctx && ctx.store.get().nav.section === 'pay-details') { tooWide.add(fitKey(ctx)); ctx.store.update('nav', (n) => ({ ...n })); }
    });
  }

  const el = h('div', { class: 'stack-lg pl-details' },
    sectionHeader(ctx, t('details.title'), t('details.intro')),
    toolbar(ctx, model),
    statusRow(ctx, model, selected, narrow),
    model.shownCount === 0
      ? emptyState(model.filters.query.trim() ? t('details.no_results', { query: model.filters.query.trim() }) : t('details.no_results_filter'), clearButton(ctx, model))
      : model.groups.map((g) => groupSection(ctx, g, model, narrow)),
    totalsBlock(ctx),
  );
  return el;
}

// --- toolbar -----------------------------------------------------------------

function toolbar(ctx, model) {
  const t = ctx.t;
  const { filters } = model;
  const searchId = uid('dsearch');
  const sortId = uid('dsort');
  const catId = uid('dcat');

  const input = h('input', {
    class: 'pl-input', type: 'search', id: searchId, value: filters.query, placeholder: t('details.search_placeholder'),
    autocomplete: 'off', spellcheck: 'false', dataset: { focusKey: 'details-search' }, aria: { controls: 'details-results' },
  });
  const commit = debounce(() => {
    const query = input.value;
    pendingCaret = { value: query, start: input.selectionStart, end: input.selectionEnd };
    setFilters(ctx, { query });
    announceCount(ctx, { ...filters, query });
  }, 180);
  input.addEventListener('input', commit);
  input.addEventListener('focus', () => {
    if (pendingCaret && pendingCaret.value === input.value) { try { input.setSelectionRange(pendingCaret.start, pendingCaret.end); } catch (e) { /* unsupported input type */ } }
    pendingCaret = null;
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; commit(); } });

  const chips = h('div', { class: 'pl-dchips', role: 'group', aria: { labelledby: catId } },
    ['all', ...model.categories].map((cat) => h('button', {
      class: 'pl-chip', type: 'button', aria: { pressed: String(filters.category === cat) }, dataset: { focusKey: `details-cat-${cat}` },
      on: { click: () => { if (filters.category === cat) return; setFilters(ctx, { category: cat }); announceCount(ctx, { ...filters, category: cat }); } },
    }, cat === 'all' ? t('common.all') : ctx.content.category(cat))));

  const sortOptions = SORTS.filter((s) => s !== 'change' || model.hasHistory);
  const select = h('select', { class: 'pl-select', id: sortId, dataset: { focusKey: 'details-sort' }, on: { change: (e) => applySort(ctx, e.target.value) } },
    sortOptions.map((s) => h('option', { value: s, selected: s === filters.sort }, t(`details.sort_${s}`))));

  return h('div', { class: 'pl-card pl-dtoolbar', role: 'search', aria: { label: t('details.search_label') } },
    h('div', { class: 'pl-field pl-dsearch' }, h('label', { for: searchId }, t('details.search_label')), h('div', { class: 'pl-dsearch-wrap' }, icon('search', { size: 18 }), input)),
    h('div', { class: 'pl-field' }, h('span', { class: 'pl-label', id: catId }, t('details.filter_category')), chips),
    h('div', { class: 'pl-field pl-dsort' }, h('label', { for: sortId }, t('details.sort_by')), select),
  );
}

function applySort(ctx, sort) {
  if (!SORTS.includes(sort)) sort = 'default';
  setFilters(ctx, { sort });
  announce(sort === 'default' ? ctx.t('details.sort_reset') : ctx.t('details.sorted', { sort: ctx.t(`details.sort_${sort}`) }));
}

function clearButton(ctx, model) {
  if (!model.filtered) return null;
  return h('button', {
    class: 'pl-btn-link', type: 'button', dataset: { focusKey: 'details-clear' },
    on: { click: () => {
      const search = document.querySelector('[data-focus-key="details-search"]');
      if (search) search.focus({ preventScroll: true });
      setFilters(ctx, { query: '', category: 'all' });
      announceCount(ctx, { ...model.filters, query: '', category: 'all' });
    } },
  }, ctx.t('details.clear_filters'));
}

// --- status row --------------------------------------------------------------

function statusRow(ctx, model, selected, narrow) {
  const t = ctx.t;
  return h('div', { class: 'stack pl-dstatus' },
    h('div', { class: 'row-between' },
      h('p', { class: 'muted small', id: 'details-results' }, t('details.results', { count: model.shownCount })),
      selected.length ? textWithAmount(ctx, 'details.selected_sum', sumLines(selected), { tag: 'p', cls: 'pl-chip pl-chip-accent pl-dsum' }) : null,
    ),
    model.filtered ? notice(ctx, [t('details.filtered_notice'), ' ', clearButton(ctx, model)], { kind: 'info', iconName: 'filter' }) : null,
    model.forced ? notice(ctx, t('details.focus_outside_filter', { line: model.forced.label }), { kind: 'neutral' }) : null,
    narrow && model.shownCount ? h('p', { class: 'muted xs' }, t('details.mobile_card_hint')) : null,
  );
}

// --- groups ------------------------------------------------------------------

function groupSection(ctx, g, model, narrow) {
  const t = ctx.t;
  const hid = uid('dgroup');
  const count = g.rows.length < g.all.length
    ? t('details.group_shown', { shown: g.rows.length, total: g.all.length })
    : t('common.lines', { count: g.all.length });
  return h('section', { class: 'pl-dgroup', aria: { labelledby: hid }, dataset: { category: g.category } },
    h('div', { class: 'pl-dgroup-head row-between' }, h('h2', { id: hid }, g.label), h('span', { class: 'muted small' }, count)),
    g.category === 'employer' ? h('p', { class: 'muted small pl-dgroup-note' }, t('details.employer_note')) : null,
    g.category === 'noncash' ? h('p', { class: 'muted small pl-dgroup-note' }, t('details.noncash_note')) : null,
    narrow ? cardList(ctx, g, model) : lineTable(ctx, g, model),
  );
}

function lineTable(ctx, g, model) {
  const t = ctx.t;
  const { filters, hasHistory } = model;
  const cols = 7 + (hasHistory ? 1 : 0);
  return h('div', { class: 'pl-table-wrap' },
    h('table', { class: 'pl-table pl-dtable' },
      h('caption', { class: 'sr-only' }, g.label),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'col-check' }, h('span', { class: 'sr-only' }, t('details.col_select'))),
        sortableTh(ctx, filters, 'name', t('details.col_description'), 'col-desc'),
        h('th', { scope: 'col', class: 'num' }, t('details.col_hours')),
        h('th', { scope: 'col', class: 'num' }, t('details.col_rate')),
        sortableTh(ctx, filters, 'amount', t('details.col_amount'), 'num'),
        h('th', { scope: 'col', class: 'num' }, t('details.col_ytd')),
        hasHistory ? sortableTh(ctx, filters, 'change', t('details.col_change'), 'num') : null,
        h('th', { scope: 'col', class: 'col-actions' }, t('details.col_actions')),
      )),
      h('tbody', null, g.rows.map((r) => tableRow(ctx, r, model))),
      h('tfoot', null, h('tr', { class: 'subtotal' },
        h('th', { scope: 'row', colspan: 4 }, t('details.subtotal', { category: g.label })),
        h('td', { class: 'num' }, amount(ctx, g.subtotal)),
        h('td', { colspan: cols - 5 }),
      )),
    ));
}

const SORT_STATE = { name: { asc: 'name' }, amount: { desc: 'amount_desc', asc: 'amount_asc' }, change: { desc: 'change' } };

function sortableTh(ctx, filters, key, label, cls) {
  const t = ctx.t;
  const def = SORT_STATE[key];
  const state = filters.sort === def.asc ? 'ascending' : filters.sort === def.desc ? 'descending' : null;
  const next = () => {
    if (key === 'amount') return state === 'descending' ? 'amount_asc' : state === 'ascending' ? 'default' : 'amount_desc';
    return state ? 'default' : (def.asc || def.desc);
  };
  return h('th', { scope: 'col', class: cls, aria: { sort: state || 'none' } },
    h('button', { class: 'sort', type: 'button', dataset: { focusKey: `details-sort-${key}` }, on: { click: () => applySort(ctx, next()) } },
      label,
      icon(state === 'ascending' ? 'up' : state === 'descending' ? 'down' : 'sort', { size: 14 }),
      h('span', { class: 'sr-only' }, state ? t(state === 'ascending' ? 'a11y.sorted_asc' : 'a11y.sorted_desc') : t('a11y.sortable')),
    ));
}

function selectCheckbox(ctx, r) {
  return h('input', {
    type: 'checkbox', class: 'pl-rowcheck', checked: r.selected,
    aria: { label: `${ctx.t('details.col_select')}: ${r.label}` },
    dataset: { lineFocus: '', focusKey: `sel-${r.line.id}` },
    on: { change: () => { releaseLine(ctx); ctx.actions.toggleSelect(r.line.id); } },
  });
}

function lineChips(ctx, r) {
  const t = ctx.t;
  return [
    r.tag ? h('span', { class: 'pl-chip pl-chip-accent' }, icon('tag', { size: 12 }), t(`tags.${r.tag}`)) : null,
    r.highlights.map((x) => h('span', { class: 'pl-chip pl-chip-info' }, t(x.reasonKey))),
  ];
}

function changeCell(ctx, r, model) {
  if (r.change === null) return '—';
  return h('span', { class: 'pl-dchange' }, delta(ctx, r.change), r.isNew ? h('span', { class: 'pl-chip pl-chip-outline xs' }, ctx.t('common.new')) : null);
}

function tableRow(ctx, r, model) {
  const t = ctx.t;
  const { line } = r;
  const panelId = uid('dexp');
  const open = expanded.has(line.id);
  const panel = h('div', { class: 'pl-dexp', id: panelId, hidden: !open }, expandedContent(ctx, r, model));
  const toggle = h('button', {
    class: 'pl-btn-link xs pl-dexp-btn', type: 'button', dataset: { focusKey: `details-exp-${line.id}` },
    aria: { expanded: String(open), controls: panelId, label: t('details.expand_row', { line: r.label }) },
    on: { click: () => { const now = !expanded.has(line.id); if (now) expanded.add(line.id); else expanded.delete(line.id); panel.hidden = !now; toggle.setAttribute('aria-expanded', String(now)); } },
  }, icon('down', { size: 14 }), t('common.details'));
  const hours = hoursText(ctx, line);
  const rate = rateText(ctx, line);
  return h('tr', { dataset: { lineId: line.id }, aria: { selected: String(r.selected) }, class: [r.selected && 'is-selected'] },
    h('td', { class: 'col-check' }, selectCheckbox(ctx, r)),
    h('td', { class: 'col-desc' }, h('div', { class: 'pl-dline' }, lineTitle(ctx, line), lineChips(ctx, r)), toggle, panel),
    h('td', { class: 'num' }, hours === null ? '—' : hours),
    h('td', { class: 'num' }, rate === null ? '—' : rate.money ? sensitiveText(ctx, rate.text) : rate.text),
    h('td', { class: 'num' }, amount(ctx, line.amountMinor)),
    h('td', { class: 'num' }, typeof line.ytdMinor === 'number' ? amount(ctx, line.ytdMinor) : '—'),
    model.hasHistory ? h('td', { class: 'num' }, changeCell(ctx, r, model)) : null,
    h('td', { class: 'col-actions' }, rowActions(ctx, r)),
  );
}

function expandedContent(ctx, r, model) {
  const t = ctx.t;
  return [
    h('p', null, r.plain || t('common.not_available')),
    model.hasHistory ? h('p', { class: 'muted small pl-dexp-change' },
      `${t('details.change_vs_prior', { period: ctx.fmt.period(model.priorPeriod) })}: `, delta(ctx, r.change), ' ',
      r.prev ? h('span', null, '(', textWithAmount(ctx, 'details.prior_amount', r.prev.amountMinor), ')') : h('span', null, `(${t('details.no_prior_line')})`),
    ) : null,
    r.note ? h('p', { class: 'muted small' }, `${t('tags.note_label')}: ${r.note}`) : null,
  ];
}

function rowActions(ctx, r) {
  const t = ctx.t;
  const { line } = r;
  return h('div', { class: 'pl-dact' },
    h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: `details-calc-${line.id}` }, aria: { label: `${t('common.calculation')}: ${r.label}` }, on: { click: () => ctx.actions.openCalc(line.id) } }, calcIcon(16), h('span', { class: 'txt' }, t('common.calculation'))),
    h('button', { class: 'pl-btn pl-btn-sm pl-btn-quiet pl-btn-icon', type: 'button', dataset: { focusKey: `details-act-${line.id}` }, aria: { label: t('details.row_actions', { line: r.label }), haspopup: 'dialog', expanded: 'false' }, on: { click: (e) => openRowMenu(ctx, r, e.currentTarget) } }, moreIcon()),
  );
}

function moreIcon() {
  const svg = h('svg:svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'currentColor', stroke: 'none', class: 'pl-icon', 'aria-hidden': 'true', focusable: 'false' });
  for (const cx of [5, 12, 19]) svg.appendChild(h('svg:circle', { cx, cy: 12, r: 2 }));
  return svg;
}

/** Secondary row actions (desktop): Ask Lumi, view the shifts, define the term, tag. */
function openRowMenu(ctx, r, anchor) {
  const t = ctx.t;
  const { line } = r;
  const termKey = line.glossaryKey || (line.statutoryKey && ctx.content.glossary(line.statutoryKey) ? line.statutoryKey : null);
  const act = (fn) => { closePopover(); anchor.focus({ preventScroll: true }); fn(); };
  const item = (iconName, label, fn) => h('li', null, h('button', { type: 'button', on: { click: () => act(fn) } }, icon(iconName, { size: 18 }), label));
  const items = [
    item('zap', t('common.calculation'), () => ctx.actions.openCalc(line.id)),
    ctx.modules().lumi ? item('sparkle', t('details.explain_with_lumi'), () => ctx.actions.openLumi({ contextLineIds: [line.id] })) : null,
    line.timeEntryIds && line.timeEntryIds.length ? item('clock', t('details.view_time'), () => ctx.actions.showEntries(line.timeEntryIds)) : null,
    termKey ? item('help', t('common.define'), () => ctx.actions.openTerm(termKey, anchor)) : null,
    ctx.modules().queries ? item('send', t('select.create_query'), () => ctx.actions.openQuery({ lineIds: [line.id] })) : null,
  ].filter(Boolean);
  const body = h('div', { class: 'stack pl-dmenu' },
    h('ul', { class: 'pl-menu-list' }, items),
    tagChooser(ctx, r, { onChosen: () => { closePopover(); anchor.focus({ preventScroll: true }); } }),
  );
  openPopover({ anchor, title: t('details.row_actions', { line: r.label }), body, closeLabel: t('common.close') });
}

/** Tag chips for a line (tags.* keys). Applying a tag also selects the line so the tray and query flow include it. */
function tagChooser(ctx, r, { onChosen = null } = {}) {
  const t = ctx.t;
  const { line } = r;
  let current = (ctx.store.get().selection.tags || {})[line.id] || null;
  const chips = h('div', { class: 'row pl-dtags-row' });
  const render = () => {
    replaceChildren(chips,
      TAGS.map((tag) => h('button', { class: 'pl-chip', type: 'button', aria: { pressed: String(current === tag) }, on: { click: () => choose(tag) } }, t(`tags.${tag}`))),
      current ? h('button', { class: 'pl-chip pl-chip-outline', type: 'button', on: { click: () => choose(null) } }, icon('close', { size: 12 }), t('tags.remove')) : null,
    );
  };
  function choose(tag) {
    current = tag;
    releaseLine(ctx);
    ctx.actions.setTag(line.id, tag);
    if (tag) ctx.actions.select([line.id]);
    const msg = tag ? t('tags.applied', { line: r.label, tag: t(`tags.${tag}`) }) : t('details.tag_removed', { line: r.label });
    ctx.actions.toast(msg);
    announce(msg);
    render();
    if (onChosen) onChosen();
  }
  render();
  return h('div', { class: 'pl-dtags', role: 'group', aria: { label: t('details.tag_line') } }, h('span', { class: 'pl-label' }, t('details.tag_line')), chips);
}

// --- cards (narrow) ------------------------------------------------------------

function cardList(ctx, g, model) {
  return h('div', { class: 'pl-cards' }, g.rows.map((r) => lineCard(ctx, r, model)));
}

function lineCard(ctx, r, model) {
  const t = ctx.t;
  const { line } = r;
  const hours = hoursText(ctx, line);
  const rate = rateText(ctx, line);
  const open = () => openLineSheet(ctx, r, model);
  const card = h('article', {
    class: ['pl-line-card', 'pl-dcard', r.selected && 'is-selected'], dataset: { lineId: line.id },
    on: { click: (e) => { if (e.target.closest('button, input, a, [role="button"], summary')) return; open(); } },
  },
    h('div', { class: 'sel' }, selectCheckbox(ctx, r)),
    h('button', { class: 'body', type: 'button', aria: { haspopup: 'dialog' }, dataset: { focusKey: `details-open-${line.id}` }, on: { click: open } },
      h('span', { class: 'sr-only' }, `${t('details.open_line', { line: r.label })}. `),
      h('span', { class: 'title' }, r.label),
      r.statutory && r.statutory.term !== r.label ? h('span', { class: 'pl-statutory', lang: r.statutory.locale }, r.statutory.term) : null,
      h('span', { class: 'meta' },
        h('span', null, ctx.content.category(line.category)),
        hours !== null ? h('span', null, `${t('common.hours')}: ${hours}`) : null,
        rate !== null && !rate.money ? h('span', null, `${t('common.rate')}: ${rate.text}`) : null,
      ),
    ),
    h('div', { class: 'amounts' },
      amount(ctx, line.amountMinor, { cls: 'amt' }),
      h('span', { class: 'ytd' }, `${t('common.ytd_short')} `, typeof line.ytdMinor === 'number' ? amount(ctx, line.ytdMinor) : '—'),
      rate !== null && rate.money ? h('span', { class: 'ytd' }, `${t('common.rate')} `, sensitiveText(ctx, rate.text)) : null,
      model.hasHistory ? h('span', { class: 'chg' }, changeCell(ctx, r, model)) : null,
    ),
    (r.tag || r.highlights.length) ? h('div', { class: 'chips row' }, lineChips(ctx, r)) : null,
  );
  return card;
}

/** Bottom sheet for a line on narrow screens: plain language, calculation summary, tag and the same actions. */
function openLineSheet(ctx, r, model) {
  const t = ctx.t;
  const { line } = r;
  const termKey = line.glossaryKey || (line.statutoryKey && ctx.content.glossary(line.statutoryKey) ? line.statutoryKey : null);
  const hours = hoursText(ctx, line);
  const rate = rateText(ctx, line);
  const kv = (k, v) => h('div', { class: 'pl-kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
  const top = h('div', { class: 'row', tabindex: '-1' }, h('span', { class: 'pl-chip' }, ctx.content.category(line.category)), line.group ? h('span', { class: 'pl-chip pl-chip-outline' }, ctx.content.group(line.group)) : null, lineChips(ctx, r));
  const body = h('div', { class: 'stack pl-dsheet' },
    top,
    r.statutory && r.statutory.term !== r.label ? h('p', { class: 'pl-statutory', lang: r.statutory.locale }, `${t('details.statutory_term')}: ${r.statutory.term}`) : null,
    h('div', { class: 'pl-dsheet-facts' },
      kv(t('details.col_amount'), amount(ctx, line.amountMinor)),
      hours !== null ? kv(t('details.col_hours'), hours) : null,
      rate !== null ? kv(t('details.col_rate'), rate.money ? sensitiveText(ctx, rate.text) : rate.text) : null,
      kv(t('details.col_ytd'), typeof line.ytdMinor === 'number' ? amount(ctx, line.ytdMinor) : '—'),
      model.hasHistory ? kv(t('details.change_vs_prior', { period: ctx.fmt.period(model.priorPeriod) }), changeCell(ctx, r, model)) : null,
    ),
    h('section', null, h('h3', null, t('details.plain_language')), h('p', { class: 'small' }, r.plain || t('common.not_available'))),
    h('section', null, h('h3', null, t('details.calculation')), calcSummary(ctx, line)),
    termKey ? h('p', null, termButton(ctx, termKey)) : null,
    tagChooser(ctx, r),
    r.note ? h('p', { class: 'muted small' }, `${t('tags.note_label')}: ${r.note}`) : null,
  );
  openSheet({
    title: r.label,
    closeLabel: t('common.close'),
    className: 'pl-dsheet-dialog',
    body,
    initialFocus: top,
    actions: (dlg) => [
      h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.openCalc(line.id); } } }, calcIcon(16), t('common.calculation')),
      ctx.modules().lumi ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.openLumi({ contextLineIds: [line.id] }); } } }, icon('sparkle', { size: 16 }), t('details.explain_with_lumi')) : null,
      line.timeEntryIds && line.timeEntryIds.length ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.showEntries(line.timeEntryIds); } } }, icon('clock', { size: 16 }), t('details.view_time')) : null,
      ctx.modules().queries ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.openQuery({ lineIds: [line.id] }); } } }, icon('send', { size: 16 }), t('select.create_query')) : null,
    ].filter(Boolean),
  });
}

// --- totals ---------------------------------------------------------------------

function totalsBlock(ctx) {
  const t = ctx.t;
  const { profile, content, computed } = ctx.doc;
  const totals = computed.totals;
  const primary = profile.primaryTotal;
  const payable = profile.payableTotal || profile.primaryTotal;
  const hid = uid('dtotals');
  return h('section', { class: 'pl-card pl-dtotals', aria: { labelledby: hid } },
    h('h2', { id: hid }, t('details.totals_title')),
    h('ul', { class: 'pl-total-list' }, profile.totals.map((def) => {
      const isPrimary = def.id === primary;
      const isPayable = def.id === payable && payable !== primary;
      return h('li', { class: ['pl-total-row', def.prominent && 'is-prominent', isPrimary && 'is-primary', isPayable && 'is-payable'], dataset: { total: def.id } },
        h('div', { class: 'lbl' },
          h('span', { class: 'name' }, content.total(def.id),
            isPrimary ? h('span', { class: 'pl-chip pl-chip-accent' }, t('masthead.net_pay')) : null,
            isPayable ? h('span', { class: 'pl-chip pl-chip-positive' }, t('masthead.amount_paid')) : null),
          content.totalPlain(def.id) ? h('span', { class: 'plain muted small' }, content.totalPlain(def.id)) : null,
        ),
        amount(ctx, totals[def.id], { cls: 'val' }),
      );
    })),
    h('p', { class: 'muted small pl-dytd' }, t('details.ytd_basis', { basis: t(profile.taxYear.basisKey) })),
  );
}
