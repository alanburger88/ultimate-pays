/**
 * My pay — the current period at a glance: net pay, gross, deductions and the
 * amount paid; the payment line; separate payment adjustments; pinned
 * summaries; what moved since the last pay; what is worth a look; the
 * gross-to-net flow; employer contributions; the pay story; reconciliation.
 *
 * Every number comes from ctx.doc.computed (calc.js) or the issued record and
 * is rendered through amount()/delta(). Governed text comes from ctx.content.
 * Nothing here changes the record; every control navigates to the lines or
 * section it summarises.
 *
 * Contract: export function render(ctx) -> HTMLElement
 */
import { h, icon, debounce } from '../../app/dom.js';
import { registerStrings } from '../../app/i18n.js';
import { lineEffect, grossYearToDate, varianceBridge } from '../../app/calc.js';
import { amount, delta, kpi, sectionHeader, chartWithTable, dataTable, termButton, notice, isNarrow } from '../components/common.js';

registerStrings({
  'mypay.separate_payment_desc': 'Paid separately from this statement. These amounts are not part of the totals above.',
  'mypay.payment_mismatch': 'The payment amount payroll recorded does not match the amount this statement reconciles to. Open Record & actions for the integrity report.',
  'mypay.largest_movement': 'Largest movement since {period}',
  'mypay.attention_none_no_history': 'Nothing is flagged on this statement.',
  'mypay.reconciliation_issue': 'The totals Paylight computed do not match the totals payroll supplied. Open Record & actions for the integrity report.',
  'mypay.flow_hint': 'Select a bar to open those lines in Pay details.',
  'mypay.flow_step': 'Step',
  'mypay.flow_share': 'Share of gross',
  'mypay.no_time_data': 'No time entries on this statement.',
  'mypay.no_leave_data': 'No leave balances on this statement.',
  'mypay.open_section': 'Open {section}',
  'mypay.pin_ytd_sub': '{total}, year to date',
  'mypay.deduction_lines.one': '{count} deduction line',
  'mypay.deduction_lines.other': '{count} deduction lines',
  'mypay.integrity_report': 'Open the integrity report',
});

const PINS = ['net_change', 'hours', 'leave', 'employer', 'ytd'];

/** The flow bars animate once per page load; later re-renders (selection, prefs) paint them in place. */
let flowAnimated = false;

/**
 * Current ctx so the flow table can re-render in its narrow (two-column) form when the
 * viewport crosses the mobile breakpoint. Debounced and compared with the layout last
 * rendered, so a transient flap (e.g. a screenshot tool resizing the window) does not
 * re-render and reset the chart/table toggle.
 */
let liveCtx = null;
let renderedNarrow = null;
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(max-width: 720px)');
  const onChange = debounce(() => {
    if (!liveCtx || liveCtx.store.get().nav.section !== 'my-pay' || mq.matches === renderedNarrow) return;
    liveCtx.store.update('nav', (n) => ({ ...n }));
  }, 150);
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** The deductions total shown in the KPI row: the profile's reward definition, else the prominent total that is not gross, net or payable. */
function deductionsTotalId(profile, exclude) {
  const def = profile.reward && profile.reward.deductionsTotal;
  if (def && profile.totals.some((d) => d.id === def)) return def;
  const found = profile.totals.find((d) => d.prominent && !d.net && !d.payable && !exclude.includes(d.id));
  return found ? found.id : null;
}

