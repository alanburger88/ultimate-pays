/**
 * Lumi, the contextual assistant (PRD §6.1).
 *
 * A right-hand drawer (full screen on mobile) with a truthful capability
 * notice, the lines used as context, starter questions, the conversation and a
 * composer. Answers come from the connected assistant service when one is
 * configured and reachable; otherwise, and whenever the service fails, from the
 * deterministic local engine in lumi-local.js. A local answer is never labelled
 * as AI; a connected answer always names its service.
 *
 * Messages live only in store.lumi.messages (memory) and are never persisted.
 * User text is rendered with textContent only and is never interpreted.
 * Every source an answer cites is a real control: line → go to the line,
 * calc → calculation disclosure, policy/explanation → the governed text inline,
 * glossary → definition popover, section → "Show me".
 *
 * Contract: export function openLumi(ctx, { question, contextLineIds } = {})
 */
import { h, clear, announce, icon, uid } from '../app/dom.js';
import { registerStrings } from '../app/i18n.js';
import { amount, notice } from './components/common.js';
import { openDrawer, closePopover } from './components/overlay.js';
import { answerLocally, STARTERS } from './lumi-local.js';

registerStrings({
  'lumi.answer_local_tag': 'From this document',
  'lumi.answer_connected_tag': 'From {service}',
  'lumi.context_removed': '{line} removed from context',
  'lumi.context_cleared': 'Context cleared',
  'lumi.context_set': 'Context: {line}',
  'lumi.message_from': 'Message from {who}',
  'lumi.send_hint': 'Enter sends. Shift+Enter adds a line.',
  'lumi.follow_ups': 'Suggested follow-ups from the service',
  'lumi.conversation_empty': 'Ask a question or choose one below.',
  'lumi.reveal': 'Reveal amounts',
  'lumi.show_me_section': 'Show me: {section}',
  'lumi.go_to_line': 'Go to line: {line}',
  'lumi.open_calc': 'Calculation: {line}',
  'lumi.define': 'Glossary: {term}',
  'lumi.pick_line_aria': 'Lines to choose from',
});

let current = null; // { ctx, api, els, rendered: Map, unsubscribe: [] }

function lumiState(ctx) {
  return ctx.store.get().lumi || { open: true, messages: [], contextLineIds: null, busy: false };
}

function patchLumi(ctx, patch) {
  const prev = lumiState(ctx);
  ctx.store.set({ lumi: { ...prev, ...patch } });
}

/** Lines used as context: the explicit list set by the opener or the employee, else the current selection. */
export function contextIds(ctx) {
  const s = lumiState(ctx);
  const ids = Array.isArray(s.contextLineIds) ? s.contextLineIds : ctx.store.get().selection.lineIds;
  return ids.filter((id) => ctx.line(id));
}

function capabilities(ctx) {
  const a = ctx.services && ctx.services.assistant;
  try { return (a && a.capabilities && a.capabilities()) || { kind: 'local', connected: false }; } catch (e) { return { kind: 'local', connected: false }; }
}

