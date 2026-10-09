/**
 * What changed — movements since a supplied prior period: a compare-with
 * selector over record.history, the net pay change, a reconciled variance
 * bridge (SVG waterfall with a table), the biggest movements with reasons,
 * a period comparison across the whole history and a net pay trend.
 *
 * Every number comes from calc.js (varianceBridge, comparisonTable,
 * computeTotals) and is rendered through amount()/delta() or ctx.fmt; text is
 * interface strings or governed content. The compared period lives in
 * store.nav.view as 'cmp:<periodId>' so the fragment and the session keep it.
 *
 * Contract: export function render(ctx) -> HTMLElement
 */
import { h, icon, announce, debounce, uid, replaceChildren } from '../../app/dom.js';
import { registerStrings } from '../../app/i18n.js';
import { varianceBridge, comparisonTable, computeTotals, priorLines } from '../../app/calc.js';
import { amount, delta, kpi, lineTitle, notice, sectionHeader, chartWithTable, isNarrow, emptyState } from '../components/common.js';

registerStrings({
  'changed.compare_option': '{period} (paid {payDate})',
  'changed.comparing': 'Comparing with {period}',
  'changed.compare_with_period': 'Compare with {period}',
  'changed.comparing_chip': 'Comparing',
  'changed.new_count.one': '{count} new line',
  'changed.new_count.other': '{count} new lines',
  'changed.removed_count.one': '{count} line not in this period',
  'changed.removed_count.other': '{count} lines not in this period',
  'changed.col_line': 'Line',
  'changed.col_effect': 'Effect on net pay',
  'changed.explained_total': 'Explained by line movements',
  'changed.other_steps.one': 'Other ({count} smaller line)',
  'changed.other_steps.other': 'Other ({count} smaller lines)',
  'changed.other_hint': 'The chart groups the smallest movements as “Other”; the table lists every line.',
  'changed.show_table': 'Show the table',
  'changed.chart_hint': 'Select a bar to open that line in Pay details.',
  'changed.axis_note': 'The scale starts at {amount} rather than zero so that small movements stay visible.',
  'changed.step_aria': '{line}: {delta}. Effect on net pay {effect}. Go to this line.',
  'changed.step_aria_removed': '{line}: {delta}. Effect on net pay {effect}. Show in the period comparison.',
  'changed.show_in_comparison': 'Show in period comparison',
  'changed.open_line': 'Open {line} in Pay details',
  'changed.movers_desc': 'The lines that moved your net pay most, compared with {period}.',
  'changed.trend_title': 'Net pay trend',
  'changed.trend_desc': 'Net pay across the last {count} pay periods, oldest first.',
  'changed.trend_point_aria': '{period}: net pay {amount}. Compare with this period.',
  'changed.trend_hint': 'Select an earlier point to compare this period with it.',
  'changed.card_hint': 'Each card lists the line’s value in every period.',
});

/** Bars drawn in the bridge chart, including the grouped “Other” bar; the table always lists every step. */
const MAX_CHART_STEPS = 8;
/** Expanded “Why did this change?” panels survive re-renders (compare changes, prefs). */
const expandedWhy = new Set();

