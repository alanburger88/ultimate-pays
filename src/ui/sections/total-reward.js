/**
 * Total reward — the value of the period beyond take-home pay: the reward total
 * and its composition, the explicit definition (with the annualised estimate
 * clearly marked), employer-funded benefits, and the contribution breakdown.
 *
 * Every number comes from ctx.doc.computed.reward (calc.js rewardSummary) or the
 * issued record and is rendered through amount(). Governed text (benefit labels,
 * line labels, plain-language notes) comes from ctx.content. Nothing here changes
 * the record; every control navigates to the lines or panel it summarises.
 *
 * Contract: export function render(ctx) -> HTMLElement
 */
import { h, icon, announce, debounce } from '../../app/dom.js';
import { registerStrings } from '../../app/i18n.js';
import { amount, kpi, sectionHeader, chartWithTable, dataTable, lineTitle, termButton, emptyState, isNarrow } from '../components/common.js';

registerStrings({
  'reward.estimate': 'Estimate',
  'reward.estimate_badge': 'Estimate — not an issued value',
  'reward.deductions_not_reward': 'Employee deductions this period',
  'reward.deductions_not_reward_note': 'Deducted from your pay. Not part of total reward and not included in the total above.',
  'reward.reimbursements_not_reward': 'Reimbursements this period',
  'reward.reimbursements_not_reward_note': 'Repaid expenses, not pay. Not part of total reward.',
  'reward.annualised_unavailable': 'No annual figure is shown. It would depend on extra payments and benefit rules that this statement does not supply.',
  'reward.component': 'Component',
  'reward.share': 'Share',
  'reward.subtotal': 'Subtotal',
  'reward.chart_hint': 'Select a segment to open its lines.',
  'reward.segment_label': '{component}: {amount}, {share}',
  'reward.open_cash_lines': 'Open earnings in Pay details',
  'reward.open_breakdown': 'Open the contribution breakdown',
  'reward.open_noncash': 'Open the non-cash lines',
  'reward.open_benefits': 'Open the employer-funded benefits',
  'reward.no_benefits': 'No employer-funded benefits are recorded on this statement.',
  'reward.no_employer_lines': 'No employer contribution lines on this statement.',
  'reward.no_noncash_lines': 'No non-cash benefit lines on this statement.',
  'reward.excluded_from_reward': 'Not included in total reward',
  'reward.employer_lines_title': 'Employer contribution lines',
  'reward.noncash_lines_title': 'Non-cash benefit lines',
  'reward.breakdown_desc': 'Every employer-paid and non-cash line on this statement, with its year-to-date value. These amounts are not deducted from your pay.',
  'reward.benefits_desc': 'What your employer pays towards each benefit this period, and what you pay where a share is deducted.',
  'reward.period_sub': 'Pay period {period}',
  'reward.go_to_line': 'Open {line}',
  'reward.benefit_lines': 'Benefit lines',
  'reward.no_lines_linked': 'No statement line is linked to this benefit.',
});

/** Fixed colour assignment per component: identity never depends on order or count. */
const COLOURS = { cash: 'var(--pl-chart-1)', employer: 'var(--pl-chart-4)', noncash: 'var(--pl-chart-5)', benefits: 'var(--pl-chart-6)' };
const COMPONENT_KEYS = { cash: 'reward.cash', employer: 'reward.employer', noncash: 'reward.noncash', benefits: 'reward.benefits' };
const CONTRIB_ID = 'reward-contrib';
const NONCASH_ID = 'reward-noncash';
const BENEFITS_ID = 'reward-benefits';

