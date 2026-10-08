# Paylight data contract

Paylight separates three layers. Only the first is authoritative.

| Layer | Where | Change policy |
|---|---|---|
| Issued record | `src/data/records/<PROFILE>/<scenario>.js` + governed content `src/data/profiles/<PROFILE>/content.<locale>.js` | Never edited by presentation controls, chat, tags or Studio. Corrections are a new linked issue (`document.supersedes`). |
| Experience | `src/app/config.js`, presets, prefs | Changes how the record is explored, never its meaning or values. |
| Interaction state | `src/app/persist.js` | Tags, selections, drafts, acknowledgements. Scoped to recipient/document. Never contains payroll content. |

All money values are **integer minor units** (cents). Hours are **integer hundredths** (8000 = 80.00 h). Day balances are integer hundredths of days. Rates are minor units per unit (`rateMinor`) or permyriad (`ratePermyriad`, 500 = 5.00 %). Rounding: half away from zero, once, at the end of each calculation (`src/app/money.js`).

## Profile (jurisdiction pack) — `profile.js`

```js
export const profile = {
  id: 'CA-ON', version: '2026.1',
  country: 'CA', countryKey: 'country.ca', jurisdiction: 'CA-ON', subdivision: 'ON' | null,
  group: 'north-america' | 'africa' | 'europe',           // navigation group only — not a legal ruleset
  currency: 'CAD', locales: ['en-CA', 'fr-CA'], defaultLocale: 'en-CA', statutoryLocale: 'en-CA',
  paper: 'letter' | 'a4',
  taxYear: { startMonth: 1, startDay: 1, basisKey: 'ytd.basis.calendar_year' },   // ZA: startMonth 3, 'ytd.basis.march_year'
  payFrequency: 'biweekly' | 'monthly' | 'weekly' | 'semimonthly',
  entity: { legalName, tradingName, address: { lines: [], city, region, postalCode, country }, registrations: [{ key, valueMasked }] },
  primaryTotal: 'net',          // the total the bridge, story and masthead "net" use
  payableTotal: 'payable',      // the amount actually paid (may equal primaryTotal)
  totals: [ /* ordered reconciliation spec, see below */ ],
  categoryOrder: ['earning', 'reimbursement', 'deduction', 'noncash', 'employer'],
  reward: { grossTotal: 'gross', deductionsTotal: 'employeeDeductions', definitionKey: 'reward.definition.default' },
  statutoryTerms: { cpp: { term: 'Canada Pension Plan (CPP)', locale: 'en-CA' } },   // original-language statutory names
  requiredFields: [{ path: 'employee.displayName', reasonKey: 'req.employee_identity' }],
  requiredDisclosures: ['record_keeping', 'constructed_notice'],
  pack: { effectiveFrom, reviewStatus: 'constructed-unreviewed', reviewOwner, sources: [{ title, url }], notes },
  modules: { timeLeave: true, totalReward: true },
};
```

### Totals specification

`totals` is evaluated in order by `computeTotals()` in `src/app/calc.js`. Each entry is one of:

- `{ id, sum: selector }` — sum of `amountMinor` over lines matching the selector. Selector fields: `categories`, `groups`, `excludeGroups`, `lineIds`, `excludeIds`, `cash`, `taxable`, `flags`, `notFlags`.
- `{ id, formula: ['gross', '-', 'employeeDeductions'] }` — linear combination of earlier totals.

Flags on entries: `required` (payroll must supply it), `prominent`, `net`, `payable`. Because totals are linear in lines, the variance bridge reconciles exactly by construction.

Profiles must model their own structure. Examples: France has `grossSalary`, `employeeContributions`, `netSocial`, `netTaxable`, `withholdingTax`, `netBeforeTax`, `netPayable`; Germany has `grossTotal` (Gesamtbrutto, including non-cash), `taxes`, `socialInsurance`, `net`, `payable` (after deducting the non-cash benefit again). Never force every country into one gross-minus-deductions line.

## Record — `<scenario>.js`

See `src/data/records/CA-ON/maya-bennett.js` for a complete reference. Required shape:

```js
export const record = {
  schemaVersion: 1,
  scenario: { id, summary, tags: ['regular'|'variable-hours'|'adjustment'|'sparse'|'overtime'|'noncash'|'leave'] },
  document: { id, version, issuedAt, supersedes, supersededBy, profileId, profileVersion, contentVersion,
              period: { start, end, sequence, of, frequency }, payDate, currency,
              taxYear: { label, start, end }, languages: [approved locales],
              provenance: { kind: 'constructed', notice: 'not-proof-of-earnings', issuer: null },
              integrity: { status: 'not-verified', method: null } },
  employer: { legalName, tradingName, address, registrations: [{ key, valueMasked }], payrollContact },
  employee: { displayName, givenName, familyName, employeeNumber, occupation, classification, department, location, hireDate, identifiers: [{ key, valueMasked }] },
  payment: { method, amountMinor, date, bankMasked, reference },   // amountMinor MUST equal profile.payableTotal
  lines: [Line],
  suppliedTotals: { <totalId>: minor },   // MUST equal computeTotals() for every id
  adjustments: [{ id, key, amountMinor, paymentDate, separatePayment: true, reasonKey? }],  // separate payments, distinct from lines
  history: [Prior, Prior, Prior],          // ≥ 3 prior periods, newest first, each with lines (id, category, group, key, amountMinor, ytdMinor, cash?, taxable?, hoursHundredths?) and suppliedTotals
  time: { scheduleNote, entries: [Entry], leave: { balances: [Balance], movements: [Movement] }, upcomingPayDates: [] },
  benefits: [{ id, key, employerAmountMinor, employeeAmountMinor, lineIds, cash: false }],
  disclosures: [{ id, key, required }],   // must include every profile.requiredDisclosures key and 'constructed_notice'
  policies: ['pol-…'],
  highlights: [{ kind: 'change', lineId, reasonKey }],  // reasonKey from the interface pack 'highlight.*'
  story: { audio: {} },
};
```

