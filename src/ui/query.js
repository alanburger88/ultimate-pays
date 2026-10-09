/**
 * Contextual payroll query workflow.
 *
 * A query is prepared locally as a draft (interaction state, never the record):
 * included lines and time entries, a tag, private notes, subject and message.
 * Before anything is sent the employee reviews exactly what will be sent. The
 * draft only becomes "Submitted" when the query service acknowledges it with a
 * case reference; without a service or connection it is saved on this device.
 *
 * Pure state helpers (createDraft, validateDraft, buildPayload, applySubmitResult)
 * are exported for unit tests and never touch the DOM.
 */
import { h, clear, append, announce, icon, uid } from '../app/dom.js';
import { registerStrings, LANGUAGE_NAMES } from '../app/i18n.js';
import { sumLines } from '../app/calc.js';
import { amount, lineTitle, notice } from './components/common.js';
import { openDialog, confirmDialog, toast } from './components/overlay.js';
import { TAG_IDS, tagLabel, tagOptions, selectedEntries, entryHours, entryLabel } from './tray.js';

registerStrings({
  'query.steps_label': 'Query steps',
  'query.service_connected': 'Connected to the payroll query service at {service}.',
  'query.service_not_connected': 'No payroll query service is connected. Sending will save the query on this device only; nothing reaches payroll.',
  'query.copy_failed': 'Copying is not available here. The text has been selected so you can copy it manually.',
  'query.payload_json': 'Technical preview (JSON, exactly as sent)',
  'query.reference_key': 'Reference key (prevents duplicates)',
  'query.next_step': 'Next step from payroll',
  'query.last_error': 'Error code: {code}',
  'query.interrupted': 'Sending was interrupted before payroll acknowledged it. Try again; the same reference key prevents a duplicate.',
  'query.delete_draft_confirm': 'Delete this draft from this device? This cannot be undone.',
  'query.draft_deleted': 'Draft deleted from this device.',
  'query.saved_at': 'Saved {date}',
  'query.lines_removed_hint': 'Removing a line here only changes this query, not your selection.',
  'query.no_message_yet': 'No message yet.',
  'query.view_title': 'Submitted query',
  'query.what_was_sent': 'Exactly what was sent',
  'query.send_offline': 'You are offline. Sending is unavailable until you are back online; the draft can still be saved.',
});

export const DRAFT_STATUSES = ['draft', 'sending', 'submitted', 'failed', 'saved_offline'];