export function openLumi(ctx, { question = null, contextLineIds = null } = {}) {
  if (current && current.ctx === ctx) {
    if (contextLineIds) setContext(ctx, contextLineIds);
    if (question) send(ctx, question);
    return current.api;
  }
  const t = ctx.t;
  patchLumi(ctx, { open: true, contextLineIds: contextLineIds ? contextLineIds.slice() : null, busy: false });

  const els = {};
  const capId = uid('lumi-cap');
  els.capability = h('div', { class: 'pl-lumi-capability', id: capId });
  els.context = h('section', { class: 'pl-lumi-context', aria: { labelledby: `${capId}-ctx` } });
  els.starters = h('section', { class: 'pl-lumi-suggest', aria: { labelledby: `${capId}-sug` } });
  els.msgs = h('div', { class: 'pl-lumi-msgs', role: 'log', aria: { live: 'polite', relevant: 'additions', busy: 'false' } });
  els.scroll = h('div', { class: 'pl-lumi-scroll' },
    els.capability,
    els.context,
    els.starters,
    h('section', { class: 'pl-lumi-history', aria: { labelledby: `${capId}-hist` } }, h('h3', { id: `${capId}-hist` }, t('lumi.history_label')), els.msgs),
  );

  const taId = uid('lumi-q');
  els.textarea = h('textarea', { class: 'pl-textarea', id: taId, rows: 2, placeholder: t('lumi.input_placeholder'), autocomplete: 'off', aria: { describedby: `${taId}-hint` }, on: {
    keydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } },
    input: () => autosize(els.textarea),
  } });
  els.send = h('button', { class: 'pl-btn pl-btn-primary', type: 'submit', aria: { label: t('lumi.send') } }, icon('send', { size: 18 }), h('span', { class: 'txt' }, t('lumi.send')));
  const form = h('form', { class: 'pl-lumi-composer', on: { submit: (e) => { e.preventDefault(); submit(); } } },
    h('label', { class: 'pl-label', for: taId }, t('lumi.input_label')),
    h('div', { class: 'pl-lumi-input' }, els.textarea, els.send),
    h('p', { class: 'pl-lumi-foot' }, h('span', { id: `${taId}-hint` }, t('lumi.send_hint')), h('span', null, icon('lock', { size: 14 }), ' ', t('lumi.transcript_not_stored'))),
  );
  function submit() { const q = els.textarea.value; els.textarea.value = ''; autosize(els.textarea); send(ctx, q); }

  const body = h('div', { class: 'pl-lumi' }, els.scroll, form);

  const api = openDrawer({
    title: [t('lumi.title'), h('span', { class: 'pl-lumi-role' }, t('lumi.role'))],
    closeLabel: t('lumi.close'),
    className: 'pl-lumi-dialog',
    describedBy: capId,
    initialFocus: els.textarea,
    body,
    onClose: () => {
      if (current && current.api === api) { for (const u of current.unsubscribe) u(); current = null; }
      ctx.actions.lumiClosed();
    },
  });

  current = { ctx, api, els, rendered: new Map(), unsubscribe: [] };
  // Escape with a definition popover open must close only the popover. The popover and the overlay
  // both listen on document (bubble phase); this capture-phase handler settles it while Lumi is open.
  const onEscapeCapture = (e) => {
    if (e.key !== 'Escape' || !document.querySelector('.pl-popover')) return;
    const anchor = Array.from(document.querySelectorAll('[aria-haspopup="dialog"][aria-expanded="true"]')).filter((el) => el.id !== 'pl-lumi-launcher').pop();
    e.stopPropagation();
    e.preventDefault();
    closePopover();
    if (anchor && typeof anchor.focus === 'function') anchor.focus();
  };
  document.addEventListener('keydown', onEscapeCapture, true);
  current.unsubscribe.push(() => document.removeEventListener('keydown', onEscapeCapture, true));
  renderCapability(ctx);
  renderContext(ctx);
  renderStarters(ctx);
  syncMessages(ctx, { scroll: false });
  current.unsubscribe.push(ctx.store.subscribe(() => { if (current) renderCapability(ctx); }, ['online']));
  current.unsubscribe.push(ctx.store.subscribe(() => { if (current) renderContext(ctx); }, ['selection', 'lumi']));
  current.unsubscribe.push(ctx.store.subscribe(() => { if (current) { syncMessages(ctx); setBusyUi(ctx); } }, ['lumi']));
  if (question) send(ctx, question);
  return api;
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
}

// --- panels ----------------------------------------------------------------------------------

function renderCapability(ctx) {
  const t = ctx.t;
  const caps = capabilities(ctx);
  const online = ctx.store.get().online !== false;
  let el;
  if (!online) el = notice(ctx, t('lumi.capability_offline'), { kind: 'warn' });
  else if (caps.connected) el = notice(ctx, t('lumi.capability_connected', { service: caps.service || caps.name || '' }), { kind: 'info', iconName: 'shield' });
  else el = notice(ctx, t('lumi.capability_local'), { kind: 'neutral', iconName: 'file' });
  clear(current.els.capability);
  current.els.capability.appendChild(el);
}

