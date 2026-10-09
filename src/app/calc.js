/**
 * Deterministic calculation engine. Every total, bridge, chart and story value
 * in the application is derived here from the issued record and the profile's
 * reconciliation specification. Nothing in the UI, Lumi, PDF or Excel may
 * compute money any other way.
 *
 * Money: integer minor units. Hours: integer hundredths. Rates: minor units per
 * unit (hoursTimesRate) or permyriad (baseTimesRate). Rounding: half away from
 * zero, applied once at the end of each calculation.
 */
import { hoursTimesRate, baseTimesRate, roundHalfUp } from './money.js';

export const CATEGORIES = ['earning', 'deduction', 'employer', 'reimbursement', 'noncash', 'advance', 'info'];

function matches(line, sel) {
  if (!sel) return false;
  if (sel.lineIds && !sel.lineIds.includes(line.id)) return false;
  if (sel.categories && !sel.categories.includes(line.category)) return false;
  if (sel.groups && !sel.groups.includes(line.group)) return false;
  if (sel.excludeGroups && sel.excludeGroups.includes(line.group)) return false;
  if (sel.excludeIds && sel.excludeIds.includes(line.id)) return false;
  if (sel.cash !== undefined && Boolean(line.cash) !== sel.cash) return false;
  if (sel.taxable !== undefined && Boolean(line.taxable) !== sel.taxable) return false;
  if (sel.flags) for (const f of sel.flags) if (!(line.flags || []).includes(f)) return false;
  if (sel.notFlags) for (const f of sel.notFlags) if ((line.flags || []).includes(f)) return false;
  return true;
}

/**
 * Evaluate the profile's totals specification over a set of lines.
 * Each total def is { id, sum: selector } or { id, formula: ['gross','-','deductions', …] }.
 * Returns { totals: {id: minor}, defs, order }.
 */
export function computeTotals(lines, profile) {
  const totals = {};
  const order = [];
  for (const def of profile.totals) {
    let value = 0;
    if (def.sum) {
      for (const line of lines) if (matches(line, def.sum)) value += line.amountMinor;
    } else if (def.formula) {
      let op = '+';
      for (const token of def.formula) {
        if (token === '+' || token === '-') { op = token; continue; }
        const v = totals[token];
        if (v === undefined) throw new Error(`Total "${def.id}" refers to unknown total "${token}"`);
        value += op === '+' ? v : -v;
        op = '+';
      }
    } else if (def.constant !== undefined) {
      value = def.constant;
    }
    totals[def.id] = value;
    order.push(def.id);
  }
  return { totals, defs: profile.totals, order };
}

/** Sign (+1, -1, 0) with which a line contributes to a given total. Totals are linear in the lines. */
export function lineEffect(line, totalId, profile, memo = new Map()) {
  const key = `${line.id}|${totalId}`;
  if (memo.has(key)) return memo.get(key);
  const def = profile.totals.find((d) => d.id === totalId);
  if (!def) throw new Error(`Unknown total ${totalId}`);
  let effect = 0;
  if (def.sum) effect = matches(line, def.sum) ? 1 : 0;
  else if (def.formula) {
    let op = '+';
    for (const token of def.formula) {
      if (token === '+' || token === '-') { op = token; continue; }
      effect += (op === '+' ? 1 : -1) * lineEffect(line, token, profile, memo);
      op = '+';
    }
  }
  memo.set(key, effect);
  return effect;
}

/** Compare computed totals with the totals payroll supplied. */
export function verifyTotals(record, profile) {
  const { totals } = computeTotals(record.lines, profile);
  const mismatches = [];
  for (const [id, supplied] of Object.entries(record.suppliedTotals || {})) {
    if (totals[id] === undefined) { mismatches.push({ id, computed: null, supplied }); continue; }
    if (totals[id] !== supplied) mismatches.push({ id, computed: totals[id], supplied });
  }
  for (const def of profile.totals) {
    if (def.required && (record.suppliedTotals || {})[def.id] === undefined) mismatches.push({ id: def.id, computed: totals[def.id], supplied: null });
  }
  return { ok: mismatches.length === 0, mismatches, totals };
}

/**
 * Recompute a line from its calculation inputs. Returns { ok, computed } or
 * { ok: true, supplied: true } for amounts payroll supplied without a trace.
 */
