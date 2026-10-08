# Paylight — Your pay, clearly.

Paylight is an interactive pay statement in which **the payslip is the document**. It opens directly into one recipient's statement, explains what was paid, what changed and what deserves attention, and lets the employee follow any number to its supporting detail, tag lines, ask Lumi (the pay companion) about them, raise a contextual payroll query, and keep the complete record as print, PDF or Excel.

> Every record bundled here is **constructed for presentation**. Nothing is employer-issued and nothing is proof of earnings. Production issuance has separate legal, privacy, delivery and integrity gates — see `docs/READINESS.md` and `docs/DECISIONS.md`.

## Quick start

```bash
npm install            # only dev tooling (Playwright) — the application itself has no dependencies
npm run present -- --region=CA-QC --lang=fr-CA --preset=complete --studio
npm run build:single -- --region=ZA --lang=zu-ZA          # dist/paylight.html, portable single file
npm run build                                             # presenter bundle + employee packages
npm test                                                  # data validation + unit tests
npm run test:e2e                                          # Playwright end-to-end checks
```

Open `dist/paylight.html` directly from disk; the fragment carries configuration:

```text
paylight.html#region=ZA&lang=xh-ZA&preset=complete
```

## What is in the box

| | |
|---|---|
| Six jurisdiction profiles | Ontario, Quebec, South Africa, France, Germany, Italy — each with its own record structure, statutory terminology, tax-year basis and paper size |
| Ten interface languages | en-CA, fr-CA, en-ZA, af-ZA, zu-ZA, xh-ZA, en-GB, fr-FR, de-DE, it-IT (prepared; unreviewed for issuance) |
| Seven constructed personas | Maya Bennett, Étienne Roy, Nomsa Dlamini, Sipho Khumalo (sparse), Lina Hoffmann, Camille Laurent, Sofia Ricci |
| Sections | My pay · Pay details · What changed · Time & leave · Total reward · Record & actions |
| Interactions | Lumi (local document assistance, connected adapter), the personal pay story, tagging and contextual queries, jargon and calculation disclosure, Make it mine, Presenter Studio |
| Outputs | Print, text-based PDF, typed `.xlsx`, selected-lines extract, neutral calendar file, wallet pass preview with provider adapters |
| Integrity | One deterministic calculation engine feeds every total, chart, story value and export; `npm run validate` proves each record reconciles |

## Documentation

- `docs/CONFIGURATION.md` — command line, fragment options, precedence, profiles and languages, Studio, storage
- `docs/ARCHITECTURE.md` — module layout, the `ctx` API, rendering and accessibility conventions
- `docs/DATA-CONTRACT.md` — profiles, records, calculations, content packs, validation
- `docs/TESTING.md` — what is checked and how; manual checks still required
- `docs/READINESS.md` — integration/readiness register: local, connected, unavailable, awaiting approval; measurements
- `docs/DECISIONS.md` — decisions taken under the PRD's recommended defaults and open questions
- `docs/PRD.md` — the product requirements document this build implements

## Accessibility

UserWay is the only accessibility widget (loaded once, bottom left, from the host the PRD supplies). The application itself is built to be usable without it: semantic structure, labelled controls, keyboard navigation, focus management, reduced-motion support, chart alternatives, captions and transcript. Conformance is to be tested, not assumed.

## Licence

Proprietary working prototype. Working names (Paylight, Lumi, Avenlo) are not trademark-cleared.