function buildModel(ctx) {
  const { record, profile, computed } = ctx.doc;
  const totals = computed.totals;
  const primaryId = profile.primaryTotal;
  const payableId = profile.payableTotal || primaryId;
  const grossId = (profile.reward && profile.reward.grossTotal) || 'gross';
  const deductionsId = deductionsTotalId(profile, [grossId, primaryId, payableId]);
  const memo = new Map();
  const sections = ctx.sections().map((s) => s.id);
  const net = totals[primaryId] || 0;
  const payable = totals[payableId];
  // KPI figures come from the exact gross-to-net flow, so gross − deductions (+ other items) = net always holds.
  const flow = computed.flow;
  const issuedDeductionsMatch = deductionsId && totals[deductionsId] === flow.deductionsTotal;
  return {
    record, profile, computed, totals, memo,
    primaryId, payableId, grossId, deductionsId: issuedDeductionsMatch ? deductionsId : null,
    net,
    gross: flow.gross,
    deductions: flow.deductionsTotal,
    additions: flow.additionsTotal,
    deductionLines: flow.deductions.reduce((n, d) => n + d.lineIds.length, 0),
    payable,
    paidDiffers: typeof payable === 'number' && payable !== net,
    bridge: computed.bridge || null,
    has: (id) => sections.includes(id),
    period: ctx.fmt.period(record.document.period),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Interface sentence with an {amount} placeholder rendered as a real amount element (privacy-aware). */
function withAmount(ctx, key, params, amountEl, { tag = 'p', cls = null } = {}) {
  const sentinel = '\u0000';
  const parts = ctx.t(key, { ...params, amount: sentinel }).split(sentinel);
  const el = h(tag, { class: cls });
  parts.forEach((part, i) => {
    if (part) el.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) el.appendChild(i === 0 ? amountEl : amountEl.cloneNode(true));
  });
  return el;
}

/** Open Pay details with the category filter set (search cleared so the lines are visible). */
function goToDetails(ctx, category = 'all', lineId = null) {
  ctx.store.update('nav', (nav) => {
    const filters = { query: '', category: 'all', sort: 'default', ...(nav.filters || {}) };
    return { ...nav, filters: { ...filters, category, query: '' } };
  });
  ctx.actions.go('pay-details', { push: true, lineId });
}

function cardHeading(ctx, text, iconName, id) {
  return h('h2', { class: 'pl-mp-h2', id }, iconName ? icon(iconName) : null, h('span', null, text));
}

function labelWithTerm(ctx, text, termKey) {
  return termKey && ctx.content.glossary(termKey) ? termButton(ctx, termKey, text) : text;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx) {
  liveCtx = ctx;
  renderedNarrow = isNarrow();
  const t = ctx.t;
  const m = buildModel(ctx);
  const headerActions = ctx.modules().personalise
    ? h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'mypay-mine' }, on: { click: () => ctx.actions.openMine() } }, icon('sliders', { size: 16 }), t('mine.open'))
    : null;
  return h('div', { class: 'stack-lg pl-mypay' },
    sectionHeader(ctx, t('mypay.title'), t('mypay.intro', { period: m.period }), headerActions),
    storyBlock(ctx, m),
    pinnedBlock(ctx, m),
    kpiBlock(ctx, m),
    paymentBlock(ctx, m),
    adjustmentsBlock(ctx, m),
    h('div', { class: 'grid-2 pl-mp-pair' }, sinceLastBlock(ctx, m), attentionBlock(ctx, m)),
    flowBlock(ctx, m),
    employerBlock(ctx, m),
    reconciliationBlock(ctx, m),
  );
}

// --- KPI row ------------------------------------------------------------------

function kpiBlock(ctx, m) {
  const t = ctx.t;
  const { content } = ctx;
  const cards = [];
  const reconcile = m.has('pay-details')
    ? h('button', { class: 'pl-btn-link pl-mp-recon-link', type: 'button', dataset: { focusKey: 'mypay-net-recon' }, on: { click: () => ctx.actions.go('pay-details', { view: 'totals', push: true }) } }, t('mypay.reconciliation'), icon('forward', { size: 14 }))
    : null;
  cards.push(kpi(ctx, {
    label: labelWithTerm(ctx, content.total(m.primaryId) || t('mypay.net_pay'), 'net_pay'),
    value: amount(ctx, m.net),
    sub: h('span', null, content.totalPlain(m.primaryId) || '', reconcile ? h('br') : null, reconcile),
    size: 'big', cls: 'pl-card-accent pl-mp-kpi pl-mp-kpi-net',
  }));
  if (typeof m.gross === 'number') {
    cards.push(kpi(ctx, {
      label: labelWithTerm(ctx, t('mypay.gross_pay'), 'gross_pay'),
      value: amount(ctx, m.gross),
      sub: content.totalPlain(m.grossId) || null,
      cls: 'pl-mp-kpi',
    }));
  }
  if (typeof m.deductions === 'number') {
    cards.push(kpi(ctx, {
      label: t('mypay.deductions'),
      value: amount(ctx, m.deductions),
      sub: h('span', null,
        m.deductionsId ? [content.total(m.deductionsId), ' · '] : null,
        t('mypay.deduction_lines', { count: m.deductionLines }),
        m.additions ? [h('br'), withAmount(ctx, 'mypay.additions_note', {}, amount(ctx, m.additions), { tag: 'span' })] : null),
      cls: 'pl-mp-kpi',
    }));
  }
  if (m.paidDiffers) {
    cards.push(kpi(ctx, {
      label: t('mypay.amount_paid'),
      value: amount(ctx, m.payable),
      sub: content.totalPlain(m.payableId) || null,
      cls: 'pl-mp-kpi pl-mp-kpi-paid',
    }));
  }
  return h('div', { class: 'pl-mp-kpis', dataset: { count: cards.length } }, cards);
}