### Line

```js
{ id: 'e-ot', category: 'earning'|'deduction'|'employer'|'reimbursement'|'noncash'|'advance'|'info',
  group: 'regular'|'overtime'|'premium'|'leave'|'bonus'|'adjustment'|'tax'|'social'|'retirement'|'health'|'union'|'expenses'|'benefit'|'garnishment'|'other',
  key: 'overtime_150',            // content.lines[key] must exist in EVERY approved language
  amountMinor: 45000, cash: true, taxable: true, ytdMinor: 180000,
  calc: Calc, timeEntryIds?: [], timeBucket?: 'overtimeMinutes'|'regularMinutes'|'workedMinutes'|'paidMinutes',
  sourceRef: 'payroll:run-2026-09', explanationKey?: 'exp.overtime', policyIds?: [], glossaryKey?: 'overtime', statutoryKey?: 'uif',
  flags?: ['exclude_from_reward'] }
```

Amounts are stored as positive magnitudes; the category decides direction through the totals spec. A negative `amountMinor` is allowed only for corrections (e.g. a negative adjustment line).

### Calc (calculation disclosure)

| type | fields | use |
|---|---|---|
| `hours_rate` | `hoursHundredths`, `rateMinor`, `multiplier100` (150 = ×1.5) | hourly pay, overtime, premiums. If `timeEntryIds` is set, Σ entry minutes (in `timeBucket`) must equal the hours. |
| `rate_base` | `baseLineIds` or `baseMinor`, `ratePermyriad` | employer-policy percentages (pension match 5 %, union dues 1 %). |
| `units_rate` | `unitsHundredths`, `unit`, `rateMinor` | per-day, per-period, per-km amounts. |
| `sum_lines` | `lineIds` | a line that totals other lines. |
| `fixed` | `amountMinor` | fixed premiums. |
| `supplied` | `basisMinor?`, `noteKey?` | **statutory tax and social contributions.** Payroll supplied the amount; Paylight shows the basis and never recomputes or infers a legal rate. |

Rule: **never encode a legal tax or social-contribution rate** (PAYE, UIF, CPP, EI, QPP, QPIP, RRQ, Lohnsteuer, Sozialversicherung, CSG/CRDS, INPS, IRPEF…) as `rate_base`. Use `supplied` with a basis. Employer-policy percentages are fine as `rate_base` with a `policyIds` reference. Optional fields `sourcePeriod` and `noteKey` (a content explanation key) are allowed on any calc.

### Time entries, leave, benefits

```js
// work entry
{ id: 't-03', date: '2026-09-16', type: 'work', start: '07:00', end: '16:30', breakMinutes: 60, workedMinutes: 510, regularMinutes: 480, overtimeMinutes: 30, premiumMinutes: 0, paidMinutes: 510, overtimeCode?: 'ot150' }
// leave / holiday / rest
{ id: 't-05', date: '2026-09-18', type: 'leave', leaveType: 'annual', minutes: 480, paidMinutes: 480 }
{ id: 't-07', date: '2026-09-24', type: 'holiday', holidayKey: 'heritage_day', minutes: 480, paidMinutes: 480 }
// balance (hundredths of unit) — closing MUST equal opening + accrued − taken + adjusted
{ type: 'annual', unit: 'days'|'hours', opening, accrued, taken, adjusted, closing, asOf, explanationKey? }
// movement
{ id, date, type, kind: 'taken'|'accrued'|'adjusted', amount, unit, timeEntryId?, lineId? }
```

Year-to-date chain: for every line present in two consecutive periods of the same tax year, `ytd(current) = ytd(previous) + amount(current)`. South Africa's tax year starts 1 March; the chain resets at the boundary (set `taxYearLabel` on history entries).

## Governed content — `content.<locale>.js`

One file per approved language per profile. Sections: `document` (title, subtitle, recordKind), `categories`, `groups`, `totals`, `totalsPlain`, `lines` (`{ label, plain }`), `glossary` (`{ term, short, long? }`), `disclosures` (strings), `explanations` (`{ title, body }`), `policies` (`{ title, body }`), `benefits` (`{ label, plain }`), `leaveTypes`, `entryTypes`, `employerFields`, `employeeFields`, `paymentMethods`, `adjustments` (`{ label, plain }`), `story` (greeting). Every key referenced by the record and the profile's totals must exist in every approved language (validated).

Statutory names stay in their required language in `profile.statutoryTerms` and are shown beside the plain-language label whatever the interface language.

## Interface language packs — `src/data/lang/<locale>.js`

Flat `{ key: string }`. `en-CA.js` is the reference key set. Every pack must contain every reference key with identical `{placeholders}`. Plurals: `key.one` / `key.other` (and other CLDR categories where the language needs them). Validation: `node scripts/validate.js`.

## Validation

`npm run validate` checks: totals vs supplied, every calc recomputes to the issued amount, YTD chains, time ↔ hours, leave balances, bridge reconciliation for every prior period, payment amount, required disclosures, content coverage per approved language, interface pack coverage, bundler-safe module syntax, and that the generated data index matches the manifest. Run it after any data change. `--strict` also fails on remaining placeholder stubs.