/** Re-render once when the viewport crosses the card/table breakpoint (debounced; no re-render on a transient flap). */
let liveCtx = null;
let renderedNarrow = null;
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(max-width: 720px)');
  const onChange = debounce(() => {
    if (!liveCtx || liveCtx.store.get().nav.section !== 'total-reward' || mq.matches === renderedNarrow) return;
    liveCtx.store.update('nav', (n) => ({ ...n }));
  }, 150);
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function buildModel(ctx) {
  const { record, profile, computed } = ctx.doc;
  const reward = computed.reward;
  const excluded = (l) => (l.flags || []).includes('exclude_from_reward');
  const employerLines = record.lines.filter((l) => l.category === 'employer');
  const noncashLines = record.lines.filter((l) => l.category === 'noncash');
  const total = reward.total;
  const components = reward.components.map((c) => ({
    ...c,
    label: ctx.t(COMPONENT_KEYS[c.id] || c.id),
    colour: COLOURS[c.id] || 'var(--pl-chart-neutral)',
    sharePermyriad: total ? Math.round((c.amount / total) * 10000) : 0,
  }));
  const sections = ctx.sections().map((s) => s.id);
  return {
    record, profile, reward, total, components,
    employerLines: employerLines.filter((l) => !excluded(l)),
    employerExcluded: employerLines.filter(excluded),
    noncashLines: noncashLines.filter((l) => !excluded(l)),
    noncashExcluded: noncashLines.filter(excluded),
    benefits: record.benefits || [],
    reimbursements: typeof computed.totals.reimbursements === 'number' ? computed.totals.reimbursements : null,
    has: (id) => sections.includes(id),
    period: ctx.fmt.period(record.document.period),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cardHeading(ctx, text, iconName, id, tag = 'h2') {
  return h(tag, { class: 'pl-rw-h2', id }, iconName ? icon(iconName) : null, h('span', null, text));
}

/** Open Pay details filtered to a category (search cleared so the lines are visible). */
function goToDetails(ctx, category = 'all', lineId = null) {
  ctx.store.update('nav', (nav) => {
    const filters = { query: '', category: 'all', sort: 'default', ...(nav.filters || {}) };
    return { ...nav, filters: { ...filters, category, query: '' } };
  });
  ctx.actions.go('pay-details', { push: true, lineId });
}

/** Move to a panel inside this section: scroll it into view and give it focus (it is a landmark with tabindex -1). */
function goToPanel(ctx, id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  const heading = el.querySelector('h2, h3');
  if (heading) announce(heading.textContent);
}

/** The action a composition component links to, or null when its target is not on this statement. */
function componentAction(ctx, m, id) {
  switch (id) {
    case 'cash': return m.has('pay-details') ? { label: ctx.t('reward.open_cash_lines'), run: () => goToDetails(ctx, 'earning') } : null;
    case 'employer': return { label: ctx.t('reward.open_breakdown'), run: () => goToPanel(ctx, CONTRIB_ID) };
    case 'noncash': return { label: ctx.t('reward.open_noncash'), run: () => goToPanel(ctx, NONCASH_ID) };
    case 'benefits': return { label: ctx.t('reward.open_benefits'), run: () => goToPanel(ctx, BENEFITS_ID) };
    default: return null;
  }
}

function lineButton(ctx, line, { focusKey = null, cls = 'pl-btn-link' } = {}) {
  const label = ctx.content.lineLabel(line);
  return h('button', { class: cls, type: 'button', dataset: { focusKey: focusKey || `reward-line-${line.id}` }, aria: { label: ctx.t('reward.go_to_line', { line: label }) }, on: { click: () => ctx.actions.focusLine(line.id) } }, label);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx) {
  liveCtx = ctx;
  renderedNarrow = isNarrow();
  const t = ctx.t;
  const m = buildModel(ctx);
  return h('div', { class: 'stack-lg pl-reward' },
    sectionHeader(ctx, t('reward.title'), t('reward.intro')),
    kpiBlock(ctx, m),
    compositionBlock(ctx, m),
    definitionBlock(ctx, m),
    benefitsBlock(ctx, m),
    breakdownBlock(ctx, m),
  );
}

// --- KPI row ------------------------------------------------------------------

function kpiBlock(ctx, m) {
  const t = ctx.t;
  const { reward, profile } = m;
  // Named after the record's own net total: in some jurisdictions net still includes non-cash items, so it is not 'take-home'.
  const netName = ctx.content.total(ctx.doc.profile.primaryTotal) || t('reward.take_home');
  const netLabel = ctx.content.glossary('net_pay') ? termButton(ctx, 'net_pay', netName) : netName;
  return h('div', { class: 'pl-rw-kpis' },
    kpi(ctx, { label: t('reward.total'), value: amount(ctx, reward.total), sub: t('reward.period_sub', { period: m.period }), size: 'big', cls: 'pl-card-accent pl-rw-kpi pl-rw-kpi-total' }),
    kpi(ctx, { label: netLabel, value: amount(ctx, reward.net), sub: ctx.content.totalPlain(profile.primaryTotal) || null, cls: 'pl-rw-kpi' }),
  );
}

// --- Composition ------------------------------------------------------------------

function compositionBlock(ctx, m) {
  const t = ctx.t;
  const id = 'reward-composition-h';
  if (!m.components.length || !(m.total > 0)) {
    return h('section', { class: 'pl-card', aria: { labelledby: id } },
      cardHeading(ctx, t('reward.composition_title'), 'gift', id),
      h('p', { class: 'muted' }, t('chart.no_data')));
  }
  const chart = compositionChart(ctx, m);
  const table = compositionTable(ctx, m);
  return h('section', { class: 'pl-card pl-rw-composition', aria: { labelledby: id } },
    cardHeading(ctx, t('reward.composition_title'), 'gift', id),
    h('p', { class: 'muted small' }, t('reward.composition_desc')),
    chartWithTable(ctx, { chart, table, label: t('reward.composition_title') }),
  );
}

/** Stacked horizontal bar. Each segment is a keyboard-operable link to its lines; legend repeats identity in text. */
function compositionChart(ctx, m) {
  const t = ctx.t;
  const H = 56; const BAR_Y = 8; const BAR_H = 40;
  // Percentage geometry (no viewBox) so text is never stretched; a surface-coloured stroke gives the 2px gap between fills.
  const svg = h('svg:svg', { class: 'pl-chart pl-rw-bar', width: '100%', height: H, role: 'group', 'aria-label': t('reward.composition_title'), focusable: 'false' });
  const sr = h('p', { class: 'sr-only' }, t('chart.alt_composition', { total: ctx.fmt.money(m.total) }));
  const labelled = [];
  let x = 0;
  m.components.forEach((c) => {
    const w = Math.max(0, (c.amount / m.total) * 100);
    const action = componentAction(ctx, m, c.id);
    const label = t('reward.segment_label', { component: c.label, amount: ctx.fmt.money(c.amount), share: t('reward.share_of_total', { percent: ctx.fmt.percent(c.sharePermyriad, 1) }) });
    const inner = h('svg:svg', { x: `${x}%`, y: 0, width: `${w}%`, height: H, overflow: 'visible' },
      h('svg:rect', { x: 0, y: BAR_Y, width: '100%', height: BAR_H, rx: 4, ry: 4, style: `fill:${c.colour}` }),
      h('svg:text', { x: 12, y: BAR_Y + BAR_H / 2, class: 'seg-lbl', 'dominant-baseline': 'central', 'aria-hidden': 'true', style: 'display:none' }, ctx.fmt.percent(c.sharePermyriad, 0)));
    labelled.push([inner, w]);
    const g = h('svg:g', { class: ['hit', 'seg', `seg-${c.id}`], dataset: { component: c.id } }, h('svg:title', null, label), inner);
    if (action) {
      g.setAttribute('role', 'link'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', `${label}. ${action.label}`);
      g.dataset.focusKey = `reward-seg-${c.id}`;
      g.addEventListener('click', action.run);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action.run(); } });
    } else { g.setAttribute('role', 'img'); g.setAttribute('aria-label', label); }
    svg.appendChild(g);
    x += w;
  });
  // Show a segment's in-bar percentage only when the segment is wide enough to hold it (measured, re-measured on resize).
  // Hidden labels use display:none so they never extend the chart's box (visibility:hidden still occupies layout).
  const fit = () => { const total = svg.getBoundingClientRect().width; for (const [inner, w] of labelled) { const text = inner.querySelector('text'); text.style.display = (total * w) / 100 >= 52 ? '' : 'none'; } };
  requestAnimationFrame(fit);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(svg);
  // Legend: text identity (never colour alone) with amount and share; each item is the same link as its segment.
  const legend = h('ul', { class: 'pl-chart-legend pl-rw-legend', aria: { label: t('chart.legend') } }, m.components.map((c) => {
    const action = componentAction(ctx, m, c.id);
    const body = [h('span', { class: 'sw', style: `background:${c.colour}`, aria: { hidden: 'true' } }), h('span', { class: 'lbl' }, c.label), h('span', { class: 'row2' }, amount(ctx, c.amount, { cls: 'amt' }), h('span', { class: 'share' }, t('reward.share_of_total', { percent: ctx.fmt.percent(c.sharePermyriad, 1) })))];
    return h('li', null, action
      ? h('button', { class: 'pl-rw-legend-btn', type: 'button', dataset: { focusKey: `reward-legend-${c.id}` }, aria: { label: `${c.label}. ${action.label}` }, on: { click: action.run } }, body, icon('forward', { size: 14 }))
      : h('span', { class: 'pl-rw-legend-btn' }, body));
  }));
  const animate = !ctx.reducedMotion();
  if (animate) { svg.classList.add('is-animated'); requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('is-in'))); }
  return h('div', { class: 'pl-rw-chart' }, sr, h('div', { class: 'pl-rw-bar-wrap' }, svg), legend, h('p', { class: 'muted xs' }, t('reward.chart_hint')));
}

