/**
 * Lumi's local answer engine: deterministic document search and authored
 * explanations. No model, no generated prose, no arithmetic.
 *
 *  - Every figure comes from ctx.doc.computed (calc.js) or the issued record and
 *    is formatted by ctx.fmt. Nothing here adds, subtracts or infers money.
 *  - Every sentence is an interface string (ctx.t) or governed content
 *    (ctx.content). User text is treated as data to search with, never as text
 *    to echo back.
 *  - The result is a plain object the UI renders: { text, items?, sources,
 *    showMe?, offerQuery?, pickLines?, sensitive, intent }.
 *
 * Contract: export function answerLocally(ctx, question, contextLineIds)
 * This module must not touch the DOM: it is unit-tested in Node.
 */
import { registerStrings } from '../app/i18n.js';
import { explainLine } from '../app/calc.js';

registerStrings({
  'lumi.answer_payable': '{label}: {payable}. {plain}',
  'lumi.answer_net_simple': '{label}: {net}. The totals on this statement:',
  'lumi.answer_overtime_intro': 'Overtime in this statement:',
  'lumi.answer_leave_intro': 'Your leave balances this period:',
  'lumi.answer_reward_noncash': '{label}: {amount}',
  'lumi.answer_reward_total': 'Total reward this period: {total}',
  'lumi.answer_difference_filtered': 'For the lines you asked about:',
  'lumi.answer_difference_more': 'Other movements:',
  'lumi.step_new': '{label}: {effect} (new this period)',
  'lumi.step_removed': '{label}: {effect} (not on this statement)',
  'lumi.step_effect': '{label}: {effect}',
  'lumi.no_answer_no_query': 'I don’t have an approved explanation for that in this statement.',
});

/** Starter chips map to intents in every language: the UI sends the translated text back. */
export const STARTERS = [
  { key: 'lumi.starter_why_different', intent: 'difference' },
  { key: 'lumi.starter_explain_deduction', intent: 'deduction' },
  { key: 'lumi.starter_overtime', intent: 'overtime' },
  { key: 'lumi.starter_what_is_net', intent: 'net' },
  { key: 'lumi.starter_leave', intent: 'leave' },
  { key: 'lumi.starter_reward', intent: 'reward' },
];

// English stop words only; other languages rely on term weighting (a word shared by many entries counts for little).
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'my', 'me', 'i', 'mine', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those', 'what', 'whats', 'why', 'how', 'who', 'which', 'when', 'where', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'do', 'does', 'did', 'about', 'with', 'from', 'as', 'at', 'by', 'can', 'could', 'would', 'should', 'will', 'please', 'tell', 'show', 'explain', 'mean', 'means', 'much', 'many', 'there', 'here', 'have', 'has', 'had', 'get', 'got', 'up', 'down', 'not', 'no', 'so', 'if', 'than', 'then', 'into', 'out', 'off', 'per', 'all', 'any', 'some', 'more', 'less', 'did', 'done', 'made', 'make', 'thing', 'things', 'something', 'anything', 'again', 'just', 'also', 'still', 'very', 'really', 'own', 'de', 'la', 'le', 'les', 'des', 'du', 'et', 'est', 'mon', 'ma', 'mes', 'der', 'die', 'das', 'und', 'ist', 'il', 'lo', 'gli', 'che', 'e']);