// --- Payment line --------------------------------------------------------------

function paymentBlock(ctx, m) {
  const t = ctx.t;
  const p = m.record.payment;
  if (!p) return null;
  const method = ctx.content.paymentMethod(p.method);
  const ok = m.computed.verify ? m.computed.verify.paymentOk !== false : true;
  return h('div', { class: 'stack' },
    h('div', { class: 'pl-card pl-mp-payment' },
      icon('wallet', { size: 22 }),
      h('div', { class: 'txt' },
        h('p', null, t('mypay.paid_via', { method, bank: p.bankMasked || '—', date: ctx.fmt.date(p.date) })),
        p.reference ? h('p', { class: 'muted small' }, t('mypay.payment_reference', { reference: p.reference })) : null,
      ),
      typeof p.amountMinor === 'number' ? amount(ctx, p.amountMinor, { cls: 'amt' }) : null,
    ),
    ok ? null : notice(ctx, [t('mypay.payment_mismatch'), ' ', integrityLink(ctx, m)], { kind: 'warn' }),
  );
}

function integrityLink(ctx, m) {
  if (!m.has('record-actions')) return null;
  return h('button', { class: 'pl-btn-link', type: 'button', on: { click: () => ctx.actions.go('record-actions', { push: true }) } }, ctx.t('mypay.integrity_report'));
}

// --- Separate payment adjustments ----------------------------------------------

function adjustmentsBlock(ctx, m) {
  const t = ctx.t;
  const list = m.record.adjustments || [];
  if (!list.length) return null;
  const id = 'mypay-adjust-h';
  return h('section', { class: 'pl-card pl-mp-adjust', aria: { labelledby: id } },
    h('div', { class: 'row-between' }, cardHeading(ctx, t('mypay.separate_payment'), 'warn', id), h('span', { class: 'pl-chip pl-chip-warn' }, t('highlight.separate_payment'))),
    h('p', { class: 'muted small' }, t('mypay.separate_payment_desc')),
    h('ul', { class: 'pl-mp-adjust-list' }, list.map((a) => {
      const c = ctx.content.adjustment(a.key);
      return h('li', null,
        h('span', { class: 'lbl' }, c.label || a.key),
        h('span', { class: 'meta' },
          a.paymentDate ? t('mypay.payment_pending', { date: ctx.fmt.date(a.paymentDate) }) : null,
          a.reasonKey ? ` · ${t(a.reasonKey)}` : null,
          c.plain ? h('span', { class: 'plain' }, c.plain) : null,
        ),
        amount(ctx, a.amountMinor, { cls: 'amt' }),
      );
    })),
  );
}

// --- Pinned summaries -------------------------------------------------------------

function pinnedBlock(ctx, m) {
  const t = ctx.t;
  const pins = (ctx.store.get().prefs.presentation.pins || []).filter((p) => PINS.includes(p));
  if (!pins.length) return null;
  const cards = [];
  for (const pin of pins) cards.push(...pinCards(ctx, m, pin));
  if (!cards.length) return null;
  const id = 'mypay-pinned-h';
  return h('section', { class: 'pl-mp-pinned', aria: { labelledby: id } },
    cardHeading(ctx, t('mypay.pinned'), 'pin', id),
    h('div', { class: 'pl-mp-pins' }, cards),
  );
}

