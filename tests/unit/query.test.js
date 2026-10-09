/** Unit tests for the payroll query state transitions (pure helpers in src/ui/query.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySubmitResult, createDraft, validateDraft, buildPayload, normaliseDraft, placeDraft, removeDraft } from '../../src/ui/query.js';

const record = {
  document: { id: 'DOC-1', version: 2, currency: 'CAD' },
  lines: [
    { id: 'e-base', key: 'base_salary', amountMinor: 300000 },
    { id: 'd-tax', key: 'income_tax', amountMinor: 52660 },
  ],
  time: { entries: [{ id: 't-01', date: '2026-09-14', type: 'work', paidMinutes: 480 }, { id: 't-05', date: '2026-09-18', type: 'leave', minutes: 480 }] },
};

function draftFor(extra = {}) {
  return { ...createDraft({ lineIds: ['e-base', 'd-tax'], entryIds: ['t-05'], notes: { 'e-base': 'why?', 'x-missing': 'ignored' }, lineTags: { 'e-base': 'please_explain', 'd-tax': 'please_explain' }, documentRef: { id: 'DOC-1', version: 2 }, locale: 'en-CA', now: '2026-10-01T10:00:00Z', id: 'q-1', idempotencyKey: 'idem-1' }), message: 'Please check', ...extra };
}

test('createDraft snapshots notes and tags for included lines only and infers a shared tag', () => {
  const d = createDraft({ lineIds: ['e-base', 'd-tax', 'e-base'], entryIds: ['t-05'], notes: { 'e-base': ' why? ', other: 'x' }, lineTags: { 'e-base': 'please_explain', 'd-tax': 'please_explain', other: 'missing_item' }, documentRef: { id: 'DOC-1', version: 2 }, locale: 'fr-CA', now: '2026-10-01T10:00:00Z', id: 'q-9', idempotencyKey: 'idem-9' });
  assert.deepEqual(d.lineIds, ['e-base', 'd-tax']);
  assert.deepEqual(d.entryIds, ['t-05']);
  assert.deepEqual(d.notes, { 'e-base': ' why? ' });
  assert.deepEqual(d.lineTags, { 'e-base': 'please_explain', 'd-tax': 'please_explain' });
  assert.equal(d.tag, 'please_explain');
  assert.equal(d.status, 'draft');
  assert.equal(d.caseReference, null);
  assert.equal(d.locale, 'fr-CA');
  assert.deepEqual(d.documentRef, { id: 'DOC-1', version: 2 });
  assert.equal(d.createdAt, '2026-10-01T10:00:00Z');
});

test('createDraft leaves the tag empty when included lines disagree', () => {
  const d = createDraft({ lineIds: ['a', 'b'], lineTags: { a: 'please_explain', b: 'hours_question' } });
  assert.equal(d.tag, null);
  assert.match(d.id, /^q-/);
  assert.match(d.idempotencyKey, /^idem-/);
  assert.notEqual(d.id, d.idempotencyKey);
});

test('validateDraft requires at least one line or entry and a message', () => {
  assert.deepEqual(validateDraft({ lineIds: [], entryIds: [], message: '' }).errors, ['no_lines', 'message_required']);
  assert.deepEqual(validateDraft({ lineIds: [], entryIds: ['t-01'], message: '  ' }).errors, ['message_required']);
  assert.deepEqual(validateDraft({ lineIds: ['e-base'], entryIds: [], message: 'Hi' }), { ok: true, errors: [] });
});

test('buildPayload carries issued amounts, document reference and only included-line notes/tags', () => {
  const p = buildPayload(draftFor({ subject: '  Base pay  ', notes: { 'e-base': 'why?', 'd-tax': '   ' } }), record);
  assert.deepEqual(p.documentRef, { id: 'DOC-1', version: 2 });
  assert.deepEqual(p.lineIds, ['e-base', 'd-tax']);
  assert.deepEqual(p.amounts, { 'e-base': 300000, 'd-tax': 52660 });
  assert.equal(p.currency, 'CAD');
  assert.deepEqual(p.entryIds, ['t-05']);
  assert.deepEqual(p.entries, [{ id: 't-05', date: '2026-09-18' }]);
  assert.equal(p.tag, 'please_explain');
  assert.deepEqual(p.tags, { 'e-base': 'please_explain', 'd-tax': 'please_explain' });
  assert.deepEqual(p.notes, { 'e-base': 'why?' });
  assert.equal(p.subject, 'Base pay');
  assert.equal(p.message, 'Please check');
  assert.equal(p.locale, 'en-CA');
  assert.equal(p.idempotencyKey, 'idem-1');
  // Removing a line from the draft removes its amount, tag and note from the payload.
  const p2 = buildPayload(draftFor({ lineIds: ['d-tax'] }), record);
  assert.deepEqual(p2.amounts, { 'd-tax': 52660 });
  assert.deepEqual(p2.notes, {});
  assert.deepEqual(Object.keys(p2.tags), ['d-tax']);
});

test('acknowledgement with a case reference → submitted with reference, time and next step', () => {
  const d = applySubmitResult(draftFor({ status: 'sending' }), { ok: true, ack: { caseReference: 'PAY-77', acknowledgedAt: '2026-10-01T10:05:00Z', nextStep: 'We reply within two days' } }, '2026-10-01T10:05:01Z');
  assert.equal(d.status, 'submitted');
  assert.equal(d.caseReference, 'PAY-77');
  assert.equal(d.acknowledgedAt, '2026-10-01T10:05:00Z');
  assert.equal(d.nextStep, 'We reply within two days');
  assert.equal(d.lastError, null);
  assert.equal(d.updatedAt, '2026-10-01T10:05:01Z');
  assert.equal(d.idempotencyKey, 'idem-1');
});

test('acknowledgement without a case reference is never shown as submitted', () => {
  const d = applySubmitResult(draftFor({ status: 'sending' }), { ok: true, ack: { caseReference: '' } }, 'now');
  assert.equal(d.status, 'failed');
  assert.equal(d.lastError, 'no_ack');
  assert.equal(d.caseReference, null);
  const d2 = applySubmitResult(draftFor({ status: 'sending' }), { ok: true }, 'now');
  assert.equal(d2.status, 'failed');
  assert.equal(d2.lastError, 'no_ack');
});

test('no service or offline → saved_offline with no case reference and no next step', () => {
  for (const code of ['no_service', 'offline']) {
    const d = applySubmitResult(draftFor({ status: 'sending' }), { ok: false, error: { code, message: 'x' } }, 'now');
    assert.equal(d.status, 'saved_offline', code);
    assert.equal(d.lastError, code);
    assert.equal(d.caseReference, null);
    assert.equal(d.acknowledgedAt, null);
    assert.equal(d.nextStep, null);
    assert.equal(d.message, 'Please check', 'draft content is preserved');
  }
});

test('duplicate with a returned reference → submitted with that reference; without one → failed', () => {
  const d = applySubmitResult(draftFor({ status: 'sending' }), { ok: false, error: { code: 'duplicate', caseReference: 'PAY-77' } }, 'now');
  assert.equal(d.status, 'submitted');
  assert.equal(d.caseReference, 'PAY-77');
  assert.equal(d.lastError, 'duplicate');
  const d2 = applySubmitResult(draftFor({ status: 'sending' }), { ok: false, error: { code: 'duplicate' } }, 'now');
  assert.equal(d2.status, 'failed');
  assert.equal(d2.lastError, 'duplicate');
  assert.equal(d2.caseReference, null);
});

test('other errors → failed, draft kept, idempotency key unchanged for retry', () => {
  const before = draftFor({ status: 'sending' });
  for (const code of ['network', 'http_500', 'no_token', undefined]) {
    const d = applySubmitResult(before, { ok: false, error: { code, message: 'boom' } }, 'now');
    assert.equal(d.status, 'failed', String(code));
    assert.equal(d.lastError, code || 'unknown');
    assert.equal(d.idempotencyKey, before.idempotencyKey);
    assert.equal(d.message, before.message);
    assert.deepEqual(d.lineIds, before.lineIds);
    assert.equal(d.caseReference, null);
  }
  assert.equal(applySubmitResult(before, null, 'now').status, 'failed');
  assert.equal(applySubmitResult(before, undefined, 'now').lastError, 'unknown');
});

test('a submitted query is never downgraded by a later error', () => {
  const submitted = applySubmitResult(draftFor({ status: 'sending' }), { ok: true, ack: { caseReference: 'PAY-1' } }, 'now');
  const again = applySubmitResult(submitted, { ok: false, error: { code: 'network' } }, 'later');
  assert.equal(again.status, 'submitted');
  assert.equal(again.caseReference, 'PAY-1');
  assert.equal(again.lastError, 'network');
});

test('applySubmitResult is pure', () => {
  const before = draftFor({ status: 'sending' });
  const snapshot = JSON.stringify(before);
  applySubmitResult(before, { ok: true, ack: { caseReference: 'PAY-2' } }, 'now');
  applySubmitResult(before, { ok: false, error: { code: 'offline' } }, 'now');
  assert.equal(JSON.stringify(before), snapshot);
});

test('normaliseDraft resumes an interrupted send as failed and never trusts submitted without a reference', () => {
  const d = normaliseDraft({ id: 'q-5', status: 'sending', lineIds: ['e-base'], message: 'm', documentRef: { id: 'DOC-1', version: 1 } });
  assert.equal(d.status, 'failed');
  assert.equal(d.lastError, 'interrupted');
  assert.deepEqual(d.entryIds, []);
  assert.deepEqual(d.notes, {});
  assert.ok(d.idempotencyKey);
  const d2 = normaliseDraft({ id: 'q-6', status: 'submitted', caseReference: null, lineIds: [] });
  assert.equal(d2.status, 'failed');
  assert.equal(d2.lastError, 'no_ack');
  const d3 = normaliseDraft({ id: 'q-7', status: 'bogus', lineIds: ['a'] });
  assert.equal(d3.status, 'draft');
});

test('placeDraft moves submitted queries out of drafts and keeps the lists free of duplicates', () => {
  const q = { drafts: [{ id: 'q-1', status: 'draft' }, { id: 'q-2', status: 'draft' }], submitted: [{ id: 'q-0', status: 'submitted' }] };
  const after = placeDraft(q, { id: 'q-1', status: 'submitted', caseReference: 'PAY-1' });
  assert.deepEqual(after.drafts.map((d) => d.id), ['q-2']);
  assert.deepEqual(after.submitted.map((d) => d.id), ['q-1', 'q-0']);
  assert.equal(after.active, null);
  const back = placeDraft(after, { id: 'q-2', status: 'saved_offline' });
  assert.deepEqual(back.drafts.map((d) => d.id), ['q-2']);
  const gone = removeDraft(back, 'q-2');
  assert.deepEqual(gone.drafts, []);
  assert.deepEqual(gone.submitted.map((d) => d.id), ['q-1', 'q-0']);
  assert.deepEqual(placeDraft(undefined, { id: 'n', status: 'draft' }).drafts.map((d) => d.id), ['n']);
});