const DEFINITIONAL = /\b(what (is|are|does|do)|what's|whats|mean|meaning|means|define|definition|stand(s)? for|explain the term|is a|is an)\b/;
const DIFFERENCE = /\b(differen(t|ce|ces)|changed?|changes|changing|compar(e|ed|ison|ing)|prior (period|pay|month)|previous (pay|period|statement|month|time)|last (pay|period|statement|time|month|week)|went (up|down)|gone (up|down)|movements?|varian(ce|t))\b/;
const WHY_AMOUNT = /\b(why|how come|what happened)\b[^.?!]*\b(lower|higher|less|more|smaller|bigger|larger|dropped?|drops?|increased?|decreased?|short|missing)\b/;
const OVERTIME = /\b(overtime|over-time|extra hours|time and a half|time-and-a-half|double time)\b/;
const NET = /\b(net|take[- ]home|made (up )?of|paid (to|into) (me|my)|deposit(ed)?|bank)\b/;
const LEAVE = /\b(leave|vacation|holidays?|sick|days off|pto|time off|absence|balance)\b/;
const REWARD = /\b(employer|on top|total reward|contribut(es|ion|ions)|match(es|ing|ed)?|benefits?|package)\b/;
const AMOUNT_ORIENTED = /\b(how much|amount|deduction|deducted|this period|paid|earn(ed|ings)?|cost|costs|premium|contribution)\b/;
const DEDUCTION = /\b(deduct(ion|ions|ed)?|withheld|withholding|taken (off|out|from)|this (line|amount|item|one|deduction|figure)|explain this|what is this|it)\b/;
const QUERY = /\b(raise|submit|send|open|create|log|file|lodge)\b[^.?!]*\b(quer(y|ies)|dispute|complaint|ticket|case)\b/;
const GUARD = [
  /\b(change|update|edit|adjust|increase|decrease|raise|lower|fix|correct|reverse|cancel|refund|reduce|remove|delete|add)\b[^.?!]*\b(my|the|this|a)\b[^.?!]*\b(pay|salary|wage|wages|rate|deduction|deductions|tax|taxes|amount|hours|net|gross|contribution|contributions|line|statement|payslip|record)\b/,
  /\b(approve|approval|authori[sz]e|sign off|back-?pay me|pay me)\b/,
  /\b(tax|legal|financial) (ruling|advice|opinion|determination)\b/,
  /\b(is|are|was|were) (my|the) (tax|taxes|deductions?|contributions?|cpp|ei|paye|uif|withholding) (right|correct|wrong|accurate|legal|too (high|low|much|little))\b/,
  /\b(too much|too little|the right amount of|the wrong amount of) tax\b/,
  /\b(should|ought to) i (be )?(pay|paying|owe|owing|claim|claiming)\b/,
  /\b(other|another|different|every|each|all) (employee|employees|person|people|staff|colleague|colleagues|worker|workers)\b/,
  /\b(colleague|coworker|co-worker|teammate)s?\b/,
  /\bsomeone else\b/,
  /\b(my|the|our) (manager|boss|team|director|supervisor)('s|s)? (pay|salary|statement|payslip|wages|earnings)\b/,
];

// --- Language-aware guard ------------------------------------------------------------
// Vocabulary lives in the interface packs (lumi.guard_*), as '|'-separated, lower-case stems or phrases,
// so every language refuses the same things. A stem matches any word that starts with it; a phrase
// (containing a space) matches as a substring. The English regexes above remain as a second net.

function packTerms(ctx, key) {
  const v = ctx.t(key);
  if (!v || v.charAt(0) === '\u27e6') return [];
  return v.split('|').map((x) => norm(x)).filter(Boolean);
}
function words(q) { return q.split(/[^\p{L}\p{N}*]+/u).filter(Boolean); }
/**
 * term forms: 'stem' matches a word starting with it; '*stem' matches a word containing it (languages with
 * prefixes, e.g. isiZulu u-khuphul-e); 'two words' matches that word sequence.
 */
function hasTerm(q, ws, terms) {
  const joined = ` ${ws.join(' ')} `;
  return terms.some((term) => {
    const parts = words(term);
    if (parts.length > 1) return joined.includes(` ${parts.join(' ')} `); // phrases, incl. hyphenated 'pouvez-vous'
    if (term.charAt(0) === '*') { const core = term.slice(1); return core.length > 2 && ws.some((w) => w.includes(core)); }
    return ws.some((w) => w.startsWith(term));
  });
}
function startsWithTerm(ws, terms) { const first = ws[0] || ''; return terms.some((t) => words(t).length === 1 && (t.charAt(0) === '*' ? first.includes(t.slice(1)) : first.startsWith(t))); }

/**
 * Requests Lumi must decline or redirect, in any bundled language.
 * Returns { intent, text, offerQuery } or null. Exported so the connected path applies it too.
 */
export function guardCheck(ctx, question) {
  const q = norm(question);
  if (!q) return null;
  const ws = words(q);
  const t = ctx.t;
  if (QUERY.test(q) || hasTerm(q, ws, packTerms(ctx, 'lumi.guard_query'))) return { intent: 'query', text: t('lumi.not_submitted'), sources: [], offerQuery: true, sensitive: false };
  const explaining = hasTerm(q, ws, packTerms(ctx, 'lumi.guard_explain'));
  const requesting = hasTerm(q, ws, packTerms(ctx, 'lumi.guard_request'));
  const verbs = packTerms(ctx, 'lumi.guard_change_verbs');
  const imperative = startsWithTerm(ws, verbs);
  const changeAsked = (requesting || imperative) && !explaining && hasTerm(q, ws, verbs) && hasTerm(q, ws, packTerms(ctx, 'lumi.guard_pay_nouns'));
  const approveTerms = packTerms(ctx, 'lumi.guard_approve');
  const approveAsked = !explaining && (requesting || startsWithTerm(ws, approveTerms)) && hasTerm(q, ws, approveTerms);
  const english = GUARD.some((re) => re.test(q));
  const name = (ctx.doc && ctx.doc.record && ctx.doc.record.employee) || {};
  const own = [name.givenName, name.familyName].filter(Boolean).map((x) => norm(x));
  const possessive = String(question).match(/\b(\p{Lu}[\p{L}-]+)(?:'s|’s)\s+(pay|salary|wage|wages|payslip|statement|earnings)\b/u);
  const otherNamed = possessive && !own.includes(norm(possessive[1]));
  if (changeAsked || approveAsked || english || otherNamed || hasTerm(q, ws, packTerms(ctx, 'lumi.guard_tax')) || hasTerm(q, ws, packTerms(ctx, 'lumi.guard_others'))) {
    return { intent: 'guard', text: t('lumi.cannot_change'), sources: [], offerQuery: true, sensitive: false };
  }
  if (hasTerm(q, ws, packTerms(ctx, 'lumi.guard_hypothetical'))) return { intent: 'hypothetical', text: t('lumi.no_hypothetical'), sources: [], offerQuery: false, sensitive: false };
  return null;
}

/**
 * Money figures in a connected answer that do not appear anywhere in this record (line amounts, YTD,
 * rates, totals, payment, changes between periods). Only figures written with two decimals are checked.
 * Returns the unmatched figures as written.
 */
export function unverifiedFigures(ctx, text) {
  const { record, computed } = ctx.doc;
  const known = new Set();
  const add = (v) => { if (typeof v === 'number' && Number.isFinite(v)) known.add(Math.abs(Math.round(v))); };
  for (const l of record.lines) { add(l.amountMinor); add(l.ytdMinor); if (l.calc) { add(l.calc.rateMinor); add(l.calc.basisMinor); add(l.calc.baseMinor); add(l.calc.amountMinor); } }
  for (const hst of record.history || []) for (const l of hst.lines || []) { add(l.amountMinor); add(l.ytdMinor); }
  for (const v of Object.values(computed.totals || {})) add(v);
  if (record.payment) add(record.payment.amountMinor);
  if (computed.flow) { add(computed.flow.deductionsTotal); add(computed.flow.additionsTotal); for (const g of [...computed.flow.deductions, ...computed.flow.additions]) add(g.amount); }
  if (computed.reward) { add(computed.reward.total); add(computed.reward.employer); add(computed.reward.cash); add(computed.reward.noncash); }
  if (computed.bridge) { add(computed.bridge.change); add(computed.bridge.from); add(computed.bridge.to); for (const st of computed.bridge.steps) { add(st.delta); add(st.effect); add(st.current); add(st.prior); } }
  for (const b of record.benefits || []) { add(b.employerAmountMinor); add(b.employeeAmountMinor); }
  const out = [];
  const re = /\d[\d\s.,'\u00a0\u202f]*[.,]\d{2}(?!\d)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^\d]/g, '');
    const minor = Number(digits);
    if (!Number.isFinite(minor) || known.has(minor)) continue;
    out.push(raw);
  }
  return out;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, '\'').replace(/\s+/g, ' ').trim();
}

/** Lower-case word tokens (Unicode letters and digits), stop words removed. Exported for tests. */
export function tokenize(text) {
  return norm(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w));
}

function uniq(arr) { return Array.from(new Set(arr)); }

/** Whole-phrase match using Unicode-aware boundaries (\b is ASCII-only in JS). */
function hasPhrase(q, phrase) {
  const p = norm(phrase);
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'u').test(q);
}

function lineLabel(ctx, line) { return ctx.content.lineLabel(line); }

function sectionAvailable(ctx, id) {
  if (!ctx.sections) return true;
  try { return ctx.sections().some((s) => s.id === id); } catch (e) { return true; }
}

function showMe(ctx, section, extra = {}) {
  return sectionAvailable(ctx, section) ? { section, ...extra } : null;
}

/** Index of lines by searchable tokens (label, key, glossary/statutory keys weigh 1; plain text weighs 0.5). */
function buildLineIndex(ctx) {
  const lines = ctx.doc.record.lines;
  const docs = lines.map((line) => {
    const strong = uniq([...tokenize(lineLabel(ctx, line)), ...tokenize(line.key.replace(/_/g, ' ')), ...tokenize((line.glossaryKey || '').replace(/_/g, ' ')), ...tokenize((line.statutoryKey || '').replace(/_/g, ' '))]);
    const weak = uniq(tokenize(ctx.content.linePlain(line))).filter((t) => !strong.includes(t));
    return { line, strong, weak };
  });
  const df = {};
  for (const d of docs) for (const t of uniq([...d.strong, ...d.weak])) df[t] = (df[t] || 0) + 1;
  return { docs, df };
}

/** Score every line against the question. Returns [{ line, score, strong }] sorted by score, best first. */
function scoreLines(ctx, q, index) {
  const qTokens = uniq(tokenize(q));
  const wantsEmployer = /\bemployer\b/.test(q);
  const out = [];
  for (const d of index.docs) {
    let strong = 0;
    let weak = 0;
    for (const t of qTokens) {
      if (d.strong.includes(t)) strong += 1 / index.df[t];
      else if (d.weak.includes(t)) weak += 0.5 / index.df[t];
    }
    let score = strong + weak;
    if (score > 0) {
      // Tie-break only (larger than the tie margin): prefer the employee's own lines unless the question says "employer".
      if (wantsEmployer && d.line.category === 'employer') score += 0.02;
      if (!wantsEmployer && d.line.category !== 'employer') score += 0.02;
    }
    out.push({ line: d.line, score, strong });
  }
  return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

/** Lines the question clearly names (label or key matched): the best line when it stands out; several when they tie. */
function namedLines(ctx, q, index) {
  const scored = scoreLines(ctx, q, index).filter((x) => x.strong >= 0.5);
  if (!scored.length) return [];
  const best = scored[0].score;
  return scored.filter((x) => best - x.score < 0.001).map((x) => x.line);
}

/** Glossary and statutory term the question mentions, longest phrase first. */
function findTerm(ctx, q) {
  const { content, profile } = ctx.doc;
  const glossary = content.glossaryAll ? content.glossaryAll() : {};
  const candidates = [];
  const phrasesFor = (key, term) => {
    const list = [key.replace(/_/g, ' ')];
    if (term) {
      list.push(term);
      const paren = term.match(/\(([^)]+)\)/);
      if (paren) { list.push(paren[1]); list.push(term.replace(/\s*\([^)]*\)\s*/g, ' ').trim()); }
      const dash = term.split(/\s[—–-]\s/)[0];
      if (dash && dash !== term) list.push(dash);
    }
    return uniq(list.map(norm).filter((p) => p.length >= 2));
  };
  for (const [key, entry] of Object.entries(glossary)) {
    for (const phrase of phrasesFor(key, entry.term)) if (hasPhrase(q, phrase)) candidates.push({ key, phrase, entry, statutory: null });
  }
  for (const [key, st] of Object.entries(profile.statutoryTerms || {})) {
    for (const phrase of phrasesFor(key, st.term)) if (hasPhrase(q, phrase)) candidates.push({ key, phrase, entry: glossary[key] || null, statutory: st });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.phrase.length - a.phrase.length || (b.entry ? 1 : 0) - (a.entry ? 1 : 0));
  return candidates[0];
}