function compositionTable(ctx, m) {
  const t = ctx.t;
  const narrow = isNarrow();
  const compCol = { key: 'component', label: t('reward.component'), render: (r) => {
    const action = componentAction(ctx, m, r.id);
    return action ? h('button', { class: 'pl-btn-link pl-rw-tbl-link', type: 'button', aria: { label: `${r.label}. ${action.label}` }, on: { click: action.run } }, r.label) : r.label;
  } };
  const share = (r) => ctx.fmt.percent(r.sharePermyriad, 1);
  const cols = narrow
    ? [compCol, { key: 'amount', label: `${t('common.amount')} · ${t('reward.share')}`, num: true, render: (r) => h('span', { class: 'pl-rw-cell' }, amount(ctx, r.amount), h('span', { class: 'muted xs' }, share(r))) }]
    : [compCol, { key: 'amount', label: t('common.amount'), num: true, render: (r) => amount(ctx, r.amount) }, { key: 'share', label: t('reward.share'), num: true, render: share }];
  const foot = narrow
    ? { component: t('reward.total'), amount: h('span', { class: 'pl-rw-cell' }, amount(ctx, m.total), h('span', { class: 'muted xs' }, ctx.fmt.percent(10000, 1))) }
    : { component: t('reward.total'), amount: amount(ctx, m.total), share: ctx.fmt.percent(10000, 1) };
  return dataTable(ctx, { caption: t('reward.composition_table'), cols, rows: m.components, foot, compact: true, className: 'pl-rw-table' });
}

