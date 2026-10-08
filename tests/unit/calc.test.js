import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, verifyTotals, lineEffect, varianceBridge, verifyYtd, verifyTime, verifyLeave, rewardSummary, grossToNetFlow, explainLine, recomputeLine, comparisonTable, verifyRecord } from '../../src/app/calc.js';
import { record } from '../../src/data/records/CA-ON/maya-bennett.js';
import { profile } from '../../src/data/profiles/CA-ON/profile.js';

test('totals reconcile to supplied totals', () => {
  const v = verifyTotals(record, profile);
  assert.equal(v.ok, true, JSON.stringify(v.mismatches));
  assert.equal(v.totals.net, 219210);
  assert.equal(v.totals.payable, 227850);
});

test('line effects are linear and signed by the totals spec', () => {
  const base = record.lines.find((l) => l.id === 'e-base');
  const cpp = record.lines.find((l) => l.id === 'd-cpp');
  const reimb = record.lines.find((l) => l.id === 'r-exp');
  assert.equal(lineEffect(base, 'net', profile), 1);
  assert.equal(lineEffect(cpp, 'net', profile), -1);
  assert.equal(lineEffect(reimb, 'net', profile), 0);
  assert.equal(lineEffect(reimb, 'payable', profile), 1);
});

test('variance bridge reconciles exactly against the latest prior period', () => {
  const b = varianceBridge(record, record.history[0], profile);
  assert.equal(b.unexplained, 0);
  assert.equal(b.change, 219210 - 210381);
  assert.equal(b.steps[0].lineId, 'e-retro');
  assert.equal(b.steps.find((s) => s.lineId === 'd-cpp').effect, -(17763 - 17049));
});

test('bridge reconciles against every included prior period', () => {
  for (const prior of record.history) assert.equal(varianceBridge(record, prior, profile).unexplained, 0, prior.periodId);
});

test('YTD chain, time and leave reconcile', () => {
  assert.deepEqual(verifyYtd(record).problems, []);
  assert.deepEqual(verifyTime(record).problems, []);
  assert.deepEqual(verifyLeave(record).problems, []);
  assert.equal(verifyRecord(record, profile).ok, true);
});

test('every line recomputes from its disclosed inputs', () => {
  for (const line of record.lines) {
    const r = recomputeLine(line, record);
    assert.equal(r.ok, true, `${line.id}: ${JSON.stringify(r)}`);
    const e = explainLine(line, record);
    assert.ok(Array.isArray(e.inputs));
    assert.equal(e.result, line.amountMinor);
  }
});

test('reward excludes employee deductions and reimbursements', () => {
  const r = rewardSummary(record, profile);
  assert.equal(r.cash, 312000);
  assert.equal(r.employer, 48177);
  assert.equal(r.noncash, 850);
  assert.equal(r.total, 312000 + 48177 + 850);
  assert.equal(r.annualised, r.total * 26);
});

test('gross-to-net flow groups deductions and totals to net', () => {
  const f = grossToNetFlow(record, profile);
  const deducted = f.deductions.reduce((s, d) => s + d.amount, 0);
  assert.equal(f.gross - deducted, f.net);
});

test('comparison table spans current and history with stable ids', () => {
  const c = comparisonTable(record, record.history);
  assert.equal(c.periods.length, 4);
  const bonus = c.rows.find((r) => r.lineId === 'e-bonus');
  assert.deepEqual(bonus.values, [null, null, null, 50000]);
});

test('a tampered total is detected', () => {
  const tampered = { ...record, suppliedTotals: { ...record.suppliedTotals, net: 219211 } };
  assert.equal(verifyTotals(tampered, profile).ok, false);
});