function effectText(ctx, minor) {
  return ctx.fmt.money(minor, { signDisplay: 'exceptZero' });
}

function stepItem(ctx, step) {
  const label = lineLabel(ctx, { key: step.key });
  const effect = effectText(ctx, step.effect);
  if (step.isNew) return ctx.t('lumi.step_new', { label, effect });
  if (step.isRemoved) return ctx.t('lumi.step_removed', { label, effect });
  return ctx.t('lumi.step_effect', { label, effect });
}

// --- intents ---------------------------------------------------------------------------------

function answerDifference(ctx, focusLines) {
  const { record, computed } = ctx.doc;
  const bridge = computed && computed.bridge;
  if (!(record.history || []).length || !bridge) return { intent: 'difference', text: ctx.t('story.cap_changes_no_history'), sources: [], sensitive: false };
  const period = ctx.fmt.period(bridge.periodFrom);
  if (bridge.change === 0 && !bridge.steps.length) return { intent: 'difference', text: ctx.t('lumi.answer_difference_none', { period }), sources: [], showMe: showMe(ctx, 'what-changed'), sensitive: false };
  const direction = bridge.change > 0 ? ctx.t('lumi.direction_up') : ctx.t('lumi.direction_down');
  const text = bridge.change === 0 ? ctx.t('lumi.answer_difference_none', { period }) : ctx.t('lumi.answer_difference_intro', { direction, amount: ctx.fmt.money(Math.abs(bridge.change)), period });
  const focusIds = (focusLines || []).map((l) => l.id);
  const focused = bridge.steps.filter((s) => focusIds.includes(s.lineId));
  let steps;
  const items = [];
  if (focused.length) {
    items.push(ctx.t('lumi.answer_difference_filtered'));
    steps = focused;
    for (const s of steps) items.push(stepItem(ctx, s));
    const rest = bridge.steps.filter((s) => !focusIds.includes(s.lineId)).slice(0, 3);
    if (rest.length) { items.push(ctx.t('lumi.answer_difference_more')); for (const s of rest) items.push(stepItem(ctx, s)); steps = [...steps, ...rest]; }
  } else {
    steps = bridge.steps.slice(0, 3);
    for (const s of steps) items.push(stepItem(ctx, s));
  }
  const sources = steps.filter((s) => ctx.line(s.lineId)).map((s) => ({ type: 'line', id: s.lineId }));
  return { intent: 'difference', text, items, sources, showMe: showMe(ctx, 'what-changed'), sensitive: true };
}

