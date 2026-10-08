import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursTimesRate, baseTimesRate, roundHalfUp, formatMoney, formatDate, formatHours, formatPercent } from '../../src/app/money.js';

test('rounding is half away from zero and applied once', () => {
  assert.equal(roundHalfUp(2.5), 3);
  assert.equal(roundHalfUp(-2.5), -3);
  assert.equal(roundHalfUp(2.4999), 2);
  assert.equal(hoursTimesRate(8000, 3750), 300000);
  assert.equal(hoursTimesRate(150, 2740, 150), 6165); // 1.5h × 27.40 × 1.5 = 61.65
  assert.equal(baseTimesRate(300000, 500), 15000);
  assert.equal(baseTimesRate(333333, 750), 25000); // 24999.975 → 25000
});

test('formatting never changes stored values and respects locale', () => {
  assert.equal(formatMoney(227850, { currency: 'CAD', locale: 'en-CA' }), '$2,278.50');
  assert.match(formatMoney(227850, { currency: 'CAD', locale: 'fr-CA' }), /2\s278,50\s\$/);
  assert.match(formatMoney(123456, { currency: 'EUR', locale: 'de-DE' }), /1\.234,56\s€/);
  assert.match(formatMoney(123456, { currency: 'ZAR', locale: 'en-ZA' }), /R\s?1[\s,]234[.,]56/);
  assert.equal(formatMoney(-500, { currency: 'EUR', locale: 'en-GB', signDisplay: 'exceptZero' }), '-€5.00');
});

test('dates are calendar dates, never shifted by timezone', () => {
  assert.equal(formatDate('2026-10-02', { locale: 'en-CA' }), 'Oct 2, 2026');
  assert.match(formatDate('2026-10-02', { locale: 'fr-FR', style: 'long' }), /2 octobre 2026/);
  assert.equal(formatHours(8000, { locale: 'en-CA' }), '80.00 h');
  assert.equal(formatPercent(500, { locale: 'en-CA' }), '5.00%');
});
