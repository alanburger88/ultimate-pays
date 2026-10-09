/**
 * Calculation disclosure. For an explainable line it shows the inputs, the
 * formula with the same values, the result, rounding, source period and
 * whether Paylight's recalculation matches the issued amount. For amounts
 * payroll supplied (statutory tax and contributions) it says so and offers
 * the query path instead of reverse-engineering a legal formula.
 *
 * Numbers come from calc.js (explainLine) and are formatted by ctx.fmt only.
 * Governed text (explanations, policies, glossary) comes from ctx.content.
 *
 * Contract: export function openCalc(ctx, lineId)
 */
import { h, icon } from '../app/dom.js';
import { registerStrings, has } from '../app/i18n.js';
import { explainLine } from '../app/calc.js';
import { openDialog } from './components/overlay.js';
import { amount, lineTitle, notice, termButton } from './components/common.js';

registerStrings({
  'calc.inputs_none': 'Payroll did not supply calculation inputs for this line.',
  'calc.base_lines': 'Base lines: {lines}',
  'calc.related_explanation': 'Related explanation',
  'calc.related_policies': 'Related policies',
  'calc.glossary_term': 'Glossary term',
  'calc.time_entries.one': '{count} time entry',
  'calc.time_entries.other': '{count} time entries',
  'calc.line_missing': 'This line is not part of the statement.',
  'units.days': 'days',
  'units.hours': 'hours',
  'units.months': 'months',
  'units.weeks': 'weeks',
  'units.periods': 'periods',
});

const SVG_ATTRS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'pl-icon', 'aria-hidden': 'true', focusable: 'false' };

/** Calculator glyph used wherever a control opens the calculation disclosure. */
export function calcIcon(size = 18) {
  const svg = h('svg:svg', { ...SVG_ATTRS, width: size, height: size });
  for (const d of ['M6 3h12v18H6Z', 'M9 7h6', 'M9 12h.01', 'M12 12h.01', 'M15 12h.01', 'M9 16h.01', 'M12 16h.01', 'M15 16h.01']) svg.appendChild(h('svg:path', { d }));
  return svg;
}

/** Unit label for units_rate calculations: units.<unit> from the interface pack when it exists, else the unit as payroll supplied it. */
export function unitLabel(ctx, unit) {
  if (!unit) return '';
  const key = `units.${unit}`;
  return has(key) ? ctx.t(key) : unit;
}

/**
 * Text that must respect presentation privacy but is not a single amount
 * (a formula sentence, a rate). Behaves like amount(): blurred until activated.
 */