function answerLine(ctx, line) {
  const { content, record } = ctx.doc;
  const label = lineLabel(ctx, line);
  const plain = content.linePlain(line);
  const exp = explainLine(line, record);
  const explanation = line.explanationKey ? content.explanation(line.explanationKey) : null;
  const items = [];
  if (explanation && explanation.body) items.push(explanation.body);
  if (exp.type === 'supplied') items.push(ctx.t('details.supplied_by_payroll'));
  const sources = [{ type: 'line', id: line.id }, { type: 'calc', id: line.id }];
  for (const id of line.policyIds || []) if (content.policy(id)) sources.push({ type: 'policy', id });
  const termKey = line.glossaryKey || (line.statutoryKey && content.glossary(line.statutoryKey) ? line.statutoryKey : null);
  if (termKey) sources.push({ type: 'glossary', id: termKey });
  const text = [ctx.t('lumi.answer_line_intro', { line: label, amount: ctx.fmt.money(line.amountMinor) }), plain].filter(Boolean).join(' ');
  return { intent: 'line', text, items, sources, showMe: showMe(ctx, 'pay-details', { lineId: line.id }), sensitive: true };
}

function pickLine(ctx, lines) {
  return { intent: 'pick_line', text: ctx.t('lumi.pick_line'), sources: [], pickLines: lines.map((l) => l.id), sensitive: false };
}