// --- Definition ---------------------------------------------------------------------

function definitionBlock(ctx, m) {
  const t = ctx.t;
  const { reward } = m;
  const id = 'reward-definition-h';
  const annual = reward.annualised !== null && reward.periodsPerYear
    ? h('div', { class: 'pl-rw-annual', role: 'group', aria: { labelledby: 'reward-annual-h' } },
      h('div', { class: 'pl-rw-annual-head' },
        h('h3', { id: 'reward-annual-h', class: 'pl-rw-h3' }, t('reward.annualised')),
        h('span', { class: 'pl-chip pl-chip-warn' }, icon('info', { size: 14 }), t('reward.estimate'))),
      amount(ctx, reward.annualised, { cls: 'pl-rw-annual-amt' }),
      h('p', { class: 'muted small' }, t('reward.annualised_note', { count: reward.periodsPerYear })),
      h('p', { class: 'muted xs' }, t('reward.estimate_badge')))
    : h('div', { class: 'pl-rw-annual' },
      h('h3', { class: 'pl-rw-h3' }, t('reward.annualised')),
      h('p', { class: 'muted small' }, t('reward.annualised_unavailable')));
  const exclusions = h('ul', { class: 'pl-rw-exclusions' },
    h('li', null,
      h('span', { class: 'txt' }, h('span', { class: 'lbl' }, t('reward.deductions_not_reward')), h('span', { class: 'note' }, t('reward.deductions_not_reward_note'))),
      amount(ctx, reward.employeeDeductions, { cls: 'amt' })),
    m.reimbursements !== null && m.reimbursements !== 0 ? h('li', null,
      h('span', { class: 'txt' }, h('span', { class: 'lbl' }, t('reward.reimbursements_not_reward')), h('span', { class: 'note' }, t('reward.reimbursements_not_reward_note'))),
      amount(ctx, m.reimbursements, { cls: 'amt' })) : null,
  );
  return h('section', { class: 'pl-card pl-rw-definition', aria: { labelledby: id } },
    cardHeading(ctx, t('reward.definition_title'), 'info', id),
    h('div', { class: 'pl-rw-def-grid' },
      h('div', { class: 'pl-rw-def-text' },
        h('p', { class: 'pl-rw-def' }, t(reward.definitionKey)),
        exclusions),
      annual),
  );
}