/** Current ctx so the section re-renders when the viewport crosses a layout breakpoint. */
let liveCtx = null;
let renderedLayout = null;
if (typeof window !== 'undefined') {
  const onResize = debounce(() => {
    if (!liveCtx || liveCtx.store.get().nav.section !== 'what-changed') return;
    const m = liveCtx.doc.record.history || [];
    if (layoutKey(layoutOf(m.length + 1)) === renderedLayout) return;
    liveCtx.store.update('nav', (n) => ({ ...n }));
  }, 150);
  window.addEventListener('resize', onResize);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Estimated inner width of a full-width card in the section (corrected later by ResizeObserver for charts). */
function cardInnerWidth() {
  const wrap = Math.min(1120, window.innerWidth) - 32;
  return Math.max(200, wrap - 34);
}

function layoutOf(periodCount) {
  const narrow = isNarrow();
  const w = cardInnerWidth();
  return { narrow, cmpCards: narrow || 200 + periodCount * 118 > w };
}
function layoutKey(l) { return `${l.narrow ? 1 : 0}${l.cmpCards ? 1 : 0}`; }

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function compareIdFrom(view) {
  return typeof view === 'string' && view.startsWith('cmp:') ? view.slice(4) : null;
}

function buildModel(ctx) {
  const { record, profile, content, computed } = ctx.doc;
  const history = record.history || [];
  const primaryId = profile.primaryTotal;
  const netLabel = content.total(primaryId);
  if (!history.length) return { history, primaryId, netLabel };

  const wanted = compareIdFrom(ctx.store.get().nav.view);
  const prior = history.find((p) => p.periodId === wanted) || history[0];
  const bridge = prior === history[0] && computed.bridge ? computed.bridge : varianceBridge(record, prior, profile);
  const prevById = new Map(priorLines(prior).map((l) => [l.id, l]));
  const steps = bridge.steps.map((s) => {
    const cur = ctx.line(s.lineId);
    const prev = prevById.get(s.lineId) || null;
    const line = cur || { id: s.lineId, key: s.key, category: s.category, group: s.group };
    return {
      ...s, line, cur, prev,
      label: content.lineLabel(line),
      hoursPrior: prev && typeof prev.hoursHundredths === 'number' ? prev.hoursHundredths : null,
      hoursCurrent: cur && cur.calc && typeof cur.calc.hoursHundredths === 'number' ? cur.calc.hoursHundredths : null,
      supplied: Boolean(cur) && (!cur.calc || cur.calc.type === 'supplied'),
    };
  });

  const comparison = comparisonTable(record, history);
  const trend = history.slice().reverse().map((p) => ({ id: p.periodId, period: p.period, payDate: p.payDate, value: computeTotals(priorLines(p), profile).totals[primaryId], current: false }));
  trend.push({ id: 'current', period: record.document.period, payDate: record.document.payDate, value: computed.totals[primaryId], current: true });
  const valueOfPeriod = (id) => (trend.find((x) => x.id === id) || {}).value;
  const periodTotals = comparison.periods.map((p) => valueOfPeriod(p.id));

  return { history, prior, bridge, steps, comparison, trend, periodTotals, primaryId, netLabel, newCount: steps.filter((s) => s.isNew).length, removedCount: steps.filter((s) => s.isRemoved).length };
}

function setCompare(ctx, m, periodId) {
  const p = m.history.find((x) => x.periodId === periodId);
  if (!p || p === m.prior) return;
  ctx.store.update('nav', (n) => ({ ...n, view: `cmp:${periodId}`, lineId: null }));
  announce(ctx.t('changed.comparing', { period: ctx.fmt.period(p.period) }));
}

/** Open a step's line: current lines go to Pay details; lines only on the prior statement are shown in the comparison. */
function openStep(ctx, s) {
  if (s.cur) { ctx.actions.focusLine(s.lineId); return; }
  const row = document.querySelector(`.pl-wc-cmp [data-line-id="${CSS.escape(s.lineId)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' });
  const f = row.querySelector('[data-line-focus]') || row;
  if (f.focus) f.focus({ preventScroll: true });
  row.classList.add('is-focus');
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Interpolate a translated template with DOM nodes for the named placeholders (amounts stay amount() elements). */
function fill(ctx, key, nodes, params = {}, { tag = 'span', cls = null } = {}) {
  const names = Object.keys(nodes);
  const marks = {};
  names.forEach((n, i) => { marks[n] = String.fromCharCode(0xe000 + i); });
  const text = ctx.t(key, { ...params, ...marks });
  const el = h(tag, { class: cls });
  const used = new Set();
  for (const part of text.split(/([-])/)) {
    if (!part) continue;
    const name = names[part.charCodeAt(0) - 0xe000];
    if (part.length === 1 && name !== undefined && nodes[name]) { el.appendChild(used.has(name) ? nodes[name].cloneNode(true) : nodes[name]); used.add(name); }
    else el.appendChild(document.createTextNode(part));
  }
  return el;
}

function shortPeriod(ctx, p) { return `${ctx.fmt.date(p.start, 'short')} – ${ctx.fmt.date(p.end, 'short')}`; }
function periodName(ctx, p) { return ctx.t('changed.period_label', { sequence: p.sequence }); }
function signed(ctx, minor) { return ctx.fmt.money(minor, { signDisplay: 'exceptZero' }); }

const CHAR_W = 0.56;
function measureText(el, size) {
  if (el.isConnected) { try { const w = el.getComputedTextLength(); if (w > 0) return w; } catch (e) { /* not rendered */ } }
  return String(el.textContent).length * size * CHAR_W;
}

/** Fill an SVG <text> with up to maxLines <tspan>s that fit maxWidth; the last line is trimmed with an ellipsis. */
function wrapText(textEl, text, { maxWidth, maxLines = 2, size = 11, x = 0, lineHeight = size + 3 }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const probe = h('svg:tspan', { x }, '');
  textEl.appendChild(probe);
  const width = (s) => { probe.textContent = s; return measureText(probe, size); };
  const trim = (s) => { let out = s; while (out.length > 1 && width(`${out}…`) > maxWidth) out = out.slice(0, -1).trimEnd(); return `${out}…`; };
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && width(`${line} ${words[i]}`) <= maxWidth) line = `${line} ${words[i++]}`;
    if (i < words.length && lines.length === maxLines - 1) { line = trim(`${line} ${words.slice(i).join(' ')}`); i = words.length; }
    else if (width(line) > maxWidth) line = trim(line);
    lines.push(line);
  }
  probe.remove();
  lines.forEach((l, k) => textEl.appendChild(h('svg:tspan', { x, dy: k === 0 ? 0 : lineHeight }, l)));
  return lines.length;
}

/** Nice axis: a step from {1,2,2.5,5}×10^k, padded so the extremes never sit on the edge. Values are minor units. */
function niceScale(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 100; max += 100; }
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((c) => c * mag).find((c) => c >= raw);
  let lo = Math.floor(min / step) * step;
  if (min - lo < step * 0.3) lo -= step;
  let hi = Math.ceil(max / step) * step;
  if (hi - max < step * 0.3) hi += step;
  if (min >= 0 && lo < 0) lo = 0;
  if (max <= 0 && hi > 0) hi = 0;
  const ticks = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(Math.round(v));
  return { lo, hi, step, ticks, truncated: lo > 0 || hi < 0 };
}

/** A bar with a 4px rounded data end and a square base. side: 'top' | 'bottom' | 'left' | 'right'. */
function barPath(x, y, w, hgt, side, r = 4) {
  const rx = Math.min(r, w / 2, hgt / 2);
  if (side === 'top') return `M${x},${y + hgt} V${y + rx} a${rx},${rx} 0 0 1 ${rx},-${rx} H${x + w - rx} a${rx},${rx} 0 0 1 ${rx},${rx} V${y + hgt} Z`;
  if (side === 'bottom') return `M${x},${y} H${x + w} V${y + hgt - rx} a${rx},${rx} 0 0 1 -${rx},${rx} H${x + rx} a${rx},${rx} 0 0 1 -${rx},-${rx} Z`;
  if (side === 'right') return `M${x},${y} H${x + w - rx} a${rx},${rx} 0 0 1 ${rx},${rx} V${y + hgt - rx} a${rx},${rx} 0 0 1 -${rx},${rx} H${x} Z`;
  return `M${x + w},${y} V${y + hgt} H${x + rx} a${rx},${rx} 0 0 1 -${rx},-${rx} V${y + rx} a${rx},${rx} 0 0 1 ${rx},-${rx} Z`;
}

/** Host that (re)draws an SVG at the container's real width. The first observation always repaints so labels are measured, not estimated. */
function responsiveChart(draw, { className = '' } = {}) {
  const host = h('div', { class: ['pl-wc-chart', className] });
  let last = -1;
  let measured = false;
  const paint = (w, force) => {
    if (w < 40 || (!force && Math.abs(w - last) < 2)) return;
    last = w;
    // A repaint replaces the SVG: keep keyboard focus on the same bar or point.
    const active = document.activeElement;
    const key = active && host.contains(active) ? active.dataset.focusKey : null;
    replaceChildren(host, draw(w));
    if (key) { const again = host.querySelector(`[data-focus-key="${CSS.escape(key)}"]`); if (again) again.focus({ preventScroll: true }); }
  };
  paint(cardInnerWidth(), true);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver((entries) => { const w = Math.floor(entries[0].contentRect.width); if (w < 40) return; paint(w, !measured); measured = true; });
    ro.observe(host);
  }
  return host;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx) {
  liveCtx = ctx;
  const t = ctx.t;
  const m = buildModel(ctx);
  const layout = layoutOf((m.comparison ? m.comparison.periods.length : 1));
  renderedLayout = layoutKey(layout);

  if (!m.history.length) {
    return h('div', { class: 'stack-lg pl-wc' },
      sectionHeader(ctx, t('changed.title'), null),
      emptyState(t('changed.no_history')),
    );
  }

  return h('div', { class: 'stack-lg pl-wc' },
    sectionHeader(ctx, t('changed.title'), t('changed.intro', { period: ctx.fmt.period(m.prior.period) }), [compareField(ctx, m)]),
    kpiRow(ctx, m),
    bridgeCard(ctx, m, layout),
    moversCard(ctx, m),
    comparisonCard(ctx, m, layout),
    trendCard(ctx, m, layout),
  );
}

// --- Compare-with -------------------------------------------------------------

function compareField(ctx, m) {
  const t = ctx.t;
  const id = uid('wccmp');
  const select = h('select', {
    class: 'pl-select', id, dataset: { focusKey: 'changed-compare' },
    on: { change: (e) => setCompare(ctx, m, e.target.value) },
  }, m.history.map((p) => h('option', { value: p.periodId, selected: p === m.prior }, t('changed.compare_option', { period: ctx.fmt.period(p.period), payDate: ctx.fmt.date(p.payDate) }))));
  return h('div', { class: 'pl-field pl-wc-compare' }, h('label', { for: id }, t('changed.compare_with')), select);
}

// --- KPIs ---------------------------------------------------------------------

function kpiRow(ctx, m) {
  const t = ctx.t;
  const b = m.bridge;
  const fromTo = h('div', { class: 'pl-wc-fromto' },
    h('div', { class: 'pl-kv' }, h('span', { class: 'k' }, t('changed.from_period', { period: ctx.fmt.period(m.prior.period) })), amount(ctx, b.from, { cls: 'v' })),
    h('div', { class: 'pl-kv' }, h('span', { class: 'k' }, t('changed.to_period')), amount(ctx, b.to, { cls: 'v' })),
  );
  const subParts = [];
  if (m.newCount) subParts.push(t('changed.new_count', { count: m.newCount }));
  if (m.removedCount) subParts.push(t('changed.removed_count', { count: m.removedCount }));
  return h('div', { class: 'pl-wc-kpis' },
    kpi(ctx, { label: t('changed.net_change'), value: delta(ctx, b.change), sub: fromTo, cls: 'pl-wc-kpi-net' }),
    kpi(ctx, { label: t('changed.affected_lines'), value: ctx.fmt.number(m.steps.length), sub: subParts.length ? subParts.join(' · ') : t('changed.comparison_desc', { count: m.comparison.periods.length }), size: 'sm' }),
  );
}

// --- Bridge -------------------------------------------------------------------

/** Chart bars: start total, the largest steps, an “Other” bar for the rest (chart only), end total. */
function chartBars(ctx, m) {
  const t = ctx.t;
  const b = m.bridge;
  let shown = m.steps;
  let rest = [];
  if (m.steps.length > MAX_CHART_STEPS) { shown = m.steps.slice(0, MAX_CHART_STEPS - 1); rest = m.steps.slice(MAX_CHART_STEPS - 1); }
  const bars = [{ kind: 'total', value: b.from, label: t('changed.from_period', { period: ctx.fmt.period(m.prior.period) }) }];
  let running = b.from;
  for (const s of shown) { bars.push({ kind: 'step', step: s, start: running, end: running + s.effect, effect: s.effect, label: s.label }); running += s.effect; }
  if (rest.length) {
    const effect = rest.reduce((sum, s) => sum + s.effect, 0);
    bars.push({ kind: 'other', start: running, end: running + effect, effect, count: rest.length, label: t('changed.other_steps', { count: rest.length }) });
    running += effect;
  }
  bars.push({ kind: 'total', value: b.to, label: t('changed.to_period') });
  return bars;
}

function stepAria(ctx, bar) {
  const t = ctx.t;
  if (bar.kind === 'other') return `${bar.label}. ${t('changed.show_table')}`;
  const s = bar.step;
  return t(s.cur ? 'changed.step_aria' : 'changed.step_aria_removed', { line: s.label, delta: signed(ctx, s.delta), effect: signed(ctx, s.effect) });
}

function showTable(el) {
  const host = el.closest('.pl-chart-host');
  const btn = host && host.querySelector('.pl-seg button:last-child');
  if (btn) { btn.click(); const tbl = host.querySelector('.pl-chart-table'); const f = tbl && tbl.querySelector('a[href], button, [tabindex="0"]'); if (f) f.focus(); else btn.focus(); }
}

/** Focusable chart element for a step: role link (a line) or button (“Other” opens the table). */
function hitGroup(ctx, bar, hit, children) {
  const isOther = bar.kind === 'other';
  const activate = (e) => { if (isOther) showTable(e.currentTarget); else openStep(ctx, bar.step); };
  const g = h('svg:g', {
    class: 'hit', role: isOther ? 'button' : 'link', tabindex: '0', aria: { label: stepAria(ctx, bar) },
    dataset: isOther ? null : { lineId: bar.step.lineId, focusKey: `changed-bar-${bar.step.lineId}`, prior: bar.step.cur ? null : '' },
    on: { click: activate, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } } },
  },
  h('svg:rect', { class: 'hit-area', x: hit.x, y: hit.y, width: hit.w, height: hit.h }),
  h('svg:rect', { class: 'ring', x: hit.x + 1.5, y: hit.y + 1.5, width: Math.max(0, hit.w - 3), height: Math.max(0, hit.h - 3), rx: 6 }),
  children);
  return g;
}

function barClass(bar) {
  if (bar.kind === 'total') return 'bar bar-total';
  return bar.effect > 0 ? 'bar bar-pos' : bar.effect < 0 ? 'bar bar-neg' : 'bar bar-neutral';
}

function drawVertical(ctx, bars, width, titleId) {
  const privacy = ctx.privacy();
  const size = 11;
  const sc = niceScale(bars.flatMap((b) => (b.kind === 'total' ? [b.value] : [b.start, b.end])));
  const tickText = privacy ? [] : sc.ticks.map((v) => ctx.fmt.money(v, { compact: true }));
  const left = privacy ? 8 : Math.ceil(Math.max(...tickText.map((s) => s.length * size * CHAR_W))) + 10;
  const right = 8;
  const top = 26;
  const bottom = 2 * (size + 3) + 12;
  const plotH = 220;
  const height = top + plotH + bottom;
  const plotW = Math.max(60, width - left - right);
  const n = bars.length;
  const band = plotW / n;
  const barW = Math.min(28, Math.max(10, band * 0.6));
  const y = (v) => top + plotH - ((v - sc.lo) / (sc.hi - sc.lo)) * plotH;
  const cx = (i) => left + band * i + band / 2;
  const svg = h('svg:svg', { class: 'pl-chart pl-wc-svg', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', aria: { labelledby: titleId } });

  sc.ticks.forEach((v, k) => {
    svg.appendChild(h('svg:line', { class: 'grid', x1: left, x2: left + plotW, y1: y(v), y2: y(v) }));
    if (!privacy) svg.appendChild(h('svg:text', { class: 'lbl', x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }, tickText[k]));
  });

  bars.forEach((bar, i) => {
    const x0 = cx(i) - barW / 2;
    const level = bar.kind === 'total' ? bar.value : bar.end;
    if (i < n - 1) svg.appendChild(h('svg:line', { class: 'connector', x1: cx(i) + barW / 2, x2: cx(i + 1) - barW / 2, y1: y(level), y2: y(level) }));
    if (bar.kind === 'total') {
      const yv = y(bar.value);
      const base = top + plotH;
      const up = yv <= base;
      const hgt = Math.max(2, Math.abs(base - yv));
      svg.appendChild(h('svg:path', { class: barClass(bar), d: barPath(x0, up ? yv : base, barW, hgt, up ? 'top' : 'bottom') }));
      if (sc.truncated) {
        const by = up ? base - 10 : base + 10;
        svg.appendChild(h('svg:path', { class: 'brk', d: `M${x0 - 2},${by + 3} l${barW + 4},-5 M${x0 - 2},${by + 8} l${barW + 4},-5` }));
      }
      if (!privacy) svg.appendChild(h('svg:text', { class: 'val', x: cx(i), y: up ? yv - 7 : yv + size + 4, 'text-anchor': 'middle' }, ctx.fmt.money(bar.value)));
    } else {
      const ys = y(bar.start);
      const ye = y(bar.end);
      const yTop = Math.min(ys, ye);
      const hgt = Math.max(2, Math.abs(ye - ys));
      const positive = bar.effect >= 0;
      const children = [h('svg:path', { class: barClass(bar), d: barPath(x0, yTop, barW, hgt, positive ? 'top' : 'bottom') })];
      if (!privacy) children.push(h('svg:text', { class: 'val', x: cx(i), y: positive ? yTop - 7 : yTop + hgt + size + 4, 'text-anchor': 'middle' }, signed(ctx, bar.effect)));
      svg.appendChild(hitGroup(ctx, bar, { x: left + band * i, y: top, w: band, h: plotH }, children));
    }
    const label = h('svg:text', { class: 'lbl', x: cx(i), y: top + plotH + size + 6, 'text-anchor': 'middle' });
    svg.appendChild(label);
    wrapText(label, bar.label, { maxWidth: band - 6, maxLines: 2, size, x: cx(i) });
  });
  return { svg, scale: sc };
}

function drawHorizontal(ctx, bars, width, titleId) {
  const privacy = ctx.privacy();
  const size = 11;
  const sc = niceScale(bars.flatMap((b) => (b.kind === 'total' ? [b.value] : [b.start, b.end])));
  const rowH = 44;
  const top = 6;
  const bottom = privacy ? 8 : 20;
  const n = bars.length;
  const height = top + rowH * n + bottom;
  const labelW = Math.round(Math.min(150, Math.max(92, width * 0.36)));
  const valueW = privacy ? 0 : Math.ceil(Math.max(...bars.map((b) => (b.kind === 'total' ? ctx.fmt.money(b.value) : signed(ctx, b.effect)).length)) * size * CHAR_W) + 8;
  const left = labelW + 8;
  const plotW = Math.max(40, width - left - valueW - 4);
  const x = (v) => left + ((v - sc.lo) / (sc.hi - sc.lo)) * plotW;
  const barH = 18;
  const svg = h('svg:svg', { class: 'pl-chart pl-wc-svg', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', aria: { labelledby: titleId } });

  // Axis labels: only as many as fit without touching, always keeping the first tick and, when it fits, the last.
  const tickText = sc.ticks.map((v) => ctx.fmt.money(v, { compact: true }));
  const tickW = Math.max(...tickText.map((s) => s.length * 10 * CHAR_W)) + 8;
  const spacing = sc.ticks.length > 1 ? plotW / (sc.ticks.length - 1) : plotW;
  const every = Math.max(1, Math.ceil(tickW / spacing));
  const shown = sc.ticks.map((_, k) => k % every === 0);
  const lastShown = shown.lastIndexOf(true);
  if (lastShown !== sc.ticks.length - 1 && (sc.ticks.length - 1 - lastShown) * spacing >= tickW) shown[sc.ticks.length - 1] = true;
  sc.ticks.forEach((v, k) => {
    svg.appendChild(h('svg:line', { class: 'grid', x1: x(v), x2: x(v), y1: top, y2: top + rowH * n }));
    if (!privacy && shown[k]) {
      const tx = x(v);
      const anchor = tx - tickW / 2 < 0 ? 'start' : tx + tickW / 2 > width ? 'end' : 'middle';
      svg.appendChild(h('svg:text', { class: 'lbl', x: tx, y: height - 6, 'text-anchor': anchor, style: 'font-size:10px' }, tickText[k]));
    }
  });

  bars.forEach((bar, i) => {
    const cy = top + rowH * i + rowH / 2;
    const yb = cy - barH / 2;
    const level = bar.kind === 'total' ? bar.value : bar.end;
    if (i < n - 1) svg.appendChild(h('svg:line', { class: 'connector', x1: x(level), x2: x(level), y1: cy + barH / 2, y2: cy + rowH - barH / 2 }));
    if (bar.kind === 'total') {
      const xv = x(bar.value);
      const base = x(Math.max(sc.lo, Math.min(0, sc.hi)));
      const w = Math.max(2, Math.abs(xv - base));
      const xs = Math.min(xv, base);
      svg.appendChild(h('svg:path', { class: barClass(bar), d: barPath(xs, yb, w, barH, xv >= base ? 'right' : 'left') }));
      if (sc.truncated) svg.appendChild(h('svg:path', { class: 'brk', d: `M${xs + 8},${yb - 2} l-5,${barH + 4} M${xs + 13},${yb - 2} l-5,${barH + 4}` }));
      if (!privacy) svg.appendChild(h('svg:text', { class: 'val', x: width - 2, y: cy + 4, 'text-anchor': 'end' }, ctx.fmt.money(bar.value)));
    } else {
      const xs = x(bar.start);
      const xe = x(bar.end);
      const w = Math.max(2, Math.abs(xe - xs));
      const positive = bar.effect >= 0;
      const children = [h('svg:path', { class: barClass(bar), d: barPath(Math.min(xs, xe), yb, w, barH, positive ? 'right' : 'left') })];
      if (!privacy) children.push(h('svg:text', { class: 'val', x: width - 2, y: cy + 4, 'text-anchor': 'end' }, signed(ctx, bar.effect)));
      svg.appendChild(hitGroup(ctx, bar, { x: 0, y: top + rowH * i, w: width, h: rowH }, children));
    }
    const label = h('svg:text', { class: 'lbl', x: 0, y: cy + 4, 'text-anchor': 'start' });
    svg.appendChild(label);
    const lines = wrapText(label, bar.label, { maxWidth: labelW, maxLines: 2, size, x: 0 });
    if (lines > 1) label.setAttribute('y', cy - 3);
  });
  return { svg, scale: sc };
}

function bridgeChart(ctx, m, titleId) {
  const t = ctx.t;
  const bars = chartBars(ctx, m);
  const noteHost = h('p', { class: 'muted xs pl-wc-axis-note' });
  const chart = responsiveChart((width) => {
    const horizontal = isNarrow() || width < bars.length * 64 + 60;
    const { svg, scale } = horizontal ? drawHorizontal(ctx, bars, width, titleId) : drawVertical(ctx, bars, width, titleId);
    replaceChildren(noteHost, scale.truncated && !ctx.privacy() ? fill(ctx, 'changed.axis_note', { amount: amount(ctx, scale.lo) }) : null);
    noteHost.hidden = !(scale.truncated && !ctx.privacy());
    return svg;
  });
  const other = bars.find((b) => b.kind === 'other');
  return h('div', { class: 'stack pl-wc-bridge' },
    h('p', { class: 'sr-only' }, t('chart.alt_bridge', { from: ctx.fmt.money(m.bridge.from), to: ctx.fmt.money(m.bridge.to), count: m.steps.length })),
    chart,
    noteHost,
    h('p', { class: 'muted xs' }, t('changed.chart_hint'), other ? ` ${t('changed.other_hint')}` : null),
  );
}

function stepChips(ctx, s) {
  const t = ctx.t;
  return [
    s.isNew ? h('span', { class: 'pl-chip pl-chip-info' }, t('changed.step_new')) : null,
    s.isRemoved ? h('span', { class: 'pl-chip pl-chip-outline' }, t('changed.step_removed')) : null,
  ];
}

/** Line label for a step: a link to the line (current) or to its comparison row (prior only). */
function stepLink(ctx, s, { focusKey }) {
  return h('button', {
    class: 'pl-btn-link pl-wc-line-btn', type: 'button', dataset: { focusKey, lineFocus: s.cur ? '' : null },
    aria: { label: s.cur ? ctx.t('changed.open_line', { line: s.label }) : `${s.label}: ${ctx.t('changed.show_in_comparison')}` },
    on: { click: () => openStep(ctx, s) },
  }, s.label);
}

function bridgeTable(ctx, m) {
  const t = ctx.t;
  const b = m.bridge;
  const cols = 5;
  const rows = m.steps.map((s) => h('tr', { dataset: { lineId: s.lineId } },
    h('th', { scope: 'row' }, h('div', { class: 'pl-wc-cell' }, stepLink(ctx, s, { focusKey: `changed-row-${s.lineId}` }), stepChips(ctx, s))),
    h('td', { class: 'num' }, s.prior === null ? '—' : amount(ctx, s.prior)),
    h('td', { class: 'num' }, s.current === null ? '—' : amount(ctx, s.current)),
    h('td', { class: 'num' }, delta(ctx, s.delta)),
    h('td', { class: 'num' }, delta(ctx, s.effect)),
  ));
  if (!rows.length) rows.push(h('tr', null, h('td', { colspan: cols, class: 'muted' }, t('changed.no_changes'))));
  return h('div', { class: 'pl-table-wrap' },
    h('table', { class: 'pl-table pl-table-compact pl-wc-table' },
      h('caption', { class: 'sr-only' }, t('changed.bridge_table')),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, t('changed.col_line')),
        h('th', { scope: 'col', class: 'num' }, t('common.prior_period')),
        h('th', { scope: 'col', class: 'num' }, t('common.this_period')),
        h('th', { scope: 'col', class: 'num' }, t('common.change')),
        h('th', { scope: 'col', class: 'num' }, t('changed.col_effect')),
      )),
      h('tbody', null, rows),
      h('tfoot', null,
        h('tr', null, h('th', { scope: 'row' }, t('changed.from_period', { period: ctx.fmt.period(m.prior.period) })), h('td', { class: 'num' }, amount(ctx, b.from)), h('td', { colspan: 3 })),
        h('tr', null, h('th', { scope: 'row' }, t('changed.explained_total')), h('td', { colspan: 3 }), h('td', { class: 'num' }, delta(ctx, b.explained))),
        b.unexplained !== 0 ? h('tr', { class: 'pl-wc-unexplained' }, h('th', { scope: 'row' }, t('changed.unexplained')), h('td', { colspan: 3 }), h('td', { class: 'num' }, delta(ctx, b.unexplained))) : null,
        h('tr', { class: 'pl-wc-end' }, h('th', { scope: 'row' }, t('changed.to_period')), h('td'), h('td', { class: 'num' }, amount(ctx, b.to)), h('td', { class: 'num' }, delta(ctx, b.change)), h('td')),
      ),
    ));
}

function kv(label, valueEl, cls = null) {
  return h('div', { class: ['pl-kv', cls] }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, valueEl));
}

function bridgeCards(ctx, m) {
  const t = ctx.t;
  const b = m.bridge;
  const cards = m.steps.map((s) => h('div', { class: 'pl-card-soft pl-wc-step-card', dataset: { lineId: s.lineId } },
    h('div', { class: 'pl-wc-cell' }, stepLink(ctx, s, { focusKey: `changed-row-${s.lineId}` }), stepChips(ctx, s)),
    kv(t('common.prior_period'), s.prior === null ? '—' : amount(ctx, s.prior)),
    kv(t('common.this_period'), s.current === null ? '—' : amount(ctx, s.current)),
    kv(t('common.change'), delta(ctx, s.delta)),
    kv(t('changed.col_effect'), delta(ctx, s.effect), 'total'),
  ));
  const totals = h('div', { class: 'pl-card-soft pl-wc-step-card pl-wc-step-totals' },
    kv(t('changed.from_period', { period: ctx.fmt.period(m.prior.period) }), amount(ctx, b.from)),
    kv(t('changed.explained_total'), delta(ctx, b.explained)),
    b.unexplained !== 0 ? kv(t('changed.unexplained'), delta(ctx, b.unexplained), 'pl-wc-unexplained') : null,
    kv(t('changed.to_period'), amount(ctx, b.to), 'total'),
  );
  return h('div', { class: 'pl-cards pl-wc-cards', role: 'list', aria: { label: t('changed.bridge_table') } },
    cards.length ? cards.map((c) => { c.setAttribute('role', 'listitem'); return c; }) : h('p', { class: 'muted' }, t('changed.no_changes')),
    totals);
}

function bridgeCard(ctx, m, layout) {
  const t = ctx.t;
  const b = m.bridge;
  const id = uid('wcbridge');
  const titleId = `${id}-t`;
  const reconciled = b.unexplained === 0;
  const body = m.steps.length
    ? chartWithTable(ctx, { chart: bridgeChart(ctx, m, titleId), table: layout.narrow ? bridgeCards(ctx, m) : bridgeTable(ctx, m), label: t('changed.bridge_title') })
    : notice(ctx, t('changed.no_changes'), { kind: 'neutral' });
  return h('section', { class: 'pl-card pl-wc-card', aria: { labelledby: titleId } },
    h('h2', { id: titleId }, t('changed.bridge_title')),
    fill(ctx, 'changed.bridge_desc', { from: amount(ctx, b.from), to: amount(ctx, b.to) }, {}, { tag: 'p', cls: 'muted small' }),
    body,
    reconciled
      ? notice(ctx, t('changed.reconciled'), { kind: 'success' })
      : notice(ctx, [t('changed.unexplained'), ': ', delta(ctx, b.unexplained)], { kind: 'error' }),
  );
}

// --- Biggest movements --------------------------------------------------------

function reasonsFor(ctx, s) {
  const t = ctx.t;
  const items = [];
  if (s.isNew) items.push(t('changed.reason_new_line'));
  else if (s.isRemoved) items.push(t('changed.reason_removed_line'));
  else {
    if (s.hoursPrior !== null && s.hoursCurrent !== null && s.hoursPrior !== s.hoursCurrent) items.push(t('changed.reason_hours', { prior: ctx.fmt.hours(s.hoursPrior), current: ctx.fmt.hours(s.hoursCurrent) }));
    items.push(fill(ctx, 'changed.reason_amount', { prior: amount(ctx, s.prior), current: amount(ctx, s.current) }));
  }
  if (s.supplied) items.push(t('changed.reason_statutory'));
  return items;
}

function moverItem(ctx, m, s, idx) {
  const t = ctx.t;
  const panelId = `wc-why-${s.lineId}`;
  const open = expandedWhy.has(s.lineId);
  const explanation = s.cur && s.cur.explanationKey ? ctx.content.explanation(s.cur.explanationKey) : null;
  const plain = ctx.content.linePlain(s.line);
  const panel = h('div', { class: 'pl-wc-panel', id: panelId, hidden: !open },
    h('ul', { class: 'pl-wc-reasons' }, reasonsFor(ctx, s).map((r) => h('li', null, r))),
    explanation ? h('div', { class: 'pl-wc-exp' }, h('h4', null, explanation.title), h('p', null, explanation.body)) : (plain ? h('p', { class: 'muted small' }, plain) : null),
    h('div', { class: 'pl-btn-group' },
      h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: `changed-go-${s.lineId}` }, on: { click: () => openStep(ctx, s) } }, s.cur ? t('common.go_to_line') : t('changed.show_in_comparison'), icon('forward', { size: 16 })),
      s.cur ? h('button', { class: 'pl-btn pl-btn-sm pl-btn-quiet', type: 'button', dataset: { focusKey: `changed-calc-${s.lineId}` }, on: { click: () => ctx.actions.openCalc(s.lineId) } }, icon('help', { size: 16 }), t('common.calculation')) : null,
    ),
  );
  const toggle = h('button', {
    class: 'pl-btn-link pl-wc-why', type: 'button', aria: { expanded: String(open), controls: panelId }, dataset: { focusKey: `changed-why-${s.lineId}` },
    on: { click: () => { const now = !expandedWhy.has(s.lineId); if (now) expandedWhy.add(s.lineId); else expandedWhy.delete(s.lineId); toggle.setAttribute('aria-expanded', String(now)); panel.hidden = !now; } },
  }, icon('down', { size: 16 }), t('changed.explain_change'));
  return h('li', { class: 'pl-wc-mover', dataset: { lineId: s.lineId } },
    h('div', { class: 'pl-wc-mover-head' },
      h('span', { class: 'pl-wc-rank', aria: { hidden: 'true' } }, String(idx + 1)),
      h('div', { class: 'pl-wc-mover-title' }, lineTitle(ctx, s.line), h('span', { class: 'pl-wc-chips' }, stepChips(ctx, s))),
      h('div', { class: 'pl-wc-mover-amts' },
        delta(ctx, s.delta, { cls: 'pl-wc-mover-delta' }),
        fill(ctx, 'changed.effect_on_net', { amount: delta(ctx, s.effect) }, {}, { tag: 'span', cls: 'muted xs' }),
      ),
    ),
    toggle,
    panel,
  );
}

function moversCard(ctx, m) {
  const t = ctx.t;
  const id = uid('wcmov');
  const top = m.steps.slice(0, 5);
  return h('section', { class: 'pl-card pl-wc-card', aria: { labelledby: id } },
    h('h2', { id }, t('changed.biggest_movers')),
    h('p', { class: 'muted small' }, t('changed.movers_desc', { period: ctx.fmt.period(m.prior.period) })),
    top.length ? h('ol', { class: 'pl-wc-movers' }, top.map((s, i) => moverItem(ctx, m, s, i))) : h('p', { class: 'muted' }, t('changed.no_changes')),
  );
}

// --- Period comparison --------------------------------------------------------

function periodHead(ctx, p) {
  const t = ctx.t;
  const name = p.id === 'current' ? t('changed.series_current') : periodName(ctx, p.period);
  return [h('span', { class: 'cell-main' }, name), h('span', { class: 'cell-sub' }, shortPeriod(ctx, p.period))];
}

function comparisonRows(ctx, m) {
  const { profile } = ctx.doc;
  const cats = [...(profile.categoryOrder || [])];
  for (const r of m.comparison.rows) if (!cats.includes(r.category)) cats.push(r.category);
  return cats.map((category) => ({ category, label: ctx.content.category(category), rows: m.comparison.rows.filter((r) => r.category === category) })).filter((g) => g.rows.length);
}

function cmpLine(ctx, r) {
  const cur = ctx.line(r.lineId);
  const line = cur || { id: r.lineId, key: r.key, category: r.category, group: r.group };
  const label = ctx.content.lineLabel(line);
  const statutory = line.statutoryKey ? ctx.content.statutory(line.statutoryKey) : null;
  const missingNow = r.values[0] === null;
  const btn = cur
    ? h('button', { class: 'pl-btn-link pl-wc-line-btn', type: 'button', dataset: { lineFocus: '', focusKey: `changed-cmp-${r.lineId}` }, aria: { label: ctx.t('changed.open_line', { line: label }) }, on: { click: () => ctx.actions.focusLine(r.lineId) } }, label)
    : h('span', { class: 'pl-wc-line-text', tabindex: '-1', dataset: { lineFocus: '' } }, label);
  return h('div', { class: 'pl-wc-cell' }, btn,
    statutory && statutory.term !== label ? h('span', { class: 'cell-sub pl-statutory', lang: statutory.locale }, statutory.term) : null,
    missingNow ? h('span', { class: 'pl-chip pl-chip-outline' }, ctx.t('changed.step_removed')) : null,
    r.values.length > 1 && r.values[1] === null && r.values[0] !== null ? h('span', { class: 'pl-chip pl-chip-info' }, ctx.t('changed.step_new')) : null);
}

function comparisonTableEl(ctx, m) {
  const t = ctx.t;
  const periods = m.comparison.periods;
  const groups = comparisonRows(ctx, m);
  const body = [];
  for (const g of groups) {
    body.push(h('tr', { class: 'pl-wc-cat' }, h('th', { scope: 'colgroup', colspan: periods.length + 1 }, g.label)));
    for (const r of g.rows) body.push(h('tr', { dataset: { lineId: r.lineId } }, h('th', { scope: 'row' }, cmpLine(ctx, r)), r.values.map((v) => h('td', { class: 'num' }, v === null ? '—' : amount(ctx, v)))));
  }
  return h('div', { class: 'pl-table-wrap' },
    h('table', { class: 'pl-table pl-table-compact pl-wc-table pl-wc-cmp' },
      h('caption', { class: 'sr-only' }, t('changed.comparison_title')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('changed.col_line')), periods.map((p) => h('th', { scope: 'col', class: 'num' }, periodHead(ctx, p))))),
      h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, m.netLabel), m.periodTotals.map((v) => h('td', { class: 'num' }, amount(ctx, v))))),
    ));
}

function comparisonCards(ctx, m) {
  const t = ctx.t;
  const periods = m.comparison.periods;
  const groups = comparisonRows(ctx, m);
  const periodLabel = (p) => `${p.id === 'current' ? t('changed.series_current') : periodName(ctx, p.period)} · ${shortPeriod(ctx, p.period)}`;
  return h('div', { class: 'stack pl-wc-cmp' },
    h('p', { class: 'muted xs' }, t('changed.card_hint')),
    groups.map((g) => h('section', { class: 'pl-wc-cmp-group', aria: { label: g.label } },
      h('h3', { class: 'pl-wc-h3' }, g.label),
      h('div', { class: 'pl-cards' }, g.rows.map((r) => h('div', { class: 'pl-card-soft pl-wc-cmp-card', dataset: { lineId: r.lineId } },
        cmpLine(ctx, r),
        r.values.map((v, i) => kv(periodLabel(periods[i]), v === null ? '—' : amount(ctx, v), i === 0 ? 'is-current' : null)),
      ))),
    )),
    h('div', { class: 'pl-card-soft pl-wc-cmp-card pl-wc-cmp-totals' },
      h('h3', { class: 'pl-wc-h3' }, m.netLabel),
      m.periodTotals.map((v, i) => kv(periodLabel(periods[i]), amount(ctx, v), i === 0 ? 'is-current total' : null)),
    ),
  );
}

function comparisonCard(ctx, m, layout) {
  const t = ctx.t;
  const id = uid('wccmp');
  return h('section', { class: 'pl-card pl-wc-card', aria: { labelledby: id } },
    h('h2', { id }, t('changed.comparison_title')),
    h('p', { class: 'muted small' }, t('changed.comparison_desc', { count: m.comparison.periods.length })),
    layout.cmpCards ? comparisonCards(ctx, m) : comparisonTableEl(ctx, m),
  );
}

// --- Net pay trend ------------------------------------------------------------

function drawTrend(ctx, m, width, titleId) {
  const t = ctx.t;
  const privacy = ctx.privacy();
  const size = 11;
  const pts = m.trend;
  const n = pts.length;
  const sc = niceScale(pts.map((p) => p.value));
  const tickText = privacy ? [] : sc.ticks.map((v) => ctx.fmt.money(v, { compact: true }));
  const left = privacy ? 10 : Math.ceil(Math.max(...tickText.map((s) => s.length * size * CHAR_W))) + 10;
  const right = 14;
  const top = 26;
  const plotH = 120;
  const bottom = 24;
  const height = top + plotH + bottom;
  const plotW = Math.max(40, width - left - right);
  const x = (i) => left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v) => top + plotH - ((v - sc.lo) / (sc.hi - sc.lo)) * plotH;
  const band = n > 1 ? plotW / (n - 1) : plotW;
  const svg = h('svg:svg', { class: 'pl-chart pl-wc-svg', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', aria: { labelledby: titleId } });

  const cmpIdx = pts.findIndex((p) => !p.current && p.id === m.prior.periodId);
  if (cmpIdx >= 0) svg.appendChild(h('svg:rect', { class: 'band', x: x(cmpIdx) - Math.min(band, 56) / 2, y: top - 4, width: Math.min(band, 56), height: plotH + 8, rx: 6 }));

  sc.ticks.forEach((v, k) => {
    svg.appendChild(h('svg:line', { class: 'grid', x1: left, x2: left + plotW, y1: y(v), y2: y(v) }));
    if (!privacy) svg.appendChild(h('svg:text', { class: 'lbl', x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }, tickText[k]));
  });

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  svg.appendChild(h('svg:path', { class: 'area', d: `${path} L${x(n - 1)},${top + plotH} L${x(0)},${top + plotH} Z` }));
  svg.appendChild(h('svg:path', { class: 'line', d: path }));

  // Period labels: the current period is always labelled; earlier ones only where they do not touch another label.
  const names = pts.map((p) => (p.current ? t('changed.series_current') : periodName(ctx, p.period)));
  const anchorOf = (i) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
  const edges = (i) => { const w = names[i].length * size * CHAR_W; const px = x(i); const a = anchorOf(i); return a === 'start' ? [px, px + w] : a === 'end' ? [px - w, px] : [px - w / 2, px + w / 2]; };
  const every = Math.max(1, Math.ceil((n * 64) / Math.max(plotW, 1)));
  const labelled = [n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (i % every !== 0) continue;
    const [l, r] = edges(i);
    if (!labelled.some((j) => { const [l2, r2] = edges(j); return l < r2 + 6 && r > l2 - 6; })) labelled.push(i);
  }
  pts.forEach((p, i) => {
    const px = x(i);
    const py = y(p.value);
    const name = names[i];
    const dot = h('svg:circle', { class: ['dot', p.current && 'is-current'], cx: px, cy: py, r: p.current ? 6 : 5 });
    if (p.current) {
      svg.appendChild(dot);
      if (!privacy) {
        // The value sits above the point unless the previous point is higher, where it would cover it: then below.
        const prevY = n > 1 ? y(pts[n - 2].value) : py;
        const below = prevY < py - 4 && py + size + 10 <= top + plotH - 2;
        svg.appendChild(h('svg:text', { class: 'val', x: Math.min(px, width - 4), y: below ? py + size + 10 : py - 11, 'text-anchor': 'end' }, ctx.fmt.money(p.value)));
      }
    } else {
      const isCmp = p.id === m.prior.periodId;
      const activate = () => setCompare(ctx, m, p.id);
      const hw = Math.min(band, 56);
      svg.appendChild(h('svg:g', {
        class: 'hit', role: 'button', tabindex: '0', dataset: { focusKey: `changed-trend-${p.id}` },
        aria: { label: t('changed.trend_point_aria', { period: ctx.fmt.period(p.period), amount: ctx.fmt.money(p.value) }), pressed: String(isCmp) },
        on: { click: activate, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } } },
      },
      h('svg:rect', { class: 'hit-area', x: px - hw / 2, y: top - 4, width: hw, height: plotH + 8 }),
      h('svg:rect', { class: 'ring', x: px - hw / 2 + 1.5, y: top - 2.5, width: hw - 3, height: plotH + 5, rx: 6 }),
      dot));
    }
    if (labelled.includes(i)) svg.appendChild(h('svg:text', { class: 'lbl', x: px, y: top + plotH + size + 6, 'text-anchor': anchorOf(i) }, name));
  });
  return svg;
}

function trendTable(ctx, m, layout) {
  const t = ctx.t;
  const compareCell = (p) => {
    if (p.current) return h('span', { class: 'pl-chip' }, t('changed.series_current'));
    if (p.id === m.prior.periodId) return h('span', { class: 'pl-chip pl-chip-accent' }, t('changed.comparing_chip'));
    return h('button', { class: 'pl-btn-link pl-wc-cmp-btn', type: 'button', dataset: { focusKey: `changed-trend-row-${p.id}` }, aria: { label: t('changed.compare_with_period', { period: ctx.fmt.period(p.period) }) }, on: { click: () => setCompare(ctx, m, p.id) } }, t('changed.compare_with'));
  };
  const rows = m.trend.map((p) => h('tr', { class: p.current ? 'subtotal' : null },
    h('th', { scope: 'row' },
      h('span', { class: 'cell-main' }, p.current ? t('changed.series_current') : periodName(ctx, p.period)),
      h('span', { class: 'cell-sub' }, ctx.fmt.period(p.period)),
      layout.narrow ? h('span', { class: 'cell-sub' }, `${t('masthead.pay_date')}: ${ctx.fmt.date(p.payDate)}`) : null,
      layout.narrow ? h('div', null, compareCell(p)) : null),
    layout.narrow ? null : h('td', null, ctx.fmt.date(p.payDate)),
    h('td', { class: 'num' }, amount(ctx, p.value)),
    layout.narrow ? null : h('td', null, compareCell(p)),
  ));
  return h('div', { class: 'pl-table-wrap' },
    h('table', { class: 'pl-table pl-table-compact pl-wc-table pl-wc-trend-table' },
      h('caption', { class: 'sr-only' }, t('changed.trend_title')),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, t('masthead.period')),
        layout.narrow ? null : h('th', { scope: 'col' }, t('masthead.pay_date')),
        h('th', { scope: 'col', class: 'num' }, m.netLabel),
        layout.narrow ? null : h('th', { scope: 'col' }, t('changed.compare_with')),
      )),
      h('tbody', null, rows),
    ));
}

function trendCard(ctx, m, layout) {
  const t = ctx.t;
  const id = uid('wctrend');
  const chart = h('div', { class: 'stack' },
    h('p', { class: 'sr-only' }, t('chart.alt_trend', { count: m.trend.length })),
    responsiveChart((width) => drawTrend(ctx, m, width, id), { className: 'pl-wc-trend' }),
    h('p', { class: 'muted xs' }, t('changed.trend_hint')),
  );
  return h('section', { class: 'pl-card pl-wc-card', aria: { labelledby: id } },
    h('h2', { id }, t('changed.trend_title')),
    h('p', { class: 'muted small' }, t('changed.trend_desc', { count: m.trend.length })),
    chartWithTable(ctx, { chart, table: trendTable(ctx, m, layout), label: t('changed.trend_title') }),
  );
}