function answerDeduction(ctx, contextLines) {
  const deductions = contextLines.filter((l) => l.category === 'deduction');
  if (deductions.length === 1) return answerLine(ctx, deductions[0]);
  if (contextLines.length === 1) return answerLine(ctx, contextLines[0]);
  const candidates = deductions.length > 1 ? deductions : ctx.doc.record.lines.filter((l) => l.category === 'deduction');
  if (!candidates.length) return answerSearchOrNothing(ctx, 'deduction', []);
  return pickLine(ctx, candidates);
}

function multiplierText(ctx, value100) {
  const digits = value100 % 100 === 0 ? 0 : value100 % 10 === 0 ? 1 : 2;
  return `× ${ctx.fmt.number(value100 / 100, digits)}`;
}

function answerOvertime(ctx) {
  const lines = ctx.doc.record.lines.filter((l) => l.group === 'overtime');
  if (!lines.length) return { intent: 'overtime', text: ctx.t('lumi.answer_overtime_none'), sources: [], showMe: showMe(ctx, 'time-leave'), sensitive: false };
  const sentences = [];
  const sources = [];
  const entryIds = [];
  for (const line of lines) {
    const calc = line.calc || {};
    const count = (line.timeEntryIds || []).length;
    entryIds.push(...(line.timeEntryIds || []));
    if (calc.type === 'hours_rate') {
      sentences.push(ctx.t('lumi.answer_overtime', { line: lineLabel(ctx, line), hours: ctx.fmt.hours(calc.hoursHundredths), rate: ctx.fmt.rate(calc.rateMinor, 'h'), multiplier: multiplierText(ctx, calc.multiplier100 || 100), amount: ctx.fmt.money(line.amountMinor), count }));
    } else {
      sentences.push(ctx.t('lumi.answer_line_intro', { line: lineLabel(ctx, line), amount: ctx.fmt.money(line.amountMinor) }));
    }
    sources.push({ type: 'line', id: line.id }, { type: 'calc', id: line.id });
    for (const id of line.policyIds || []) if (ctx.content.policy(id)) sources.push({ type: 'policy', id });
  }
  const one = sentences.length === 1;
  return { intent: 'overtime', text: one ? sentences[0] : ctx.t('lumi.answer_overtime_intro'), items: one ? [] : sentences, sources, showMe: showMe(ctx, 'time-leave', entryIds.length ? { entryIds: uniq(entryIds) } : {}), sensitive: true };
}

