/**
 * Lumi's refusal guard and figure check across languages (src/ui/lumi-local.js guardCheck, unverifiedFigures).
 * Uses the real interface packs so each language's vocabulary is exercised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardCheck, unverifiedFigures } from '../../src/ui/lumi-local.js';
import { tIn } from '../../src/app/i18n.js';
import { computeTotals, rewardSummary, grossToNetFlow, varianceBridge } from '../../src/app/calc.js';
import * as registry from '../../src/data/index.js';

function ctxFor(tag, profileId = 'CA-ON') {
  const pack = registry.languages[tag];
  const ref = registry.languages['en-CA'];
  const record = registry.records[profileId][0];
  const profile = registry.profiles[profileId];
  const totals = computeTotals(record.lines, profile).totals;
  return {
    t: (k, p) => tIn(pack, ref, k, p),
    doc: { record, profile, computed: { totals, flow: grossToNetFlow(record, profile), reward: rewardSummary(record, profile), bridge: varianceBridge(record, record.history[0], profile) } },
  };
}
const intent = (tag, q, pid) => { const r = guardCheck(ctxFor(tag, pid), q); return r ? r.intent : null; };

test('change, approval, tax-ruling and other-person requests are refused in every language family', () => {
  const cases = [
    ['en-CA', 'Please increase my salary by 10%', 'guard'],
    ['en-CA', "What is Jordan's salary?", 'guard'],
    ['en-CA', 'Approve my payroll correction', 'guard'],
    ['fr-CA', 'Pouvez-vous augmenter mon salaire net?', 'guard'],
    ['fr-CA', 'Approuvez ma correction de paie', 'guard'],
    ['fr-CA', 'Quel est le salaire de mon collègue?', 'guard'],
    ['fr-CA', 'Mon impôt est-il correct?', 'guard'],
    ['de-DE', 'Können Sie mein Gehalt erhöhen?', 'guard'],
    ['de-DE', 'Bitte genehmigen Sie meine Korrektur', 'guard'],
    ['de-DE', 'Was verdient meine Kollegin?', 'guard'],
    ['it-IT', 'Può aumentare il mio stipendio?', 'guard'],
    ['af-ZA', 'Kan u asseblief my salaris verhoog?', 'guard'],
    ['zu-ZA', 'Ngicela ukhuphule iholo lami', 'guard'],
    ['xh-ZA', 'Ndicela unyuse umvuzo wam', 'guard'],
  ];
  for (const [tag, q, want] of cases) assert.equal(intent(tag, q), want, `${tag}: ${q}`);
});

test('explanation questions about changes are answered, not refused', () => {
  const cases = [
    ['en-CA', 'Why did my pay increase?'],
    ['en-CA', 'Can you explain why my tax went up?'],
    ['fr-CA', 'Pourquoi mon salaire a-t-il augmenté?'],
    ['de-DE', 'Warum wurde mein Gehalt erhöht?'],
    ['it-IT', 'Perché lo stipendio è aumentato?'],
    ['af-ZA', 'Hoekom het my salaris verhoog?'],
    ['zu-ZA', 'Kungani iholo lami likhuphukile?'],
    ['xh-ZA', 'Kutheni umvuzo wam unyukile?'],
    ['en-CA', 'What is my net pay made of?'],
  ];
  for (const [tag, q] of cases) assert.equal(intent(tag, q), null, `${tag}: ${q}`);
});

test('hypothetical calculations are declined truthfully', () => {
  assert.equal(intent('en-CA', 'What if I worked 10 more hours?'), 'hypothetical');
  assert.equal(intent('fr-CA', 'Et si je travaillais 10 heures de plus?'), 'hypothetical');
  assert.equal(intent('de-DE', 'Was wäre wenn ich mehr arbeite?'), 'hypothetical');
  assert.equal(intent('it-IT', 'Chiede se il netto è corretto'), null, 'Italian "e se" must not match inside "chiede se"');
});

test('query submission requests are redirected to the reviewed query flow', () => {
  assert.equal(intent('en-CA', 'Please submit a query about my overtime'), 'query');
  assert.equal(intent('fr-CA', 'Je veux soumettre une demande'), 'query');
});

test('figures in a connected answer that are not in the record are flagged', () => {
  const ctx = ctxFor('en-CA');
  assert.deepEqual(unverifiedFigures(ctx, 'Your net pay is $2,192.10 and gross is $3,120.00.'), []);
  assert.deepEqual(unverifiedFigures(ctx, 'Done — I have increased your net pay to $9,999.00.'), ['9,999.00']);
  assert.deepEqual(unverifiedFigures(ctxFor('de-DE', 'EU-DE'), 'Ihr Nettoverdienst beträgt 3.051,63 € und 4.444,44 €.'), ['4.444,44']);
});