function renderContext(ctx) {
  const t = ctx.t;
  const host = current.els.context;
  const ids = contextIds(ctx);
  const signature = ids.join('|');
  if (host.dataset.ids === signature && host.childElementCount) return;
  host.dataset.ids = signature;
  const hadFocus = host.contains(document.activeElement);
  clear(host);
  host.appendChild(h('h3', { id: `${current.els.capability.id}-ctx` }, t('lumi.context_title')));
  if (!ids.length) { host.appendChild(h('p', { class: 'muted small pl-lumi-context-none' }, t('lumi.context_none'))); if (hadFocus) current.els.textarea.focus(); return; }
  host.appendChild(h('p', { class: 'muted xs' }, t('lumi.context_lines', { count: ids.length })));
  const list = h('ul', { class: 'pl-lumi-context-list' });
  for (const id of ids) {
    const line = ctx.line(id);
    const label = ctx.content.lineLabel(line);
    list.appendChild(h('li', { class: 'pl-lumi-ctx-chip', dataset: { lineId: id } },
      h('span', { class: 'lbl' }, label),
      amount(ctx, line.amountMinor),
      h('button', { class: 'pl-lumi-ctx-x', type: 'button', aria: { label: `${t('lumi.context_remove')}: ${label}` }, dataset: { focusKey: `lumi-ctx-${id}` }, on: { click: () => removeContext(ctx, id) } }, icon('close', { size: 16 })),
    ));
  }
  host.appendChild(list);
  host.appendChild(h('div', { class: 'pl-lumi-actions' }, h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'lumi-ctx-clear' }, on: { click: () => clearContext(ctx) } }, icon('close', { size: 16 }), t('lumi.context_clear'))));
}

function setContext(ctx, ids) {
  patchLumi(ctx, { contextLineIds: ids.filter((id) => ctx.line(id)) });
}

function removeContext(ctx, id) {
  const ids = contextIds(ctx);
  const idx = ids.indexOf(id);
  const next = ids.filter((x) => x !== id);
  const line = ctx.line(id);
  setContext(ctx, next);
  announce(ctx.t('lumi.context_removed', { line: line ? ctx.content.lineLabel(line) : id }));
  // The panel re-renders on the store tick; move focus to the neighbouring chip, the clear button or the input.
  queueMicrotask(() => {
    if (!current) return;
    const chips = Array.from(current.els.context.querySelectorAll('.pl-lumi-ctx-x'));
    const target = chips[Math.min(idx, chips.length - 1)] || current.els.context.querySelector('[data-focus-key="lumi-ctx-clear"]') || current.els.textarea;
    target.focus();
  });
}

function clearContext(ctx) {
  setContext(ctx, []);
  announce(ctx.t('lumi.context_cleared'));
  queueMicrotask(() => { if (current) current.els.textarea.focus(); });
}

function starterVisible(ctx, key) {
  const { record } = ctx.doc;
  switch (key) {
    case 'lumi.starter_why_different': return (record.history || []).length > 0;
    case 'lumi.starter_overtime': return record.lines.some((l) => l.group === 'overtime');
    case 'lumi.starter_leave': return Boolean(record.time && record.time.leave && (record.time.leave.balances || []).length);
    case 'lumi.starter_reward': return record.lines.some((l) => l.category === 'employer');
    default: return true;
  }
}

function renderStarters(ctx) {
  const t = ctx.t;
  const host = current.els.starters;
  clear(host);
  host.appendChild(h('h3', { id: `${current.els.capability.id}-sug` }, t('lumi.suggestions')));
  const row = h('div', { class: 'pl-lumi-starters' });
  for (const s of STARTERS) {
    if (!starterVisible(ctx, s.key)) continue;
    const text = t(s.key);
    row.appendChild(h('button', { class: 'pl-chip pl-chip-outline pl-lumi-starter', type: 'button', dataset: { starter: s.intent }, on: { click: () => send(ctx, text) } }, icon('sparkle', { size: 14 }), text));
  }
  host.appendChild(row);
}

// --- conversation ----------------------------------------------------------------------------

function push(ctx, message) {
  const m = { id: uid('msg'), ...message };
  patchLumi(ctx, { messages: [...lumiState(ctx).messages, m] });
  return m.id;
}

function remove(ctx, id) {
  patchLumi(ctx, { messages: lumiState(ctx).messages.filter((m) => m.id !== id) });
}

function setBusyUi(ctx) {
  if (!current) return;
  const busy = Boolean(lumiState(ctx).busy);
  current.els.send.disabled = busy;
  current.els.msgs.setAttribute('aria-busy', String(busy));
}

