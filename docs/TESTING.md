# Testing Paylight

```bash
npm run validate      # data reconciliation, content and language coverage, module syntax, generated index
npm test              # validate + unit tests (calc engine, money/date formatting, config precedence, exports, Lumi local engine, query state)
npm run build         # presenter bundle and employee packages into dist/
npm run test:e2e      # Playwright: every profile × language at 320 and 1200 px, navigation, exports, story, Lumi, queries
node scripts/measure.js dist/paylight.html "#region=ZA&lang=zu-ZA&preset=complete"   # payload and render measurements
```

Playwright is a dev dependency (`npm i -D playwright`); the cloud build environment uses its pre-installed Chromium.

Last full run, 9 October 2026: 88 unit tests passed, 0 failed; 1 420 end-to-end checks passed, 0 failed (every profile × language at 320 px and 1200 px, a 200 % text-size pass, the cross-section journeys, address-bar parameter edits, and the header, theme toggle, story voice, wallet and drag-reorder checks).

## What the checks cover

**Financial integrity** (`scripts/validate.js`, `tests/unit/calc.test.js`): every supplied total equals the profile's reconciliation spec evaluated over the lines; every disclosed calculation recomputes to the issued amount; year-to-date chains hold across included periods; time entries reconcile to the hours they pay; leave balances reconcile; the variance bridge reconciles exactly against every prior period; the payment amount equals the payable total. The same functions feed the UI, Lumi, the story, PDF and Excel, so a reconciled record is reconciled everywhere.

**Regional content**: each record's content keys exist in every approved language; required disclosures are present; records name their issuer (issued or constructed provenance) and cannot claim verification.

**Languages**: every interface pack contains every reference key with matching placeholders; untranslated strings are flagged.

**Exports** (`tests/unit/exports.test.js`): PDF structure (xref offsets) and searchable text via `pdftotext`; `.xlsx` zip validity, inline strings (never formulas), numeric and date cell types.

**Navigation and mobile** (`tests/e2e/run.js`): no horizontal scroll and no clipped financial details at 320 CSS px for each section, profile and language; tabs on desktop; section sheet on mobile; keyboard paths; focus return from dialogs.

**Progressive disclosure**: net pay → line → calculation → shifts → query → back, with selection and filters preserved.

**Assistance, media, query workflow, exports, wallets, administration**: see the per-area checks in `tests/e2e/run.js`; each asserts the truthful state (e.g. a query saved offline never shows a case reference).

## Manual checks still required before any employee use

- WCAG 2.2 AA evaluation with assistive technology (NVDA/JAWS/VoiceOver/TalkBack) and with the UserWay widget blocked.
- UserWay account entitlement, allowed domains and the widget's data-access/network review.
- Native-speaker review of every language pack and content pack (prepared, not generated; still unreviewed for issuance).
- Qualified local payroll/legal review of each jurisdiction pack.
- PDF accessibility validation with an independent tool.
- Provider acceptance testing for each wallet before any "Added" claim.