export function sensitiveText(ctx, text, { tag = 'span', cls = '' } = {}) {
  const el = h(tag, { class: ['pl-amount', 'tabular', cls] }, text);
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

/**
 * Interface sentence containing one money amount, rendered so the amount keeps
 * privacy handling: t(key) is interpolated with a sentinel and the amount()
 * element is inserted in its place.
 */
export function textWithAmount(ctx, key, minor, { name = 'amount', params = {}, tag = 'span', cls = '' } = {}) {
  const sentinel = '\u0000';
  const parts = ctx.t(key, { ...params, [name]: sentinel }).split(sentinel);
  const el = h(tag, { class: cls || null });
  parts.forEach((part, i) => { if (part) el.appendChild(document.createTextNode(part)); if (i < parts.length - 1) el.appendChild(amount(ctx, minor)); });
  return el;
}

function multiplierText(ctx, value100) {
  const digits = value100 % 100 === 0 ? 0 : value100 % 10 === 0 ? 1 : 2;
  return ctx.fmt.number(value100 / 100, digits);
}

/** Hours or units shown in the statement table for a line, or null when the line has neither. */
export function hoursText(ctx, line) {
  const calc = line.calc;
  if (!calc) return null;
  if (calc.type === 'hours_rate') return ctx.fmt.hours(calc.hoursHundredths);
  if (calc.type === 'units_rate') return `${ctx.fmt.number(calc.unitsHundredths / 100, 2)} ${unitLabel(ctx, calc.unit)}`.trim();
  return null;
}

/** Rate shown in the statement table for a line, or null. Money rates are privacy-sensitive, percentages are not. */
export function rateText(ctx, line) {
  const calc = line.calc;
  if (!calc) return null;
  if (calc.type === 'hours_rate') {
    const base = ctx.fmt.rate(calc.rateMinor, 'h');
    return { text: calc.multiplier100 && calc.multiplier100 !== 100 ? `${base} × ${multiplierText(ctx, calc.multiplier100)}` : base, money: true };
  }
  if (calc.type === 'units_rate') return { text: ctx.fmt.rate(calc.rateMinor, unitLabel(ctx, calc.unit) || null), money: true };
  if (calc.type === 'rate_base') return { text: ctx.fmt.percent(calc.ratePermyriad), money: false };
  return null;
}

/** Label for one calculation input (details.input_* keys). */
export function inputLabel(ctx, input) {
  const t = ctx.t;
  switch (input.kind) {
    case 'hours': return t('details.input_hours');
    case 'rate': return t('details.input_rate');
    case 'multiplier': return t('details.input_multiplier');
    case 'base': return t('details.input_base');
    case 'percent': return t('details.input_percent');
    case 'units': return t('details.input_units');
    case 'fixed': return t('details.input_fixed');
    case 'basis': return t('details.input_basis');
    case 'line': {
      const line = ctx.line(input.lineId);
      return line ? `${t('details.input_line')} — ${ctx.content.lineLabel(line)}` : `${t('details.input_line')} — ${input.lineId}`;
    }
    default: return input.kind;
  }
}

/** Formatted value for one calculation input, as an element (money respects privacy). */
export function inputValue(ctx, input) {
  switch (input.kind) {
    case 'hours': return h('span', { class: 'tabular' }, ctx.fmt.hours(input.value));
    case 'rate': return sensitiveText(ctx, ctx.fmt.rate(input.value, input.per ? unitLabel(ctx, input.per) : 'h'));
    case 'multiplier': return h('span', { class: 'tabular' }, `× ${multiplierText(ctx, input.value)}`);
    case 'percent': return h('span', { class: 'tabular' }, ctx.fmt.percent(input.value));
    case 'units': return h('span', { class: 'tabular' }, `${ctx.fmt.number(input.value / 100, 2)} ${unitLabel(ctx, input.unit)}`.trim());
    case 'base': case 'fixed': case 'basis': case 'line':
    default: return amount(ctx, input.value);
  }
}

/** The formula as one sentence with the same formatted values (details.formula_* keys). Null for supplied amounts. */
export function formulaSentence(ctx, exp) {
  const t = ctx.t;
  const fmt = ctx.fmt;
  const result = fmt.money(exp.result);
  const by = (kind) => exp.inputs.find((i) => i.kind === kind);
  switch (exp.formula) {
    case 'hours_rate': {
      const hours = fmt.hours(by('hours').value);
      const rate = fmt.rate(by('rate').value, 'h');
      const mult = by('multiplier');
      return mult ? t('details.formula_hours_rate_mult', { hours, rate, multiplier: multiplierText(ctx, mult.value), result }) : t('details.formula_hours_rate', { hours, rate, result });
    }
    case 'rate_base':
      return t('details.formula_rate_base', { base: fmt.money(by('base').value), percent: fmt.percent(by('percent').value), result });
    case 'units_rate': {
      const u = by('units');
      return t('details.formula_units_rate', { units: fmt.number(u.value / 100, 2), unit: unitLabel(ctx, u.unit), rate: fmt.money(by('rate').value), result });
    }
    case 'sum_lines':
      return t('details.formula_sum_lines', { count: exp.inputs.length, result });
    case 'fixed':
      return t('details.formula_fixed', { result });
    default:
      return null;
  }
}

/** Recalculation status as a notice: verified, mismatch, or supplied by payroll. */
export function statusNotice(ctx, exp) {
  const t = ctx.t;
  if (exp.check && exp.check.supplied) return notice(ctx, t('details.supplied_by_payroll'), { kind: 'neutral' });
  if (exp.check && exp.check.ok) return notice(ctx, t('details.calc_verified'), { kind: 'success' });
  const computed = exp.check && typeof exp.check.computed === 'number' ? ctx.fmt.money(exp.check.computed) : '—';
  return notice(ctx, t('details.calc_mismatch', { computed }), { kind: 'error' });
}

/** Compact calculation summary (formula sentence or supplied statement, plus status). Used by the mobile line sheet. */
export function calcSummary(ctx, line) {
  const t = ctx.t;
  const exp = explainLine(line, ctx.doc.record);
  const sentence = formulaSentence(ctx, exp);
  const basis = exp.inputs.find((i) => i.kind === 'basis');
  return h('div', { class: 'stack pl-calc-summary' },
    sentence ? sensitiveText(ctx, sentence, { tag: 'p', cls: 'pl-formula' }) : null,
    !sentence && basis ? textWithAmount(ctx, 'details.supplied_basis', basis.value, { name: 'basis', tag: 'p', cls: 'small' }) : null,
    statusNotice(ctx, exp),
  );
}

export function openCalc(ctx, lineId) {
  const t = ctx.t;
  const line = ctx.line(lineId);
  if (!line) { ctx.actions.toast(t('calc.line_missing'), { kind: 'error' }); return null; }
  const { record, content } = ctx.doc;
  const label = content.lineLabel(line);
  const exp = explainLine(line, record);
  const supplied = exp.type === 'supplied';
  const basis = exp.inputs.find((i) => i.kind === 'basis');
  const sentence = formulaSentence(ctx, exp);
  const explanation = line.explanationKey ? content.explanation(line.explanationKey) : null;
  const note = exp.note ? content.explanation(exp.note) : null;
  const policies = (exp.policyIds || []).map((id) => ({ id, policy: content.policy(id) })).filter((p) => p.policy);
  const termKey = line.glossaryKey || (line.statutoryKey && content.glossary(line.statutoryKey) ? line.statutoryKey : null);
  const entries = line.timeEntryIds && line.timeEntryIds.length ? line.timeEntryIds : null;
  const canLumi = Boolean(ctx.modules().lumi);
  const canQuery = Boolean(ctx.modules().queries);

  const section = (title, ...children) => h('section', { class: 'pl-calc-sec' }, h('h3', null, title), children);

  const inputs = exp.inputs.length
    ? h('dl', { class: 'pl-dl pl-calc-inputs' }, exp.inputs.map((input) => [
      h('dt', null, inputLabel(ctx, input)),
      h('dd', null, inputValue(ctx, input), input.kind === 'base' && input.lineIds ? h('span', { class: 'muted small block' }, t('calc.base_lines', { lines: input.lineIds.map((id) => { const l = ctx.line(id); return l ? content.lineLabel(l) : id; }).join(', ') })) : null),
    ]))
    : h('p', { class: 'muted small' }, t('calc.inputs_none'));

  const body = h('div', { class: 'pl-calc stack-lg' },
    h('div', { class: 'pl-calc-head' },
      h('div', { class: 'stack' }, lineTitle(ctx, line), h('div', { class: 'row' }, h('span', { class: 'pl-chip' }, content.category(line.category)), line.group ? h('span', { class: 'pl-chip pl-chip-outline' }, content.group(line.group)) : null)),
      amount(ctx, exp.result, { cls: 'val', tag: 'div' }),
    ),
    section(t('calc.inputs'), inputs),
    supplied
      ? section(t('calc.formula'),
        h('div', { class: 'stack' },
          notice(ctx, t('details.supplied_by_payroll'), { kind: 'neutral' }),
          basis ? textWithAmount(ctx, 'details.supplied_basis', basis.value, { name: 'basis', tag: 'p', cls: 'small' }) : null,
          h('p', { class: 'muted small' }, t('calc.statutory_note')),
        ))
      : section(t('calc.formula'), sensitiveText(ctx, sentence, { tag: 'p', cls: 'pl-formula' })),
    section(t('calc.result'), h('div', { class: 'stack' }, amount(ctx, exp.result, { cls: 'pl-calc-result', tag: 'div' }), supplied ? null : statusNotice(ctx, exp))),
    section(t('calc.rounding'), h('p', { class: 'small' }, t('details.rounding'))),
    section(t('calc.source'), h('ul', { class: 'pl-calc-source small' },
      h('li', null, t('details.source_period', { period: ctx.fmt.period(exp.sourcePeriod) })),
      exp.sourceRef ? h('li', null, t('details.source_ref', { ref: exp.sourceRef })) : null,
      entries ? h('li', null, `${t('details.related_time')}: ${t('calc.time_entries', { count: entries.length })}`) : null,
    )),
    note ? section(t('calc.related_explanation'), h('h4', null, note.title), h('p', { class: 'small' }, note.body)) : null,
    explanation && explanation !== note ? section(t('calc.related_explanation'), h('h4', null, explanation.title), h('p', { class: 'small' }, explanation.body)) : null,
    policies.length ? section(t('calc.related_policies'), policies.map((p) => h('details', { class: 'pl-details' }, h('summary', null, `${t('details.related_policy')}: ${p.policy.title}`), h('p', { class: 'small' }, p.policy.body)))) : null,
    termKey ? section(t('calc.glossary_term'), h('p', null, termButton(ctx, termKey))) : null,
    h('p', { class: 'muted small' }, t('calc.query_path')),
  );

  const footer = (dlg) => [
    entries ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.showEntries(entries); } } }, icon('clock', { size: 16 }), t('details.view_time')) : null,
    canLumi ? h('button', { class: 'pl-btn', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.openLumi({ contextLineIds: [line.id] }); } } }, icon('sparkle', { size: 16 }), t('details.explain_with_lumi')) : null,
    canQuery ? h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { dlg.close('action'); ctx.actions.openQuery({ lineIds: [line.id] }); } } }, icon('send', { size: 16 }), t('select.create_query')) : null,
  ].filter(Boolean);
  const hasFooter = Boolean(entries || canLumi || canQuery);

  return openDialog({
    title: t('calc.title', { line: label }),
    closeLabel: t('common.close'),
    className: 'pl-calc-dialog',
    body,
    actions: hasFooter ? footer : null,
  });
}