export function recomputeLine(line, record) {
  const calc = line.calc || { type: 'supplied' };
  switch (calc.type) {
    case 'hours_rate': {
      const computed = hoursTimesRate(calc.hoursHundredths, calc.rateMinor, calc.multiplier100 || 100);
      return { ok: computed === line.amountMinor, computed, type: calc.type };
    }
    case 'rate_base': {
      const base = resolveBase(calc, record);
      const computed = baseTimesRate(base, calc.ratePermyriad);
      return { ok: computed === line.amountMinor, computed, base, type: calc.type };
    }
    case 'units_rate': {
      const computed = roundHalfUp((calc.unitsHundredths * calc.rateMinor) / 100);
      return { ok: computed === line.amountMinor, computed, type: calc.type };
    }
    case 'sum_lines': {
      let total = 0;
      for (const id of calc.lineIds) { const l = record.lines.find((x) => x.id === id); if (!l) return { ok: false, error: `missing line ${id}` }; total += l.amountMinor; }
      return { ok: total === line.amountMinor, computed: total, type: calc.type };
    }
    case 'fixed':
      return { ok: calc.amountMinor === line.amountMinor, computed: calc.amountMinor, type: calc.type };
    case 'supplied':
    default:
      return { ok: true, supplied: true, type: 'supplied' };
  }
}

export function resolveBase(calc, record) {
  if (typeof calc.baseMinor === 'number') return calc.baseMinor;
  if (calc.baseLineIds) {
    let total = 0;
    for (const id of calc.baseLineIds) {
      const l = record.lines.find((x) => x.id === id);
      if (!l) throw new Error(`Base line ${id} not found`);
      total += l.amountMinor;
    }
    return total;
  }
  return 0;
}

/**
 * Build a calculation disclosure for a line: inputs, formula, rate/base,
 * rounding and source period. Values are numbers; the UI formats them.
 */
export function explainLine(line, record) {
  const calc = line.calc || { type: 'supplied' };
  const sourcePeriod = calc.sourcePeriod || record.document.period;
  const base = { lineId: line.id, type: calc.type, sourcePeriod, sourceRef: line.sourceRef || null, result: line.amountMinor, rounding: 'half-up-minor', note: calc.noteKey || null, policyIds: line.policyIds || [] };
  switch (calc.type) {
    case 'hours_rate':
      return { ...base, inputs: [
        { kind: 'hours', value: calc.hoursHundredths },
        { kind: 'rate', value: calc.rateMinor },
        ...(calc.multiplier100 && calc.multiplier100 !== 100 ? [{ kind: 'multiplier', value: calc.multiplier100 }] : []),
      ], formula: 'hours_rate', check: recomputeLine(line, record) };
    case 'rate_base':
      return { ...base, inputs: [
        { kind: 'base', value: resolveBase(calc, record), lineIds: calc.baseLineIds || null },
        { kind: 'percent', value: calc.ratePermyriad },
      ], formula: 'rate_base', check: recomputeLine(line, record) };
    case 'units_rate':
      return { ...base, inputs: [
        { kind: 'units', value: calc.unitsHundredths, unit: calc.unit || 'units' },
        { kind: 'rate', value: calc.rateMinor, per: calc.unit || 'unit' },
      ], formula: 'units_rate', check: recomputeLine(line, record) };
    case 'sum_lines':
      return { ...base, inputs: calc.lineIds.map((id) => ({ kind: 'line', lineId: id, value: (record.lines.find((x) => x.id === id) || {}).amountMinor })), formula: 'sum_lines', check: recomputeLine(line, record) };
    case 'fixed':
      return { ...base, inputs: [{ kind: 'fixed', value: calc.amountMinor }], formula: 'fixed', check: recomputeLine(line, record) };
    case 'supplied':
    default:
      return { ...base, type: 'supplied', inputs: calc.basisMinor !== undefined ? [{ kind: 'basis', value: calc.basisMinor }] : [], formula: 'supplied', check: { ok: true, supplied: true } };
  }
}

/** Lines of a prior period from history, normalised to the line shape. */
export function priorLines(prior) {
  return (prior.lines || []).map((l) => ({ ...l, category: l.category, amountMinor: l.amountMinor }));
}