/** Append new messages and drop removed ones without rebuilding what is already on screen (keeps focus). */
function syncMessages(ctx, { scroll = true } = {}) {
  const { els, rendered } = current;
  const messages = lumiState(ctx).messages;
  const ids = new Set(messages.map((m) => m.id));
  for (const [id, node] of rendered) if (!ids.has(id)) { node.remove(); rendered.delete(id); }
  let added = false;
  for (const m of messages) {
    if (rendered.has(m.id)) continue;
    const node = messageNode(ctx, m);
    els.msgs.appendChild(node);
    rendered.set(m.id, node);
    added = true;
  }
  const empty = els.msgs.querySelector('.pl-lumi-empty');
  if (!messages.length && !empty) els.msgs.appendChild(h('p', { class: 'muted small pl-lumi-empty' }, ctx.t('lumi.conversation_empty')));
  if (messages.length && empty) empty.remove();
  if (added && scroll) els.scroll.scrollTo({ top: els.scroll.scrollHeight, behavior: ctx.reducedMotion && ctx.reducedMotion() ? 'auto' : 'smooth' });
}

/** Under presentation privacy an answer's sentences are blurred like amounts; one control reveals the whole message. */
function sensitiveBlock(ctx, children, sensitive) {
  const block = h('div', { class: ['pl-msg-body', sensitive && ctx.privacy && ctx.privacy() && 'pl-amount pl-lumi-sensitive'] }, children);
  return block;
}

function attachReveal(ctx, article) {
  if (!(ctx.privacy && ctx.privacy())) return;
  const targets = () => Array.from(article.querySelectorAll('.pl-amount'));
  if (!targets().length) return;
  const btn = h('button', { class: 'pl-btn-link pl-lumi-reveal', type: 'button' }, icon('eye', { size: 16 }), ctx.t('lumi.reveal'));
  const reveal = () => { for (const el of targets()) el.classList.add('is-revealed'); btn.remove(); };
  btn.addEventListener('click', reveal);
  const body = article.querySelector('.pl-lumi-sensitive');
  if (body) body.addEventListener('click', reveal);
  (body || article.querySelector('.pl-msg-body')).after(btn);
}

function messageNode(ctx, m) {
  const t = ctx.t;
  const who = m.role === 'user' ? t('lumi.you') : t('lumi.name');
  if (m.kind === 'status') {
    return h('div', { class: 'pl-msg', dataset: { role: 'lumi', kind: 'status', status: m.status || 'info' } },
      m.status === 'thinking' ? h('span', { class: 'pl-lumi-spinner', aria: { hidden: 'true' } }, icon('sparkle', { size: 16 })) : icon('warn', { size: 16 }),
      h('span', null, m.text));
  }
  const origin = m.role === 'lumi' ? h('span', { class: 'pl-lumi-origin', dataset: { origin: m.origin || 'local' } }, m.origin === 'connected' ? t('lumi.answer_connected_tag', { service: m.service || '' }) : t('lumi.answer_local_tag')) : null;
  const text = h('p', { class: 'pl-msg-text' }, m.text);
  const items = m.items && m.items.length ? h('ul', { class: 'pl-msg-items' }, m.items.map((i) => h('li', null, i))) : null;
  const sources = sourcesRow(ctx, m);
  const actions = actionsRow(ctx, m);
  const article = h('article', { class: 'pl-msg', dataset: { role: m.role, kind: 'text', origin: m.origin || null }, aria: { label: t('lumi.message_from', { who }) } },
    h('span', { class: 'who' }, who, origin),
    sensitiveBlock(ctx, [text, items], m.sensitive),
    sources,
    actions,
  );
  if (m.role === 'lumi') attachReveal(ctx, article);
  return article;
}

function sectionTitle(ctx, id) {
  const def = ctx.sections().find((s) => s.id === id);
  return def ? ctx.t(def.titleKey) : id;
}

function closeThen(fn) {
  const api = current && current.api;
  if (api) api.close('action');
  // Let the overlay restore focus first, then navigate so the section takes it.
  requestAnimationFrame(fn);
}

/** Amount text inside a button: blurred under privacy like amount(), but never a nested control. */
function amountText(ctx, minor) {
  return h('span', { class: 'pl-amount tabular' }, ctx.fmt.money(minor));
}