function answerNet(ctx) {
  const { profile, computed, content, record } = ctx.doc;
  const totals = computed.totals;
  const netId = profile.primaryTotal;
  const grossId = (profile.reward && profile.reward.grossTotal) || 'gross';
  const dedId = (profile.reward && profile.reward.deductionsTotal) || 'employeeDeductions';
  const net = totals[netId];
  const gross = totals[grossId];
  const deductions = totals[dedId];
  const items = [];
  let text;
  if (typeof gross === 'number' && typeof deductions === 'number' && gross - deductions === net) {
    text = ctx.t('lumi.answer_net_intro', { net: ctx.fmt.money(net), gross: ctx.fmt.money(gross), deductions: ctx.fmt.money(deductions) });
    for (const line of record.lines.filter((l) => l.category === 'deduction')) items.push(ctx.t('lumi.step_effect', { label: lineLabel(ctx, line), effect: ctx.fmt.money(line.amountMinor) }));
  } else {
    // The profile's reconciliation is not a plain gross − deductions chain: list its totals in order instead of asserting a formula.
    text = ctx.t('lumi.answer_net_simple', { label: content.total(netId), net: ctx.fmt.money(net) });
    for (const def of profile.totals) if (def.prominent || def.id === netId) items.push(ctx.t('lumi.step_effect', { label: content.total(def.id), effect: ctx.fmt.money(totals[def.id]) }));
  }
  const payableId = profile.payableTotal;
  if (payableId && payableId !== netId && typeof totals[payableId] === 'number' && totals[payableId] !== net) {
    items.push(ctx.t('lumi.answer_payable', { label: content.total(payableId), payable: ctx.fmt.money(totals[payableId]), plain: content.totalPlain(payableId) }).trim());
  }
  const sources = record.lines.filter((l) => l.category === 'deduction').map((l) => ({ type: 'line', id: l.id }));
  return { intent: 'net', text, items, sources, showMe: showMe(ctx, 'my-pay'), sensitive: true };
}

function unitText(ctx, value, unit) {
  return unit === 'hours' ? ctx.fmt.hours(value) : ctx.fmt.days(value);
}