/**
 * Reconciled variance bridge for a total (default: the profile's primary net
 * total) between a prior period and the current record. Steps sum exactly to
 * the change because totals are linear in lines.
 */
export function varianceBridge(record, prior, profile, totalId = profile.primaryTotal) {
  const memo = new Map();
  const curTotals = computeTotals(record.lines, profile).totals;
  const priorTotals = computeTotals(priorLines(prior), profile).totals;
  const from = priorTotals[totalId];
  const to = curTotals[totalId];
  const ids = new Set([...record.lines.map((l) => l.id), ...priorLines(prior).map((l) => l.id)]);
  const steps = [];
  for (const id of ids) {
    const cur = record.lines.find((l) => l.id === id) || null;
    const prev = priorLines(prior).find((l) => l.id === id) || null;
    const ref = cur || prev;
    const effect = lineEffect(ref, totalId, profile, memo);
    if (effect === 0) continue;
    const delta = (cur ? cur.amountMinor : 0) - (prev ? prev.amountMinor : 0);
    if (delta === 0) continue;
    steps.push({ lineId: id, key: ref.key, category: ref.category, group: ref.group, current: cur ? cur.amountMinor : null, prior: prev ? prev.amountMinor : null, delta, effect: effect * delta, isNew: !prev, isRemoved: !cur });
  }
  steps.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const explained = steps.reduce((s, x) => s + x.effect, 0);
  return { totalId, from, to, change: to - from, steps, explained, unexplained: to - from - explained, periodFrom: prior.period, periodTo: record.document.period };
}

/** Period-over-period comparison table rows for every line, across history (newest first). */
export function comparisonTable(record, history) {
  const periods = [{ period: record.document.period, payDate: record.document.payDate, lines: record.lines, id: 'current' }, ...history.map((hst) => ({ period: hst.period, payDate: hst.payDate, lines: priorLines(hst), id: hst.periodId }))];
  const ids = [];
  for (const p of periods) for (const l of p.lines) if (!ids.includes(l.id)) ids.push(l.id);
  const rows = ids.map((id) => {
    const ref = periods.map((p) => p.lines.find((l) => l.id === id)).find(Boolean);
    return { lineId: id, key: ref.key, category: ref.category, group: ref.group, values: periods.map((p) => { const l = p.lines.find((x) => x.id === id); return l ? l.amountMinor : null; }) };
  });
  return { periods: periods.map((p) => ({ id: p.id, period: p.period, payDate: p.payDate })), rows };
}