function pinCards(ctx, m, pin) {
  const t = ctx.t;
  const { record, computed } = m;
  switch (pin) {
    case 'net_change':
      return [pinCard(ctx, m, { key: pin, label: t('mine.pin_net_change'), section: 'what-changed',
        value: m.bridge ? delta(ctx, m.bridge.change) : t('common.not_available'),
        sub: m.bridge ? ctx.fmt.period(m.bridge.periodFrom) : t('changed.no_history') })];
    case 'hours': {
      const hasTime = record.time && (record.time.entries || []).length > 0;
      return [pinCard(ctx, m, { key: pin, label: t('mypay.hours_this_period'), section: 'time-leave',
        value: hasTime ? ctx.fmt.minutesAsHours(computed.time.workedMinutes) : t('common.not_available'),
        sub: hasTime ? m.period : t('mypay.no_time_data') })];
    }
    case 'leave': {
      const balances = (record.time && record.time.leave && record.time.leave.balances) || [];
      if (!balances.length) return [pinCard(ctx, m, { key: pin, label: t('mine.pin_leave'), section: 'time-leave', value: t('common.not_available'), sub: t('mypay.no_leave_data') })];
      return balances.map((b) => pinCard(ctx, m, { key: `${pin}-${b.type}`, section: 'time-leave',
        label: t('mypay.leave_balance', { type: ctx.content.leaveType(b.type).label }),
        value: b.unit === 'hours' ? ctx.fmt.hours(b.closing) : ctx.fmt.days(b.closing),
        sub: b.asOf ? ctx.fmt.date(b.asOf) : null }));
    }
    case 'employer':
      return [pinCard(ctx, m, { key: pin, label: t('mine.pin_employer'), section: 'total-reward',
        value: amount(ctx, employerFigure(ctx, m).amount), sub: employerFigure(ctx, m).label })];
    case 'ytd': {
      const ytdInfo = grossYearToDate(record, m.profile);
      const label = ctx.content.glossary('ytd') ? termButton(ctx, 'ytd', t('common.ytd')) : t('common.ytd');
      return [pinCard(ctx, m, { key: pin, label, section: 'pay-details', value: ytdInfo ? amount(ctx, ytdInfo.amount) : t('common.not_available'),
        sub: t('mypay.pin_ytd_sub', { total: ctx.content.total(m.grossId) }) })];
    }
    default:
      return [];
  }
}

/** A small summary card. The label row is a button that opens the section the summary comes from, when that section is available. */
function pinCard(ctx, m, { key, label, value, sub = null, section = null }) {
  const t = ctx.t;
  const target = section && m.has(section) ? section : null;
  const sectionTitle = target ? t((ctx.sections().find((s) => s.id === target) || {}).titleKey || 'nav.my_pay') : null;
  const head = target
    ? h('button', { class: 'pl-mp-pin-btn', type: 'button', dataset: { focusKey: `mypay-pin-${key}` }, aria: { label: `${typeof label === 'string' ? label : label.textContent} — ${t('mypay.open_section', { section: sectionTitle })}` }, on: { click: () => ctx.actions.go(target, { push: true }) } },
      h('span', { class: 'lbl' }, typeof label === 'string' ? label : label.textContent), icon('forward', { size: 16 }))
    : h('span', { class: 'lbl' }, label);
  return h('div', { class: 'pl-card pl-mp-pin', dataset: { pin: key } },
    head,
    h('span', { class: 'val' }, value),
    sub ? h('span', { class: 'sub' }, sub) : null,
  );
}

// --- Since your last pay --------------------------------------------------------------

function sinceLastBlock(ctx, m) {
  const t = ctx.t;
  const b = m.bridge;
  if (!b) return null;
  const change = b.change;
  const key = change > 0 ? 'mypay.change_up' : change < 0 ? 'mypay.change_down' : 'mypay.change_none';
  const id = 'mypay-since-h';
  const prior = (m.record.history || [])[0];
  const paidChange = m.paidDiffers && prior ? varianceBridge(m.record, prior, m.profile, m.payableId).change : null;
  return h('section', { class: 'pl-card pl-mp-since', aria: { labelledby: id } },
    cardHeading(ctx, t('mypay.since_last'), 'trend', id),
    h('span', { class: 'muted small pl-mp-since-lbl' }, ctx.content.total(b.totalId)),
    delta(ctx, change, { cls: 'big' }),
    withAmount(ctx, key, { period: ctx.fmt.period(b.periodFrom) }, amount(ctx, Math.abs(change)), { tag: 'p' }),
    paidChange !== null ? h('p', { class: 'small' }, `${ctx.content.total(m.payableId)}: `, delta(ctx, paidChange)) : null,
    m.has('what-changed')
      ? h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'mypay-see-why' }, on: { click: () => ctx.actions.go('what-changed', { push: true }) } }, t('mypay.see_why'), icon('forward', { size: 16 }))
      : null,
  );
}