function answerLeave(ctx) {
  const { record, content } = ctx.doc;
  const balances = (record.time && record.time.leave && record.time.leave.balances) || [];
  if (!balances.length) return { intent: 'leave', text: ctx.t('lumi.answer_leave_none'), sources: [], sensitive: false };
  const sentences = balances.map((b) => ctx.t('lumi.answer_leave', { type: content.leaveType(b.type).label, opening: unitText(ctx, b.opening, b.unit), closing: unitText(ctx, b.closing, b.unit), accrued: unitText(ctx, b.accrued || 0, b.unit), taken: unitText(ctx, b.taken || 0, b.unit) }));
  const sources = [];
  for (const b of balances) if (b.explanationKey && content.explanation(b.explanationKey)) sources.push({ type: 'explanation', id: b.explanationKey });
  for (const line of record.lines.filter((l) => l.group === 'leave')) sources.push({ type: 'line', id: line.id });
  const one = sentences.length === 1;
  return { intent: 'leave', text: one ? sentences[0] : ctx.t('lumi.answer_leave_intro'), items: one ? [] : sentences, sources, showMe: showMe(ctx, 'time-leave'), sensitive: false };
}

function answerReward(ctx) {
  const { record, computed, content } = ctx.doc;
  const r = computed.reward;
  const text = ctx.t('lumi.answer_reward', { gross: ctx.fmt.money(r.cash), employer: ctx.fmt.money(r.employer) });
  const items = [];
  const employerLines = record.lines.filter((l) => l.category === 'employer' && !(l.flags || []).includes('exclude_from_reward'));
  for (const line of employerLines) items.push(ctx.t('lumi.step_effect', { label: lineLabel(ctx, line), effect: ctx.fmt.money(line.amountMinor) }));
  if (r.noncash) items.push(ctx.t('lumi.answer_reward_noncash', { label: content.category('noncash'), amount: ctx.fmt.money(r.noncash) }));
  items.push(ctx.t('lumi.answer_reward_total', { total: ctx.fmt.money(r.total) }));
  const sources = employerLines.map((l) => ({ type: 'line', id: l.id }));
  for (const line of record.lines.filter((l) => l.category === 'noncash')) sources.push({ type: 'line', id: line.id });
  return { intent: 'reward', text, items, sources, showMe: showMe(ctx, 'total-reward'), sensitive: true };
}

function answerTerm(ctx, match) {
  const { record, content } = ctx.doc;
  const sources = [];
  let term; let definition;
  if (match.entry) {
    term = match.entry.term;
    definition = [match.entry.short, match.entry.long].filter(Boolean).join(' ');
    sources.push({ type: 'glossary', id: match.key });
  } else {
    // Statutory term without a glossary entry: the plain-language text of the line that carries it is the approved wording.
    const line = record.lines.find((l) => l.statutoryKey === match.key);
    term = match.statutory.term;
    definition = line ? content.linePlain(line) : '';
    if (!definition) return null;
  }
  for (const line of record.lines) if (line.glossaryKey === match.key || line.statutoryKey === match.key) sources.push({ type: 'line', id: line.id });
  return { intent: 'term', text: ctx.t('lumi.answer_term', { term, definition }), sources, sensitive: false };
}