// --- Employer-funded benefits -------------------------------------------------------------

function benefitsBlock(ctx, m) {
  const t = ctx.t;
  const id = 'reward-benefits-h';
  const body = m.benefits.length
    ? h('div', { class: 'pl-rw-benefits' }, m.benefits.map((b) => benefitCard(ctx, m, b)))
    : emptyState(t('reward.no_benefits'));
  return h('section', { class: 'pl-card pl-rw-benefits-card', id: BENEFITS_ID, tabindex: '-1', aria: { labelledby: id } },
    cardHeading(ctx, t('reward.benefits_title'), 'shield', id),
    m.benefits.length ? h('p', { class: 'muted small' }, t('reward.benefits_desc')) : null,
    body,
  );
}

function benefitCard(ctx, m, b) {
  const t = ctx.t;
  const c = ctx.content.benefit(b.key);
  const lines = (b.lineIds || []).map((lid) => ctx.line(lid)).filter(Boolean);
  const hid = `reward-benefit-${b.id}-h`;
  return h('article', { class: 'pl-rw-benefit', dataset: { benefit: b.id }, aria: { labelledby: hid } },
    h('div', { class: 'head' },
      h('h3', { id: hid, class: 'pl-rw-h3' }, c.label || b.key),
      b.cash === false ? h('span', { class: 'pl-chip pl-chip-info' }, t('reward.not_cash')) : null),
    c.plain ? h('p', { class: 'muted small plain' }, c.plain) : null,
    h('dl', { class: 'pl-rw-benefit-amts' },
      h('div', { class: 'pair employer' }, h('dt', null, t('reward.employer_pays')), h('dd', null, amount(ctx, b.employerAmountMinor || 0))),
      b.employeeAmountMinor > 0 ? h('div', { class: 'pair you' }, h('dt', null, t('reward.you_pay')), h('dd', null, amount(ctx, b.employeeAmountMinor))) : null),
    lines.length
      ? h('div', { class: 'lines' },
        h('span', { class: 'muted xs' }, t('reward.benefit_lines')),
        h('ul', { class: 'pl-rw-benefit-lines' }, lines.map((line) => h('li', null,
          lineButton(ctx, line, { focusKey: `reward-benefit-${b.id}-${line.id}`, cls: 'pl-btn-link pl-rw-benefit-link' }),
          h('span', { class: 'muted xs cat' }, ctx.content.category(line.category))))))
      : h('p', { class: 'muted xs' }, t('reward.no_lines_linked')),
  );
}

// --- Contribution breakdown ---------------------------------------------------------------

function breakdownBlock(ctx, m) {
  const t = ctx.t;
  const id = 'reward-contrib-h';
  return h('section', { class: 'pl-card pl-rw-breakdown', id: CONTRIB_ID, tabindex: '-1', aria: { labelledby: id } },
    cardHeading(ctx, t('reward.contribution_breakdown'), 'building', id),
    h('p', { class: 'muted small' }, t('reward.breakdown_desc')),
    h('div', { class: 'stack' },
      linesGroup(ctx, m, { id: 'reward-employer', title: t('reward.employer_lines_title'), lines: m.employerLines, excluded: m.employerExcluded, subtotal: m.reward.employer, empty: t('reward.no_employer_lines'), note: t('details.employer_note'), chip: null }),
      linesGroup(ctx, m, { id: NONCASH_ID, title: t('reward.noncash_lines_title'), lines: m.noncashLines, excluded: m.noncashExcluded, subtotal: m.reward.noncash, empty: t('reward.no_noncash_lines'), note: t('details.noncash_note'), chip: t('reward.not_cash') }),
    ),
  );
}

function linesGroup(ctx, m, { id, title, lines, excluded, subtotal, empty, note, chip }) {
  const t = ctx.t;
  const hid = `${id}-h`;
  const all = [...lines.map((l) => ({ line: l, excluded: false })), ...excluded.map((l) => ({ line: l, excluded: true }))];
  let body;
  if (!all.length) body = h('p', { class: 'muted small' }, empty);
  else if (isNarrow()) body = linesCards(ctx, all, { subtotal, chip });
  else body = linesTable(ctx, all, { subtotal, chip, caption: title });
  return h('div', { class: 'pl-rw-group', id, tabindex: '-1', aria: { labelledby: hid } },
    h('div', { class: 'row-between pl-rw-group-head' }, h('h3', { id: hid, class: 'pl-rw-h3' }, title), chip && all.length ? h('span', { class: 'pl-chip pl-chip-info' }, chip) : null),
    all.length ? h('p', { class: 'muted xs' }, note) : null,
    body,
  );
}