// --- Worth a look ------------------------------------------------------------------------

function attentionItems(ctx, m) {
  const t = ctx.t;
  const { record, bridge } = m;
  const items = [];
  const seen = new Set();
  const stepFor = (id) => (bridge ? bridge.steps.find((s) => s.lineId === id) : null);
  const taxStart = record.document.taxYear && record.document.taxYear.start;
  for (const hl of record.highlights || []) {
    const line = hl.lineId ? ctx.line(hl.lineId) : null;
    if (!line) continue;
    const params = { date: taxStart ? ctx.fmt.date(taxStart) : '', ...(hl.params || {}) };
    const step = stepFor(hl.lineId);
    items.push({ id: hl.lineId, reason: t(hl.reasonKey, params), label: ctx.content.lineLabel(line), minor: line.amountMinor, effect: step ? step.effect : null });
    seen.add(hl.lineId);
  }
  if (bridge) {
    for (const s of bridge.steps) {
      if (!s.isNew || seen.has(s.lineId)) continue;
      const line = ctx.line(s.lineId);
      if (!line) continue;
      items.push({ id: s.lineId, reason: t('highlight.new_line'), label: ctx.content.lineLabel(line), minor: line.amountMinor, effect: s.effect });
      seen.add(s.lineId);
    }
    const top = bridge.steps[0];
    if (top && !seen.has(top.lineId)) {
      const line = ctx.line(top.lineId);
      const label = line ? ctx.content.lineLabel(line) : ctx.content.line(top.key).label;
      items.push({ id: top.lineId, reason: t('mypay.largest_movement', { period: ctx.fmt.period(bridge.periodFrom) }), label, minor: line ? line.amountMinor : null, effect: top.effect, removed: !line });
      seen.add(top.lineId);
    }
  }
  return items;
}

function attentionBlock(ctx, m) {
  const t = ctx.t;
  const items = attentionItems(ctx, m);
  const id = 'mypay-attn-h';
  let body;
  if (!items.length) {
    body = h('p', { class: 'muted' }, m.bridge ? t('mypay.attention_none') : t('mypay.attention_none_no_history'));
  } else {
    body = h('ul', { class: 'pl-mp-attn-list' }, items.map((it) => {
      const canOpen = !it.removed || m.has('what-changed');
      const open = () => { if (it.removed) ctx.actions.go('what-changed', { push: true }); else ctx.actions.focusLine(it.id); };
      const text = [h('span', { class: 'reason' }, it.reason), h('span', { class: 'lbl' }, it.label)];
      return h('li', { dataset: it.removed ? null : { lineId: it.id } },
        canOpen
          ? h('button', { class: 'pl-mp-attn', type: 'button', dataset: { focusKey: `mypay-attn-${it.id}`, lineFocus: it.removed ? null : '' }, on: { click: open } }, h('span', { class: 'txt' }, text), icon('forward', { size: 16 }))
          : h('span', { class: 'pl-mp-attn' }, h('span', { class: 'txt' }, text)),
        h('span', { class: 'pl-mp-attn-amt' },
          typeof it.minor === 'number' ? amount(ctx, it.minor) : h('span', { class: 'muted' }, t('changed.step_removed')),
          typeof it.effect === 'number' && it.effect !== 0 ? withAmount(ctx, 'changed.effect_on_net', {}, delta(ctx, it.effect), { tag: 'span', cls: 'eff' }) : null,
        ),
      );
    }));
  }
  return h('section', { class: 'pl-card pl-mp-attention', aria: { labelledby: id } },
    cardHeading(ctx, t('mypay.attention'), 'zap', id),
    body,
  );
}

// --- Gross-to-net flow ----------------------------------------------------------------------