/** Generic search over lines, explanations, policies and glossary ranked by weighted term overlap. */
function searchDocument(ctx, q) {
  const { record, content } = ctx.doc;
  const docs = [];
  for (const line of record.lines) docs.push({ title: lineLabel(ctx, line), body: content.linePlain(line), sources: [{ type: 'line', id: line.id }] });
  const seenExp = new Set();
  for (const line of record.lines) {
    const key = line.explanationKey;
    if (!key || seenExp.has(key)) continue;
    const e = content.explanation(key);
    if (!e) continue;
    seenExp.add(key);
    const related = record.lines.filter((l) => l.explanationKey === key).map((l) => ({ type: 'line', id: l.id }));
    docs.push({ title: e.title, body: e.body, sources: [{ type: 'explanation', id: key }, ...related] });
  }
  for (const id of record.policies || []) { const p = content.policy(id); if (p) docs.push({ title: p.title, body: p.body, sources: [{ type: 'policy', id }] }); }
  const glossary = content.glossaryAll ? content.glossaryAll() : {};
  for (const [key, g] of Object.entries(glossary)) docs.push({ title: g.term, body: [g.short, g.long].filter(Boolean).join(' '), sources: [{ type: 'glossary', id: key }] });
  for (const d of docs) d.tokens = uniq([...tokenize(d.title), ...tokenize(d.body)]);
  const df = {};
  for (const d of docs) for (const t of d.tokens) df[t] = (df[t] || 0) + 1;
  const qTokens = uniq(tokenize(q));
  const scored = docs.map((d) => ({ d, score: qTokens.reduce((s, t) => s + (d.tokens.includes(t) ? 1 / df[t] : 0), 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.d);
}

function answerSearchOrNothing(ctx, q, contextLines) {
  const hits = q ? searchDocument(ctx, q) : [];
  if (hits.length) {
    const sources = [];
    for (const hit of hits) for (const s of hit.sources) if (!sources.some((x) => x.type === s.type && x.id === s.id)) sources.push(s);
    return { intent: 'search', text: ctx.t('lumi.answer_search_intro'), items: hits.map((hit) => `${hit.title}: ${hit.body}`.trim()), sources, sensitive: false };
  }
  const canQuery = ctx.modules ? Boolean(ctx.modules().queries) : true;
  return { intent: 'none', text: ctx.t(canQuery ? 'lumi.no_answer' : 'lumi.no_answer_no_query'), sources: [], offerQuery: canQuery, sensitive: false };
}

// --- entry point -----------------------------------------------------------------------------

/**
 * Answer a question from the issued record. `contextLineIds` are the lines the
 * employee chose as context (shown to them as chips before asking).
 */
export function answerLocally(ctx, question, contextLineIds = []) {
  const q = norm(question);
  const contextLines = (contextLineIds || []).map((id) => ctx.line(id)).filter(Boolean);
  const index = buildLineIndex(ctx);
  const starter = STARTERS.find((s) => q && norm(ctx.t(s.key)) === q);

  if (!starter && q) {
    const guarded = guardCheck(ctx, question);
    if (guarded) return guarded;
  }

  const intent = starter ? starter.intent : null;
  const named = starter ? [] : namedLines(ctx, q, index);

  if (intent === 'difference' || (!starter && (DIFFERENCE.test(q) || WHY_AMOUNT.test(q)))) {
    const focus = named.length ? named : (OVERTIME.test(q) ? ctx.doc.record.lines.filter((l) => l.group === 'overtime') : contextLines);
    return answerDifference(ctx, focus);
  }
  if (intent === 'overtime' || (!starter && OVERTIME.test(q))) return answerOvertime(ctx);
  if (intent === 'leave' || (!starter && (LEAVE.test(q) || mentionsLeaveType(ctx, q)))) return answerLeave(ctx);
  if (intent === 'net' || (!starter && NET.test(q) && named.length === 0)) return answerNet(ctx);
  if (intent === 'reward') return answerReward(ctx);
  if (intent === 'deduction') return answerDeduction(ctx, contextLines);

  const term = findTerm(ctx, q);
  const amountOriented = AMOUNT_ORIENTED.test(q);
  if (named.length === 1 && amountOriented) return answerLine(ctx, named[0]);
  if (term && DEFINITIONAL.test(q)) { const a = answerTerm(ctx, term); if (a) return a; }
  if (named.length === 1) return answerLine(ctx, named[0]);
  if (named.length > 1) return pickLine(ctx, named);
  if (term) { const a = answerTerm(ctx, term); if (a) return a; }
  if (REWARD.test(q)) return answerReward(ctx);
  if (NET.test(q)) return answerNet(ctx);
  if (DEDUCTION.test(q)) return answerDeduction(ctx, contextLines);
  if (!q && contextLines.length === 1) return answerLine(ctx, contextLines[0]);
  return answerSearchOrNothing(ctx, q, contextLines);
}

function mentionsLeaveType(ctx, q) {
  const balances = (ctx.doc.record.time && ctx.doc.record.time.leave && ctx.doc.record.time.leave.balances) || [];
  return balances.some((b) => { const label = ctx.content.leaveType(b.type).label; return label && hasPhrase(q, label); });
}