function chip(label, { iconName = null, cls = '', aria = {}, on = {} } = {}) {
  return h('button', { class: ['pl-chip pl-chip-outline pl-lumi-chip', cls], type: 'button', aria, on }, iconName ? icon(iconName, { size: 14 }) : null, label);
}

function expandableChip(ctx, { label, title, body, kind }, expansions) {
  const id = uid('lumi-x');
  const panel = h('div', { class: 'pl-lumi-expansion', id, hidden: true, dataset: { kind } }, h('h4', null, title), h('p', null, body));
  expansions.appendChild(panel);
  const btn = chip(label, { iconName: kind === 'policy' ? 'file' : 'info', aria: { expanded: 'false', controls: id } });
  btn.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  return btn;
}

function sourcesRow(ctx, m) {
  const t = ctx.t;
  const list = [];
  const seen = new Set();
  for (const s of m.sources || []) { const k = `${s.type}:${s.id}`; if (!seen.has(k)) { seen.add(k); list.push(s); } }
  const expansions = h('div', { class: 'pl-lumi-expansions' });
  const chips = [];
  if (m.showMe && m.showMe.section) chips.push(showMeChip(ctx, m.showMe));
  for (const s of list) {
    if (s.type === 'section' && m.showMe && m.showMe.section === s.id) continue;
    const c = sourceChip(ctx, s, expansions);
    if (c) chips.push(c);
  }
  if (!chips.length) return null;
  return h('div', { class: 'pl-lumi-sources-wrap' },
    h('div', { class: 'pl-lumi-sources', role: 'group', aria: { label: t('lumi.sources') } }, chips),
    expansions,
  );
}

function showMeChip(ctx, showMe) {
  const t = ctx.t;
  const title = sectionTitle(ctx, showMe.section);
  return chip(t('lumi.show_me_section', { section: title }), { iconName: 'forward', cls: 'pl-lumi-chip-go', on: { click: () => closeThen(() => {
    if (showMe.entryIds && showMe.entryIds.length && ctx.actions.showEntries) ctx.actions.showEntries(showMe.entryIds);
    else if (showMe.lineId) ctx.actions.focusLine(showMe.lineId, { section: showMe.section });
    else ctx.actions.go(showMe.section, { push: true });
  }) } });
}

function sourceChip(ctx, s, expansions) {
  const t = ctx.t;
  const { content } = ctx.doc;
  switch (s.type) {
    case 'line': {
      const line = ctx.line(s.id);
      if (!line) return null;
      const label = content.lineLabel(line);
      const c = chip([h('span', { class: 'lbl' }, `${t('lumi.source_line')}: ${label}`), amountText(ctx, line.amountMinor)], { iconName: 'list', aria: { label: t('lumi.go_to_line', { line: label }) }, on: { click: () => closeThen(() => ctx.actions.focusLine(line.id)) } });
      return c;
    }
    case 'calc': {
      const line = ctx.line(s.id);
      if (!line) return null;
      const label = content.lineLabel(line);
      return chip(t('lumi.source_calc'), { iconName: 'table', aria: { label: t('lumi.open_calc', { line: label }), haspopup: 'dialog' }, on: { click: () => ctx.actions.openCalc(line.id) } });
    }
    case 'policy': {
      const p = content.policy(s.id);
      if (!p) return null;
      return expandableChip(ctx, { label: `${t('lumi.source_policy')}: ${p.title}`, title: p.title, body: p.body, kind: 'policy' }, expansions);
    }
    case 'explanation': {
      const e = content.explanation(s.id);
      if (!e) return null;
      return expandableChip(ctx, { label: `${t('lumi.source_explanation')}: ${e.title}`, title: e.title, body: e.body, kind: 'explanation' }, expansions);
    }
    case 'glossary': {
      const g = content.glossary(s.id);
      if (!g) return null;
      const c = chip(`${t('lumi.source_glossary')}: ${g.term}`, { iconName: 'help', aria: { label: t('lumi.define', { term: g.term }), haspopup: 'dialog', expanded: 'false' } });
      c.addEventListener('click', () => ctx.actions.openTerm(s.id, c));
      return c;
    }
    case 'section': {
      if (!ctx.sections().some((x) => x.id === s.id)) return null;
      return showMeChip(ctx, { section: s.id, lineId: s.lineId || null });
    }
    default: return null;
  }
}