function flowRows(ctx, m) {
  const flow = m.computed.flow;
  const { content } = ctx;
  const rows = [{ kind: 'gross', label: content.total(m.grossId), minor: flow.gross, category: 'earning', lineIds: [] }];
  let running = flow.gross;
  let scale = Math.max(flow.gross, flow.net, 1);
  for (const d of flow.deductions) {
    running -= d.amount;
    rows.push({ kind: 'ded', label: content.group(d.group), minor: d.amount, left: running, category: d.category, lineIds: d.lineIds });
  }
  for (const a of flow.additions) {
    rows.push({ kind: 'add', label: content.group(a.group), minor: a.amount, left: running, category: a.category, lineIds: a.lineIds });
    running += a.amount;
    scale = Math.max(scale, running);
  }
  rows.push({ kind: 'net', label: content.total(m.primaryId), minor: flow.net, category: 'all', lineIds: [] });
  for (const r of rows) {
    const left = r.kind === 'gross' || r.kind === 'net' ? 0 : Math.max(0, r.left);
    r.leftPct = Math.min(100, (left / scale) * 100);
    r.widthPct = Math.max(0, Math.min(100 - r.leftPct, (Math.abs(r.minor) / scale) * 100));
    r.sharePermyriad = flow.gross ? Math.round((r.minor / flow.gross) * 10000) : 0;
  }
  return rows;
}

/** One action back to the source: a deduction or addition opens its first line; net opens the totals reconciliation. */
function openFlowRow(ctx, r) {
  if (r.kind === 'net') { ctx.actions.go('pay-details', { view: 'totals', push: true }); return; }
  goToDetails(ctx, r.category, r.lineIds && r.lineIds.length ? r.lineIds[0] : null);
}

function flowBlock(ctx, m) {
  const t = ctx.t;
  const flow = m.computed.flow;
  if (!flow || !(flow.gross > 0)) return null;
  const rows = flowRows(ctx, m);
  const animate = !flowAnimated && !ctx.reducedMotion();
  flowAnimated = true;
  const bars = [];
  const prefix = (kind) => (kind === 'ded' ? '− ' : kind === 'add' ? '+ ' : kind === 'net' ? '= ' : '');

  const list = h('div', { class: 'pl-flow pl-mp-flow-list', role: 'list' }, rows.map((r, i) => {
    const bar = h('span', { class: 'bar', style: { left: `${r.leftPct}%`, width: animate ? '0%' : `${r.widthPct}%` } });
    bars.push([bar, r.widthPct]);
    return h('div', { class: ['pl-flow-row', r.kind], role: 'listitem' },
      h('button', { class: 'pl-mp-flow-btn', type: 'button', dataset: { focusKey: `mypay-flow-${i}` }, on: { click: () => openFlowRow(ctx, r) } },
        h('span', { class: 'lbl' }, prefix(r.kind), r.label),
        h('span', { class: 'track', aria: { hidden: 'true' } }, bar),
      ),
      amount(ctx, r.minor, { cls: 'amt' }),
    );
  }));
  if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { for (const [bar, w] of bars) bar.style.width = `${w}%`; }));

  const chart = h('div', { class: 'pl-mp-flow' },
    h('p', { class: 'sr-only' }, flow.additionsTotal
      ? t('chart.alt_flow_additions', { gross: ctx.fmt.money(flow.gross), deductions: ctx.fmt.money(flow.deductionsTotal), additions: ctx.fmt.money(flow.additionsTotal), net: ctx.fmt.money(flow.net) })
      : t('chart.alt_flow', { gross: ctx.fmt.money(flow.gross), deductions: ctx.fmt.money(flow.deductionsTotal), net: ctx.fmt.money(flow.net) })),
    list,
    h('p', { class: 'muted xs pl-mp-flow-hint' }, t('mypay.flow_hint')),
  );
  // Narrow screens: two columns, with the share of gross under the amount, so nothing needs horizontal scrolling at 320 px.
  const narrow = isNarrow();
  const stepCol = { key: 'step', label: t('mypay.flow_step'), render: (r) => h('button', { class: 'pl-btn-link pl-mp-flow-link', type: 'button', on: { click: () => openFlowRow(ctx, r) } }, `${prefix(r.kind)}${r.label}`) };
  const shareText = (r) => ctx.fmt.percent(r.sharePermyriad, 1);
  const cols = narrow
    ? [stepCol, { key: 'amt', label: `${t('common.amount')} · ${t('mypay.flow_share')}`, num: true, render: (r) => h('span', { class: 'pl-mp-flow-cell' }, amount(ctx, r.minor), h('span', { class: 'muted xs share' }, shareText(r))) }]
    : [stepCol, { key: 'amt', label: t('common.amount'), num: true, render: (r) => amount(ctx, r.minor) }, { key: 'share', label: t('mypay.flow_share'), num: true, render: shareText }];
  const table = dataTable(ctx, {
    caption: t('mypay.flow_table'),
    cols,
    rows: rows.map((r) => ({ ...r, _class: r.kind === 'net' ? 'subtotal' : null })),
    compact: true,
    className: 'pl-mp-flow-table',
  });
  const id = 'mypay-flow-h';
  return h('section', { class: 'pl-card pl-mp-flow-card', aria: { labelledby: id } },
    cardHeading(ctx, t('mypay.flow_title'), 'trend', id),
    h('p', { class: 'muted small' }, t('mypay.flow_desc')),
    chartWithTable(ctx, { chart, table, label: t('mypay.flow_title') }),
  );
}