/** YTD chain check: ytd(current) == ytd(previous period) + amount(current) where both are known. */
export function verifyYtd(record) {
  const problems = [];
  const chain = [record, ...(record.history || [])];
  for (let i = 0; i < chain.length - 1; i++) {
    const cur = chain[i];
    const prev = chain[i + 1];
    const curLines = i === 0 ? cur.lines : priorLines(cur);
    for (const line of curLines) {
      if (typeof line.ytdMinor !== 'number') continue;
      const prevLine = priorLines(prev).find((l) => l.id === line.id);
      if (!prevLine || typeof prevLine.ytdMinor !== 'number') continue;
      // Reset at tax-year boundary: previous period belongs to another tax year.
      if (prev.taxYearLabel && cur.taxYearLabel && prev.taxYearLabel !== cur.taxYearLabel) continue;
      const expected = prevLine.ytdMinor + line.amountMinor;
      if (expected !== line.ytdMinor) problems.push({ lineId: line.id, periodId: cur.periodId || 'current', expected, actual: line.ytdMinor });
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Time entries summary and reconciliation against lines that reference them. */
export function timeSummary(record) {
  const time = record.time || { entries: [] };
  const entries = time.entries || [];
  const summary = { workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, premiumMinutes: 0, leaveMinutes: 0, holidayMinutes: 0, days: {} };
  for (const e of entries) {
    const day = summary.days[e.date] || (summary.days[e.date] = { date: e.date, entries: [], workedMinutes: 0, leaveMinutes: 0 });
    day.entries.push(e);
    if (e.type === 'work') {
      summary.workedMinutes += e.workedMinutes || 0;
      summary.regularMinutes += e.regularMinutes || 0;
      summary.overtimeMinutes += e.overtimeMinutes || 0;
      summary.premiumMinutes += e.premiumMinutes || 0;
      day.workedMinutes += e.workedMinutes || 0;
    } else if (e.type === 'leave') {
      summary.leaveMinutes += e.minutes || 0;
      day.leaveMinutes += e.minutes || 0;
    } else if (e.type === 'holiday') {
      summary.holidayMinutes += e.minutes || 0;
    }
  }
  return summary;
}

export function verifyTime(record) {
  const problems = [];
  const entries = (record.time && record.time.entries) || [];
  for (const line of record.lines) {
    if (!line.timeEntryIds || !line.calc || line.calc.type !== 'hours_rate') continue;
    let minutes = 0;
    for (const id of line.timeEntryIds) {
      const e = entries.find((x) => x.id === id);
      if (!e) { problems.push({ lineId: line.id, error: `time entry ${id} missing` }); continue; }
      const bucket = line.timeBucket || 'workedMinutes';
      minutes += e[bucket] || 0;
    }
    const hoursHundredths = Math.round((minutes / 60) * 100);
    if (hoursHundredths !== line.calc.hoursHundredths) problems.push({ lineId: line.id, expectedHours: hoursHundredths, actualHours: line.calc.hoursHundredths });
  }
  return { ok: problems.length === 0, problems };
}

/** Leave balance movement check: closing == opening + accrued − taken (+ adjustments). */
export function verifyLeave(record) {
  const problems = [];
  const balances = (record.time && record.time.leave && record.time.leave.balances) || [];
  for (const b of balances) {
    const expected = b.opening + (b.accrued || 0) - (b.taken || 0) + (b.adjusted || 0);
    if (expected !== b.closing) problems.push({ type: b.type, expected, actual: b.closing });
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Total reward summary. Definition is explicit: cash gross + employer-funded
 * contributions and benefits + non-cash benefits, never employee deductions.
 */
export function rewardSummary(record, profile) {
  const { totals } = computeTotals(record.lines, profile);
  const def = profile.reward || {};
  const grossId = def.grossTotal || 'gross';
  const cash = totals[grossId] || 0;
  const employer = record.lines.filter((l) => l.category === 'employer' && !(l.flags || []).includes('exclude_from_reward')).reduce((s, l) => s + l.amountMinor, 0);
  const noncash = record.lines.filter((l) => l.category === 'noncash' && !(l.flags || []).includes('exclude_from_reward')).reduce((s, l) => s + l.amountMinor, 0);
  const otherBenefits = (record.benefits || []).filter((b) => !b.lineIds || b.lineIds.length === 0).reduce((s, b) => s + (b.employerAmountMinor || 0), 0);
  const total = cash + employer + noncash + otherBenefits;
  const periodsPerYear = (record.document.period && record.document.period.of) || def.periodsPerYear || null;
  const net = totals[profile.primaryTotal] || 0;
  return {
    cash, employer, noncash, otherBenefits, total, net,
    employeeDeductions: totals[def.deductionsTotal || 'employeeDeductions'] || 0,
    periodsPerYear,
    // An annual figure is only meaningful with the profile's annualisation rules (13th/14th-month pay,
    // holiday and Christmas pay, one-off items, benefit-specific annual rules). No bundled profile
    // supplies them, so no annual figure is produced rather than an unsupported period × N estimate.
    annualised: def.annualisation ? null : null,
    annualisedNote: 'rules-required',
    components: [
      { id: 'cash', amount: cash },
      { id: 'employer', amount: employer },
      { id: 'noncash', amount: noncash },
      ...(otherBenefits ? [{ id: 'benefits', amount: otherBenefits }] : []),
    ].filter((c) => c.amount !== 0),
    definitionKey: def.definitionKey || 'reward.definition.default',
  };
}

/**
 * Gross-to-net flow: gross → deduction groups (and any additions) → net.
 * Exact by construction for every profile: totals are linear in lines, so
 *   net − gross = Σ (effect_on_net(line) − effect_on_gross(line)) × amount(line).
 * Each line whose two effects differ is one step; negative steps are deductions,
 * positive steps are additions (e.g. a German non-cash benefit that is in net but
 * not in cash gross, or a reimbursement when net is the paid amount).
 * Returns positive magnitudes grouped by line group, with the lines behind each group.
 */
export function grossToNetFlow(record, profile) {
  const { totals } = computeTotals(record.lines, profile);
  const memo = new Map();
  const netId = profile.primaryTotal;
  const grossId = profile.reward && profile.reward.grossTotal ? profile.reward.grossTotal : 'gross';
  const gross = totals[grossId] || 0;
  const net = totals[netId] || 0;
  const minus = {};
  const plus = {};
  for (const line of record.lines) {
    const diff = lineEffect(line, netId, profile, memo) - lineEffect(line, grossId, profile, memo);
    if (diff === 0 || line.amountMinor === 0) continue;
    const signed = diff * line.amountMinor;
    const bucket = signed < 0 ? minus : plus;
    const g = line.group || line.category;
    const entry = bucket[g] || (bucket[g] = { group: g, amount: 0, lineIds: [], category: line.category });
    entry.amount += Math.abs(signed);
    entry.lineIds.push(line.id);
  }
  const deductions = Object.values(minus).sort((a, b) => b.amount - a.amount);
  const additions = Object.values(plus).sort((a, b) => b.amount - a.amount);
  const deductionsTotal = deductions.reduce((x, d) => x + d.amount, 0);
  const additionsTotal = additions.reduce((x, d) => x + d.amount, 0);
  return { grossId, netId, gross, net, deductions, additions, deductionsTotal, additionsTotal, reconciles: gross - deductionsTotal + additionsTotal === net, totals };
}

/**
 * Gross pay year to date: for each line counted in the gross total, the latest year-to-date value
 * across this statement and earlier statements of the same tax year (lines absent this period still count).
 * Returns null when the record carries no year-to-date values for gross lines.
 */
export function grossYearToDate(record, profile) {
  const grossId = profile.reward && profile.reward.grossTotal ? profile.reward.grossTotal : 'gross';
  const memo = new Map();
  const year = record.document.taxYear && record.document.taxYear.label;
  const latest = new Map();
  const periods = [{ lines: record.lines, sameYear: true }, ...(record.history || []).map((h) => ({ lines: priorLines(h), sameYear: !year || !h.taxYearLabel || h.taxYearLabel === year }))];
  for (const p of periods) {
    if (!p.sameYear) continue;
    for (const line of p.lines) {
      if (typeof line.ytdMinor !== 'number' || latest.has(line.id)) continue;
      if (lineEffect(line, grossId, profile, memo) !== 1) continue;
      latest.set(line.id, line.ytdMinor);
    }
  }
  if (!latest.size) return null;
  let total = 0;
  for (const v of latest.values()) total += v;
  return { grossId, amount: total, lineIds: Array.from(latest.keys()) };
}

/**
 * Selection summary by category. Earnings, deductions and employer contributions are never added
 * together; a single total is given only when every selected line shares one category.
 */
export function selectionSummary(lines) {
  const byCategory = new Map();
  for (const l of lines) byCategory.set(l.category, (byCategory.get(l.category) || 0) + l.amountMinor);
  const categories = Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount }));
  return { categories, single: categories.length === 1 ? categories[0] : null, count: lines.length };
}

/** Sum helper for arbitrary line selections (used by selection tray / Lumi). */
export function sumLines(lines) {
  return lines.reduce((s, l) => s + l.amountMinor, 0);
}

/** Full integrity run used by validation and by the Record section's provenance panel. */
export function verifyRecord(record, profile) {
  const totals = verifyTotals(record, profile);
  const lines = record.lines.map((l) => ({ id: l.id, ...recomputeLine(l, record) })).filter((r) => !r.ok);
  const ytd = verifyYtd(record);
  const time = verifyTime(record);
  const leave = verifyLeave(record);
  const bridges = (record.history || []).map((prior) => varianceBridge(record, prior, profile)).filter((b) => b.unexplained !== 0).map((b) => ({ period: b.periodFrom, unexplained: b.unexplained }));
  const paymentOk = !record.payment || record.payment.amountMinor === undefined || record.payment.amountMinor === totals.totals[profile.payableTotal || profile.primaryTotal];
  return {
    ok: totals.ok && lines.length === 0 && ytd.ok && time.ok && leave.ok && bridges.length === 0 && paymentOk,
    totals, lineProblems: lines, ytd, time, leave, bridges, paymentOk,
  };
}