function actionsRow(ctx, m) {
  const t = ctx.t;
  const parts = [];
  if (m.pickLines && m.pickLines.length) {
    const picks = h('div', { class: 'pl-lumi-picks', role: 'group', aria: { label: t('lumi.pick_line_aria') } });
    for (const id of m.pickLines) {
      const line = ctx.line(id);
      if (!line) continue;
      const label = ctx.content.lineLabel(line);
      picks.appendChild(h('button', { class: 'pl-btn pl-btn-sm pl-lumi-pick', type: 'button', on: { click: () => { setContext(ctx, [id]); announce(t('lumi.context_set', { line: label })); send(ctx, m.question || t('lumi.starter_explain_deduction')); } } }, h('span', { class: 'lbl' }, label), amountText(ctx, line.amountMinor)));
    }
    parts.push(h('p', { class: 'muted xs pl-lumi-pick-title' }, t('lumi.select_a_deduction')), picks);
  }
  if (m.offerQuery && ctx.modules().queries) {
    parts.push(h('div', { class: 'pl-lumi-actions' }, h('button', { class: 'pl-btn pl-btn-sm', type: 'button', on: { click: () => { const ids = contextIds(ctx); closeThen(() => ctx.actions.openQuery({ lineIds: ids })); } } }, icon('send', { size: 16 }), t('lumi.offer_query'))));
  }
  if (m.suggestions && m.suggestions.length) {
    parts.push(h('div', { class: 'pl-lumi-follow', role: 'group', aria: { label: t('lumi.follow_ups') } }, m.suggestions.map((s) => h('button', { class: 'pl-chip pl-chip-outline pl-lumi-chip', type: 'button', on: { click: () => send(ctx, s) } }, s))));
  }
  return parts.length ? h('div', { class: 'pl-msg-actions' }, parts) : null;
}

/** Only sources whose targets exist in this record are shown; the service's text is never trusted to name them. */
function resolveSources(ctx, sources) {
  const out = [];
  for (const s of sources || []) {
    if (!s || typeof s.type !== 'string' || typeof s.id !== 'string') continue;
    const { content } = ctx.doc;
    const ok = (s.type === 'line' && ctx.line(s.id)) || (s.type === 'calc' && ctx.line(s.id)) || (s.type === 'policy' && content.policy(s.id)) || (s.type === 'explanation' && content.explanation(s.id)) || (s.type === 'glossary' && content.glossary(s.id)) || (s.type === 'section' && ctx.sections().some((x) => x.id === s.id));
    if (ok) out.push({ type: s.type, id: s.id });
  }
  return out;
}

export async function send(ctx, question) {
  const t = ctx.t;
  const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!q || lumiState(ctx).busy) return;
  const lineIds = contextIds(ctx);
  push(ctx, { role: 'user', text: q });
  const caps = capabilities(ctx);
  const online = ctx.store.get().online !== false;
  if (caps.connected && online) {
    patchLumi(ctx, { busy: true });
    const thinking = push(ctx, { role: 'lumi', kind: 'status', status: 'thinking', text: t('lumi.thinking') });
    let res = null;
    try {
      res = await ctx.services.assistant.ask({ question: q, documentRef: { id: ctx.doc.record.document.id, version: ctx.doc.record.document.version }, lineIds, sectionId: ctx.store.get().nav.section, locale: ctx.locale });
    } catch (err) { res = { status: 'error', reason: 'exception' }; }
    remove(ctx, thinking);
    patchLumi(ctx, { busy: false });
    if (res && res.status === 'ok' && typeof res.text === 'string') {
      push(ctx, { role: 'lumi', text: res.text, sources: resolveSources(ctx, res.sources), suggestions: (res.suggestions || []).filter((s) => typeof s === 'string').slice(0, 4), origin: 'connected', service: caps.service || caps.name || '', sensitive: true, question: q });
      return;
    }
    push(ctx, { role: 'lumi', kind: 'status', status: 'error', text: t('lumi.service_error') });
  }
  const answer = answerLocally(ctx, q, lineIds);
  push(ctx, { role: 'lumi', ...answer, origin: 'local', question: q });
}