// --- Employer adds / story ----------------------------------------------------------------------

/** The employer figure to show: the issued employer-contributions total under its governed name when the profile defines one. */
function employerFigure(ctx, m) {
  const id = m.profile.totals.some((d) => d.id === 'employerContributions') ? 'employerContributions' : null;
  if (id && typeof m.totals[id] === 'number') return { amount: m.totals[id], label: ctx.content.total(id) };
  return { amount: m.computed.reward ? m.computed.reward.employer : 0, label: ctx.t('reward.employer') };
}

function employerBlock(ctx, m) {
  const t = ctx.t;
  const fig = employerFigure(ctx, m);
  if (!(fig.amount > 0)) return null;
  const id = 'mypay-employer-h';
  return h('section', { class: 'pl-card pl-mp-cta', aria: { labelledby: id } },
    icon('gift', { size: 22 }),
    h('div', { class: 'txt' },
      h('h2', { id, class: 'pl-mp-h3' }, fig.label),
      withAmount(ctx, 'mypay.employer_adds_generic', {}, amount(ctx, fig.amount), { tag: 'p' }),
      h('p', { class: 'muted small' }, t('details.employer_note')),
      m.has('total-reward')
        ? h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'mypay-reward' }, on: { click: () => ctx.actions.go('total-reward', { push: true }) } }, t('mypay.view_reward'), icon('forward', { size: 16 }))
        : null,
    ),
  );
}

function storyBlock(ctx, m) {
  const t = ctx.t;
  if (!ctx.modules().story) return null;
  const id = 'mypay-story-h';
  // The story leads the page: one clear invitation, directly under the heading.
  return h('section', { class: 'pl-card pl-mp-story', aria: { labelledby: id } },
    h('span', { class: 'pl-mp-story-art', aria: { hidden: 'true' } }, icon('story', { size: 28 })),
    h('div', { class: 'txt' },
      h('h2', { id, class: 'pl-mp-h3' }, t('story.title')),
      h('p', null, t('mypay.story_desc')),
    ),
    h('button', { class: 'pl-btn pl-btn-primary pl-btn-lg', type: 'button', dataset: { focusKey: 'mypay-story' }, on: { click: () => ctx.actions.openStory() } }, icon('play', { size: 18 }), t('mypay.open_story')),
  );
}

// --- Reconciliation --------------------------------------------------------------------------------

function reconciliationBlock(ctx, m) {
  const t = ctx.t;
  const verify = m.computed.verify;
  const ok = !verify || verify.totals.ok;
  const details = h('button', { class: 'pl-btn-link', type: 'button', dataset: { focusKey: 'mypay-details' }, on: { click: () => goToDetails(ctx, 'all') } }, t('mypay.view_details'));
  if (!ok) return notice(ctx, [t('mypay.reconciliation_issue'), ' ', integrityLink(ctx, m), ' · ', details], { kind: 'warn' });
  return h('p', { class: 'pl-mp-recon' }, icon('check', { size: 18 }), h('span', null, t('mypay.reconciliation_desc')), details);
}