/** Random identifier: never derived from payroll values or identities. */
export function newId(prefix = 'q') {
  const rnd = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}-${rnd}`;
}

/** A new draft from a selection. Notes and per-line tags are snapshotted for the included lines only. */
export function createDraft({ lineIds = [], entryIds = [], notes = {}, lineTags = {}, tag = null, documentRef = { id: null, version: null }, locale = 'en-CA', now = new Date().toISOString(), id = newId('q'), idempotencyKey = newId('idem') } = {}) {
  const ids = Array.from(new Set(lineIds));
  const eids = Array.from(new Set(entryIds));
  const draftNotes = {};
  const draftTags = {};
  for (const lid of ids) {
    if (notes[lid] && String(notes[lid]).trim()) draftNotes[lid] = String(notes[lid]).slice(0, 1000);
    if (lineTags[lid] && TAG_IDS.includes(lineTags[lid])) draftTags[lid] = lineTags[lid];
  }
  const first = ids.length ? draftTags[ids[0]] : null;
  const shared = tag && TAG_IDS.includes(tag) ? tag : (first && ids.every((lid) => draftTags[lid] === first) ? first : null);
  return {
    id, idempotencyKey, createdAt: now, updatedAt: now, status: 'draft',
    lineIds: ids, entryIds: eids, tag: shared, subject: '', message: '',
    notes: draftNotes, lineTags: draftTags,
    documentRef: { id: documentRef.id, version: documentRef.version }, locale,
    lastError: null, caseReference: null, acknowledgedAt: null, nextStep: null,
  };
}

/** Bring a stored draft to the current shape. A draft stored as 'sending' was never acknowledged, so it resumes as failed/interrupted. */
export function normaliseDraft(stored) {
  const d = { ...createDraft({ id: stored.id, idempotencyKey: stored.idempotencyKey || newId('idem'), documentRef: stored.documentRef || {}, locale: stored.locale || 'en-CA' }), ...stored };
  d.lineIds = Array.isArray(d.lineIds) ? d.lineIds : [];
  d.entryIds = Array.isArray(d.entryIds) ? d.entryIds : [];
  d.notes = d.notes && typeof d.notes === 'object' ? d.notes : {};
  d.lineTags = d.lineTags && typeof d.lineTags === 'object' ? d.lineTags : {};
  d.subject = typeof d.subject === 'string' ? d.subject : '';
  d.message = typeof d.message === 'string' ? d.message : '';
  if (!DRAFT_STATUSES.includes(d.status)) d.status = 'draft';
  if (d.status === 'sending') { d.status = 'failed'; d.lastError = 'interrupted'; }
  if (d.status === 'submitted' && !d.caseReference) { d.status = 'failed'; d.lastError = 'no_ack'; }
  return d;
}

export function validateDraft(draft) {
  const errors = [];
  if (!(draft.lineIds || []).length && !(draft.entryIds || []).length) errors.push('no_lines');
  if (!draft.message || !String(draft.message).trim()) errors.push('message_required');
  return { ok: errors.length === 0, errors };
}

/**
 * The exact object handed to the query service. Amounts are the issued
 * integer minor-unit values of the included lines; nothing is recomputed.
 */
export function buildPayload(draft, record) {
  const lines = (record && record.lines) || [];
  const entries = (record && record.time && record.time.entries) || [];
  const amounts = {};
  for (const id of draft.lineIds) { const l = lines.find((x) => x.id === id); if (l) amounts[id] = l.amountMinor; }
  const tags = {};
  const notes = {};
  for (const id of draft.lineIds) {
    if (draft.lineTags && draft.lineTags[id]) tags[id] = draft.lineTags[id];
    if (draft.notes && draft.notes[id] && String(draft.notes[id]).trim()) notes[id] = String(draft.notes[id]);
  }
  return {
    documentRef: { id: draft.documentRef.id, version: draft.documentRef.version },
    lineIds: draft.lineIds.slice(),
    amounts,
    currency: record && record.document ? record.document.currency : null,
    entryIds: draft.entryIds.slice(),
    entries: entries.filter((e) => draft.entryIds.includes(e.id)).map((e) => ({ id: e.id, date: e.date })),
    tag: draft.tag || null,
    tags,
    notes,
    subject: String(draft.subject || '').trim(),
    message: String(draft.message || '').trim(),
    locale: draft.locale,
    idempotencyKey: draft.idempotencyKey,
  };
}

/**
 * Pure reducer for the outcome of a submit attempt.
 *   result: { ok: true, ack: { caseReference, acknowledgedAt?, nextStep? } }
 *        or { ok: false, error: { code, message?, caseReference? } }
 * Never produces 'submitted' without a case reference; never downgrades a submitted query.
 */
export function applySubmitResult(draft, result, now = new Date().toISOString()) {
  const base = { ...draft, updatedAt: now };
  const ack = result && result.ok ? result.ack : null;
  if (ack && typeof ack.caseReference === 'string' && ack.caseReference.trim()) {
    return { ...base, status: 'submitted', caseReference: ack.caseReference, acknowledgedAt: typeof ack.acknowledgedAt === 'string' && ack.acknowledgedAt ? ack.acknowledgedAt : now, nextStep: typeof ack.nextStep === 'string' && ack.nextStep.trim() ? ack.nextStep : null, lastError: null };
  }
  const error = (result && !result.ok && result.error) || { code: result && result.ok ? 'no_ack' : 'unknown' };
  const code = typeof error.code === 'string' && error.code ? error.code : 'unknown';
  if (draft.status === 'submitted') return { ...base, lastError: code };
  if (code === 'no_service' || code === 'offline') return { ...base, status: 'saved_offline', lastError: code, caseReference: null, acknowledgedAt: null, nextStep: null };
  if (code === 'duplicate') {
    if (typeof error.caseReference === 'string' && error.caseReference.trim()) return { ...base, status: 'submitted', caseReference: error.caseReference, acknowledgedAt: draft.acknowledgedAt || null, nextStep: draft.nextStep || null, lastError: 'duplicate' };
    return { ...base, status: 'failed', lastError: 'duplicate', caseReference: null };
  }
  return { ...base, status: 'failed', lastError: code, caseReference: null, acknowledgedAt: null, nextStep: null };
}

/** Where a draft belongs in store.queries after a state change. */
export function placeDraft(queries, draft) {
  const drafts = ((queries && queries.drafts) || []).filter((d) => d.id !== draft.id);
  const submitted = ((queries && queries.submitted) || []).filter((d) => d.id !== draft.id);
  if (draft.status === 'submitted') submitted.unshift(draft); else drafts.unshift(draft);
  return { drafts, submitted, active: null };
}

export function removeDraft(queries, draftId) {
  return { drafts: ((queries && queries.drafts) || []).filter((d) => d.id !== draftId), submitted: ((queries && queries.submitted) || []).filter((d) => d.id !== draftId), active: null };
}

const CHIP = { draft: '', sending: 'pl-chip-info', submitted: 'pl-chip-positive', failed: 'pl-chip-negative', saved_offline: 'pl-chip-warn' };

export function statusChip(ctx, status) {
  return h('span', { class: ['pl-chip', CHIP[status] || ''], dataset: { status } }, ctx.t(`query.status_${status}`));
}

/** Short status sentence for toasts / announcements. */
export function statusText(ctx, draft) {
  const t = ctx.t;
  switch (draft.status) {
    case 'submitted': return draft.lastError === 'duplicate' ? t('query.duplicate_blocked', { reference: draft.caseReference }) : `${t('query.submitted')}. ${t('query.case_reference', { reference: draft.caseReference })}`;
    case 'saved_offline': return draft.lastError === 'offline' ? t('query.offline_saved') : t('query.no_service');
    case 'failed': return draft.lastError === 'interrupted' ? t('query.interrupted') : draft.lastError === 'duplicate' ? t('query.duplicate_blocked', { reference: '—' }) : t('query.failed');
    case 'sending': return t('query.sending');
    default: return t('query.status_draft');
  }
}

function selectText(el) {
  try { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); } catch (e) { /* ignore */ }
}

/**
 * Open the query dialog. opts: { lineIds, entryIds } to start from a selection,
 * or { draftId } to resume a draft (at the review step) or view a submitted query.
 */
export function openQuery(ctx, opts = {}) {
  const t = ctx.t;
  const { record } = ctx.doc;
  const queries = ctx.store.get().queries || { drafts: [], submitted: [] };
  let draft = null;
  let step = 1;
  let saved = false;
  if (opts.draftId) {
    const found = (queries.drafts || []).find((d) => d.id === opts.draftId) || (queries.submitted || []).find((d) => d.id === opts.draftId) || null;
    if (found) { draft = normaliseDraft(found); step = 3; saved = true; }
  }
  if (!draft) {
    const sel = ctx.store.get().selection;
    draft = createDraft({ lineIds: opts.lineIds || sel.lineIds, entryIds: opts.entryIds || sel.entryIds, notes: sel.notes || {}, lineTags: sel.tags || {}, documentRef: { id: record.document.id, version: record.document.version }, locale: ctx.locale });
  }
  const state = { step, saved, sending: false, dirty: false, closed: false, deleted: false, errors: {} };
  const readOnly = () => draft.status === 'submitted';

  const stepHeading = h('h3', { class: 'pl-query-step-title', id: uid('qh'), tabindex: '-1' });
  const host = h('div', { class: 'pl-query' });
  const service = ctx.services && ctx.services.queries ? ctx.services.queries : { connected: false, name: null };

  // Footer buttons are created once and shown/hidden per step so the overlay's footer layout stays intact.
  const btnDelete = h('button', { class: 'pl-btn pl-btn-quiet', type: 'button', on: { click: () => deleteDraft() } }, icon('trash', { size: 16 }), t('query.delete_draft'));
  const btnSave = h('button', { class: 'pl-btn', type: 'button', on: { click: () => saveDraft() } }, t('query.save_draft'));
  const btnBack = h('button', { class: 'pl-btn', type: 'button', on: { click: () => go(state.step - 1) } }, icon('back', { size: 16 }), t('common.back'));
  const btnNext = h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => next() } }, t('common.next'), icon('forward', { size: 16 }));
  const btnSend = h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => send() } }, icon('send', { size: 16 }), t('query.submit'));
  const btnDone = h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => dlg.close('done') } }, t('common.done'));
  const footer = [btnDelete, btnSave, btnBack, btnNext, btnSend, btnDone];

  let dlg = null;
  let unsub = null;

  function linesOf() { return draft.lineIds.map((id) => ctx.line(id)).filter(Boolean); }
  function entriesOf() { return selectedEntries(ctx, draft.entryIds); }
  function online() { return ctx.store.get().online !== false; }
  function touch() { state.dirty = true; }

  function persist() {
    draft = { ...draft, updatedAt: new Date().toISOString() };
    ctx.actions.saveQueries(placeDraft(ctx.store.get().queries, draft));
    state.saved = true;
    state.dirty = false;
  }

  function saveDraft() {
    if (state.sending || readOnly()) return;
    persist();
    toast(t('query.draft_saved'));
    announce(t('query.draft_saved'));
    syncFooter();
  }

  async function deleteDraft() {
    if (state.sending || readOnly()) return;
    const ok = await confirmDialog({ title: t('query.delete_draft'), body: t('query.delete_draft_confirm'), confirmLabel: t('query.delete_draft'), cancelLabel: t('common.cancel'), danger: true });
    if (!ok) return;
    ctx.actions.saveQueries(removeDraft(ctx.store.get().queries, draft.id));
    state.deleted = true; state.dirty = false; state.saved = false;
    dlg.close('deleted');
    toast(t('query.draft_deleted'));
  }

  function validateStep() {
    state.errors = {};
    const v = validateDraft(draft);
    if (v.errors.includes('no_lines')) state.errors.lines = true;
    if (state.step >= 2 && v.errors.includes('message_required')) state.errors.message = true;
    return Object.keys(state.errors).length === 0;
  }

  function next() {
    if (state.step === 1 && !linesOf().length && !entriesOf().length) { state.errors = { lines: true }; render(); const n = host.querySelector('[data-query-error]'); if (n) n.focus(); announce(t('query.no_lines')); return; }
    if (state.step === 2 && !validateStep()) { render(); const ta = host.querySelector('[data-focus-key="q-message"]'); if (ta) ta.focus(); announce(t('query.message_required')); return; }
    go(state.step + 1);
  }

  function go(n) {
    state.step = Math.max(1, Math.min(3, n));
    state.errors = {};
    render();
    stepHeading.focus({ preventScroll: true });
    announce(`${t('common.step_of', { step: state.step, total: 3 })}: ${stepName(state.step)}`);
  }

  function stepName(n) { return n === 1 ? t('query.step_lines') : n === 2 ? t('query.step_details') : t('query.step_review'); }

  async function send() {
    if (state.sending) return;
    if (readOnly()) { announce(t('query.duplicate_blocked', { reference: draft.caseReference })); return; }
    if (!online()) { announce(t('query.send_offline')); return; }
    if (!validateDraft(draft).ok) { state.step = validateDraft(draft).errors.includes('no_lines') ? 1 : 2; validateStep(); render(); announce(state.errors.lines ? t('query.no_lines') : t('query.message_required')); return; }
    const ok = await confirmDialog({ title: t('query.confirm_title'), body: t('query.confirm_body'), confirmLabel: t('query.submit'), cancelLabel: t('common.cancel') });
    if (!ok) return;
    state.sending = true;
    draft = { ...draft, status: 'sending', lastError: null };
    persist();
    render();
    announce(t('query.sending'));
    const payload = buildPayload(draft, record);
    let result;
    try {
      const ack = await service.submit(payload, { idempotencyKey: draft.idempotencyKey });
      result = { ok: true, ack };
    } catch (err) {
      result = { ok: false, error: { code: (err && err.code) || 'unknown', message: (err && err.message) || '', caseReference: (err && err.caseReference) || null } };
    }
    state.sending = false;
    draft = applySubmitResult(draft, result);
    persist();
    const text = statusText(ctx, draft);
    if (state.closed) { toast(text, { kind: draft.status === 'failed' ? 'error' : 'info', duration: 8000 }); return; }
    render();
    const panel = host.querySelector('.pl-query-result');
    if (panel) panel.focus({ preventScroll: true });
    announce(text, { assertive: draft.status === 'failed' });
  }

  // ---- rendering -----------------------------------------------------------
  function header() {
    const names = [1, 2, 3].map(stepName);
    return h('div', { class: 'pl-query-head' },
      readOnly() ? null : h('ol', { class: 'pl-query-steps', aria: { label: t('query.steps_label') } }, names.map((n, i) => h('li', { aria: { current: i + 1 === state.step ? 'step' : null }, class: i + 1 < state.step ? 'is-done' : null }, h('span', { class: 'n', aria: { hidden: 'true' } }, String(i + 1)), h('span', null, n)))),
      h('div', { class: 'pl-query-meta' }, readOnly() ? null : h('span', { class: 'muted small' }, t('common.step_of', { step: state.step, total: 3 })), statusChip(ctx, draft.status)),
    );
  }

  function kvTotal(lines) {
    return h('div', { class: 'pl-kv total' }, h('span', { class: 'k' }, t('select.selected_total')), amount(ctx, sumLines(lines), { cls: 'v' }));
  }

  function renderLines() {
    const lines = linesOf();
    const entries = entriesOf();
    const none = !lines.length && !entries.length;
    const editable = !readOnly() && !state.sending;
    return h('div', { class: 'stack' },
      none ? h('div', { tabindex: '-1', dataset: { queryError: '1' } }, notice(ctx, t('query.no_lines'), { kind: state.errors.lines ? 'error' : 'warn' })) : null,
      h('h4', null, t('query.lines_included')),
      lines.length ? h('ul', { class: 'pl-query-lines', aria: { label: t('query.lines_included') } }, lines.map((line, i) => {
        const label = ctx.content.lineLabel(line);
        return h('li', { dataset: { lineId: line.id } },
          h('span', { class: 'pl-query-line-main' }, lineTitle(ctx, line), draft.lineTags[line.id] ? h('span', { class: 'pl-chip pl-chip-accent' }, t('tags.tagged_as', { tag: tagLabel(ctx, draft.lineTags[line.id]) })) : null),
          amount(ctx, line.amountMinor, { cls: 'strong' }),
          editable ? h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: t('select.remove_line', { line: label }) }, title: t('common.remove'), on: { click: () => { draft = { ...draft, lineIds: draft.lineIds.filter((x) => x !== line.id) }; touch(); render(); const btns = host.querySelectorAll('.pl-query-lines button.pl-btn-icon'); const nextBtn = btns[Math.min(i, btns.length - 1)]; (nextBtn || stepHeading).focus({ preventScroll: true }); announce(t('select.line_deselected', { line: label })); } } }, icon('close', { size: 16 })) : h('span'),
        );
      })) : h('p', { class: 'muted small' }, t('common.none')),
      lines.length ? kvTotal(lines) : null,
      lines.length && editable ? h('p', { class: 'pl-hint' }, t('query.lines_removed_hint')) : null,
      h('h4', null, t('query.entries_included')),
      entries.length ? h('ul', { class: 'pl-query-entries', aria: { label: t('query.entries_included') } }, entries.map((e, i) => {
        const date = ctx.fmt.date(e.date, 'weekday');
        return h('li', { dataset: { entryId: e.id } },
          h('span', { class: 'pl-query-line-main' }, h('span', { class: 'cell-main' }, date), h('span', { class: 'cell-sub' }, entryLabel(ctx, e), e.start && e.end ? ` · ${t('time.entry_detail', { start: e.start, end: e.end })}` : '')),
          h('span', { class: 'tabular strong nowrap' }, entryHours(ctx, e)),
          editable ? h('button', { class: 'pl-btn pl-btn-quiet pl-btn-icon', type: 'button', aria: { label: t('select.remove_entry', { date }) }, title: t('common.remove'), on: { click: () => { draft = { ...draft, entryIds: draft.entryIds.filter((x) => x !== e.id) }; touch(); render(); const btns = host.querySelectorAll('.pl-query-entries button.pl-btn-icon'); const nextBtn = btns[Math.min(i, btns.length - 1)]; (nextBtn || stepHeading).focus({ preventScroll: true }); } } }, icon('close', { size: 16 })) : h('span'),
        );
      })) : h('p', { class: 'muted small' }, t('common.none')),
    );
  }

  function renderDetails() {
    const lines = linesOf();
    const subjectId = uid('q-subject');
    const msgId = uid('q-message');
    const msgErrId = `${msgId}-err`;
    const tagId = uid('q-tag');
    let errEl = state.errors.message ? h('p', { class: 'pl-error-text', id: msgErrId, role: 'alert' }, t('query.message_required')) : null;
    const textarea = h('textarea', { class: 'pl-textarea', id: msgId, rows: 4, maxlength: 2000, required: true, placeholder: t('query.message_placeholder'), aria: { describedby: errEl ? msgErrId : null, invalid: errEl ? 'true' : null }, dataset: { focusKey: 'q-message' },
      on: { input: (e) => { draft = { ...draft, message: e.target.value }; touch(); if (errEl && e.target.value.trim()) { errEl.remove(); errEl = null; textarea.removeAttribute('aria-invalid'); textarea.removeAttribute('aria-describedby'); state.errors.message = false; } } } }, draft.message);
    return h('div', { class: 'stack' },
      h('div', { class: 'pl-field' },
        h('label', { for: subjectId }, t('query.subject'), ' ', h('span', { class: 'muted xs' }, `(${t('common.optional')})`)),
        h('input', { class: 'pl-input', id: subjectId, type: 'text', maxlength: 160, placeholder: t('query.subject_placeholder'), value: draft.subject, dataset: { focusKey: 'q-subject' }, on: { input: (e) => { draft = { ...draft, subject: e.target.value }; touch(); } } }),
      ),
      h('div', { class: 'pl-field' },
        h('label', { for: msgId }, t('query.message'), ' ', h('span', { class: 'muted xs' }, `(${t('common.required')})`)),
        textarea,
        errEl,
      ),
      h('div', { class: 'pl-field' },
        h('label', { for: tagId }, t('query.tag')),
        h('select', { class: 'pl-select', id: tagId, dataset: { focusKey: 'q-tag' }, on: { change: (e) => { draft = { ...draft, tag: e.target.value || null }; touch(); } } }, tagOptions(ctx, draft.tag)),
      ),
      lines.length ? h('fieldset', { class: 'pl-fieldset pl-query-notes' },
        h('legend', null, t('tags.note_label')),
        h('p', { class: 'pl-hint' }, t('tags.note_private')),
        lines.map((line) => {
          const nid = uid('q-note');
          return h('div', { class: 'pl-field' },
            h('label', { for: nid }, ctx.content.lineLabel(line)),
            h('textarea', { class: 'pl-textarea pl-textarea-sm', id: nid, rows: 2, maxlength: 1000, placeholder: t('tags.note_placeholder'), dataset: { focusKey: `q-note-${line.id}` },
              on: { input: (e) => { const notes = { ...draft.notes }; if (e.target.value.trim()) notes[line.id] = e.target.value.slice(0, 1000); else delete notes[line.id]; draft = { ...draft, notes }; touch(); } } }, draft.notes[line.id] || ''),
          );
        }),
      ) : null,
    );
  }

  function resultPanel() {
    const s = draft.status;
    if (s === 'draft') return null;
    const body = [];
    let kind = 'info';
    if (s === 'sending') { body.push(h('p', null, t('query.sending'))); }
    else if (s === 'submitted') {
      kind = 'success';
      if (draft.lastError === 'duplicate') body.push(h('p', { class: 'strong' }, t('query.duplicate_blocked', { reference: draft.caseReference })));
      else body.push(h('p', { class: 'strong' }, t('query.submitted')));
      body.push(h('p', null, t('query.case_reference', { reference: draft.caseReference })));
      if (draft.acknowledgedAt) body.push(h('p', null, t('query.submitted_at', { date: ctx.fmt.dateTime(draft.acknowledgedAt) })));
      body.push(draft.nextStep ? h('p', null, `${t('query.next_step')}: `, h('span', { class: 'pl-query-next-step' }, draft.nextStep)) : h('p', { class: 'muted small' }, t('query.response_time_unknown')));
    } else if (s === 'saved_offline') {
      kind = 'warn';
      body.push(h('p', { class: 'strong' }, draft.lastError === 'offline' ? t('query.offline_saved') : t('query.no_service')));
      if (draft.lastError !== 'offline') body.push(h('p', { class: 'muted small' }, t('query.offline_saved')));
      body.push(h('p', { class: 'muted small' }, t('query.saved_at', { date: ctx.fmt.dateTime(draft.updatedAt) })));
    } else if (s === 'failed') {
      kind = 'error';
      if (draft.lastError === 'interrupted') body.push(h('p', { class: 'strong' }, t('query.interrupted')));
      else if (draft.lastError === 'duplicate') body.push(h('p', { class: 'strong' }, t('query.duplicate_blocked', { reference: '—' })));
      else { body.push(h('p', { class: 'strong' }, t('query.failed'))); body.push(h('p', null, t('query.failed_detail'))); }
      if (draft.lastError && draft.lastError !== 'interrupted') body.push(h('p', { class: 'muted small' }, t('query.last_error', { code: draft.lastError })));
    }
    return h('div', { class: 'pl-query-result', tabindex: '-1', role: kind === 'error' ? 'alert' : 'status' }, notice(ctx, h('div', { class: 'stack-sm' }, body), { kind }));
  }

  function serviceNotice() {
    if (readOnly() || state.sending) return null;
    if (!online()) return notice(ctx, t('query.send_offline'), { kind: 'warn' });
    if (service.connected) return notice(ctx, t('query.service_connected', { service: service.name || '—' }), { kind: 'info' });
    return notice(ctx, t('query.service_not_connected'), { kind: 'neutral' });
  }

  function renderReview() {
    const payload = buildPayload(draft, record);
    const lines = linesOf();
    const entries = entriesOf();
    const json = JSON.stringify(payload, null, 2);
    const pre = h('pre', { class: 'pl-code', tabindex: '0', aria: { label: t('query.payload_json') } }, json);
    const noteLines = lines.filter((l) => payload.notes[l.id]);
    const row = (label, value) => [h('dt', null, label), h('dd', null, value)];
    return h('div', { class: 'stack' },
      resultPanel(),
      serviceNotice(),
      h('div', null, h('h4', null, t(readOnly() ? 'query.what_was_sent' : 'query.what_will_be_sent')), h('p', { class: 'muted small' }, t('query.payload_note'))),
      h('dl', { class: 'pl-dl pl-query-payload' },
        row(t('query.document_reference'), `${payload.documentRef.id} · ${t('masthead.version', { version: payload.documentRef.version })}`),
        row(t('query.lines_included'), lines.length ? h('ul', { class: 'pl-query-sent-list' }, lines.map((l) => h('li', null, h('code', null, l.id), ' · ', ctx.content.lineLabel(l), ' · ', amount(ctx, l.amountMinor), payload.tags[l.id] ? h('span', { class: 'pl-chip pl-chip-accent' }, tagLabel(ctx, payload.tags[l.id])) : null))) : t('common.none')),
        lines.length ? row(t('select.selected_total'), amount(ctx, sumLines(lines), { cls: 'strong' })) : null,
        row(t('query.entries_included'), entries.length ? h('ul', { class: 'pl-query-sent-list' }, entries.map((e) => h('li', null, h('code', null, e.id), ' · ', ctx.fmt.date(e.date, 'weekday'), ' · ', entryHours(ctx, e)))) : t('common.none')),
        row(t('query.tag'), payload.tag ? tagLabel(ctx, payload.tag) : t('tags.none')),
        row(t('query.note'), noteLines.length ? h('ul', { class: 'pl-query-sent-list' }, noteLines.map((l) => h('li', null, h('b', null, ctx.content.lineLabel(l)), ': ', h('span', { class: 'pl-query-message' }, payload.notes[l.id])))) : t('common.none')),
        row(t('query.subject'), payload.subject || t('common.none')),
        row(t('query.message'), payload.message ? h('p', { class: 'pl-query-message' }, payload.message) : h('span', { class: 'muted' }, t('query.no_message_yet'))),
        row(t('app.language'), LANGUAGE_NAMES[payload.locale] || payload.locale),
        row(t('query.reference_key'), h('code', { class: 'break' }, payload.idempotencyKey)),
      ),
      h('details', { class: 'pl-details pl-query-json' },
        h('summary', null, t('query.payload_json')),
        pre,
        h('div', { class: 'pl-btn-group', style: { marginTop: '8px' } },
          h('button', { class: 'pl-btn pl-btn-sm', type: 'button', on: { click: async () => {
            try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard'); await navigator.clipboard.writeText(json); toast(t('common.copied')); announce(t('common.copied')); }
            catch (e) { selectText(pre); toast(t('query.copy_failed'), { kind: 'error' }); announce(t('query.copy_failed')); }
          } } }, icon('copy', { size: 16 }), t('query.copy_payload')),
        ),
      ),
    );
  }

  function render() {
    clear(host);
    stepHeading.textContent = readOnly() ? t('query.view_title') : stepName(state.step);
    const body = state.step === 1 ? renderLines() : state.step === 2 ? renderDetails() : renderReview();
    append(host, [header(), stepHeading, state.step === 3 || readOnly() ? null : h('p', { class: 'muted small' }, t('query.intro')), body]);
    syncFooter();
  }

  function syncFooter() {
    const ro = readOnly();
    const busy = state.sending;
    const show = (btn, on) => { btn.hidden = !on; };
    show(btnDelete, state.saved && !ro && !busy);
    show(btnSave, !ro);
    show(btnBack, !ro && state.step > 1);
    show(btnNext, !ro && state.step < 3);
    show(btnSend, !ro && state.step === 3);
    show(btnDone, ro);
    btnSave.disabled = busy;
    btnBack.disabled = busy;
    btnNext.disabled = busy;
    btnSend.disabled = busy;
    btnSend.setAttribute('aria-disabled', String(busy || !online()));
    clear(btnSend);
    btnSend.append(icon('send', { size: 16 }), busy ? t('query.sending') : (draft.status === 'failed' || draft.status === 'saved_offline') ? t('query.retry') : t('query.submit'));
  }

  dlg = openDialog({
    title: readOnly() ? t('query.view') : t('query.title'),
    closeLabel: t('common.close'),
    className: 'pl-query-dialog',
    initialFocus: stepHeading,
    body: () => { render(); return host; },
    actions: () => footer,
    onClose: () => {
      state.closed = true;
      if (unsub) { unsub(); unsub = null; }
      if (state.deleted || readOnly() || state.sending) return;
      const hasText = Boolean((draft.subject && draft.subject.trim()) || (draft.message && draft.message.trim()) || Object.keys(draft.notes).length);
      if (state.dirty && (state.saved || hasText)) { persist(); toast(t('query.draft_saved')); }
    },
  });
  unsub = ctx.store.subscribe(() => { if (!state.closed && state.step === 3) render(); else syncFooter(); }, ['online']);
  return dlg;
}