function linesTable(ctx, rows, { subtotal, chip, caption }) {
  const t = ctx.t;
  const ytdLabel = ctx.content.glossary('ytd') ? termButton(ctx, 'ytd', t('common.ytd')) : t('common.ytd');
  const table = h('table', { class: 'pl-table pl-table-compact pl-rw-lines' },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('common.description')),
      h('th', { scope: 'col', class: 'num' }, t('common.amount')),
      h('th', { scope: 'col', class: 'num' }, ytdLabel))),
    h('tbody', null, rows.map(({ line, excluded }) => h('tr', { dataset: { lineId: line.id }, class: [excluded && 'is-excluded'] },
      h('th', { scope: 'row' },
        h('button', { class: 'pl-rw-line-btn', type: 'button', dataset: { lineFocus: '', focusKey: `reward-line-${line.id}` }, aria: { label: t('reward.go_to_line', { line: ctx.content.lineLabel(line) }) }, on: { click: () => ctx.actions.focusLine(line.id) } }, lineTitle(ctx, line, { withTerm: false }), icon('forward', { size: 14 })),
        line.glossaryKey || line.statutoryKey ? termIcon(ctx, line) : null,
        excluded ? h('span', { class: 'pl-chip pl-chip-outline' }, t('reward.excluded_from_reward')) : null),
      h('td', { class: 'num' }, amount(ctx, line.amountMinor)),
      h('td', { class: 'num' }, typeof line.ytdMinor === 'number' ? amount(ctx, line.ytdMinor) : h('span', { class: 'muted' }, '—')),
    ))),
    h('tfoot', null, h('tr', { class: 'subtotal' }, h('td', null, t('reward.subtotal')), h('td', { class: 'num' }, amount(ctx, subtotal)), h('td', { class: 'num' }, ''))),
  );
  return h('div', { class: 'pl-table-wrap' }, table);
}

function termIcon(ctx, line) {
  const key = line.glossaryKey || line.statutoryKey;
  const entry = ctx.content.glossary(key);
  if (!entry) return null;
  const btn = h('button', { class: 'pl-term-icon', type: 'button', aria: { expanded: 'false', haspopup: 'dialog', label: ctx.t('glossary.define', { term: entry.term }) } }, icon('help', { size: 16 }));
  btn.addEventListener('click', () => ctx.actions.openTerm(key, btn));
  return btn;
}

function linesCards(ctx, rows, { subtotal, chip }) {
  const t = ctx.t;
  return h('div', { class: 'pl-cards pl-rw-cards' },
    rows.map(({ line, excluded }) => h('div', { class: ['pl-line-card', 'pl-rw-card', excluded && 'is-excluded'], dataset: { lineId: line.id } },
      h('div', { class: 'body' },
        h('button', { class: 'pl-rw-line-btn title', type: 'button', dataset: { lineFocus: '', focusKey: `reward-line-${line.id}` }, aria: { label: t('reward.go_to_line', { line: ctx.content.lineLabel(line) }) }, on: { click: () => ctx.actions.focusLine(line.id) } }, lineTitle(ctx, line, { withTerm: false }), icon('forward', { size: 14 })),
        h('div', { class: 'meta' },
          h('span', null, ctx.content.category(line.category)),
          chip ? h('span', { class: 'pl-chip pl-chip-info' }, chip) : null,
          excluded ? h('span', { class: 'pl-chip pl-chip-outline' }, t('reward.excluded_from_reward')) : null,
          line.glossaryKey || line.statutoryKey ? termIcon(ctx, line) : null)),
      h('div', { class: 'nums' },
        amount(ctx, line.amountMinor, { cls: 'amt' }),
        typeof line.ytdMinor === 'number' ? h('span', { class: 'ytd' }, t('common.ytd_short'), ' ', amount(ctx, line.ytdMinor)) : null),
    )),
    h('div', { class: 'pl-rw-card-subtotal' }, h('span', null, t('reward.subtotal')), amount(ctx, subtotal, { cls: 'amt' })),
  );
}
