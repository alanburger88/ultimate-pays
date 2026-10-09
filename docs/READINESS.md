# Integration and readiness register

Status vocabulary: **Local** — works in the portable file with no network. **Connected** — implemented behind an adapter and needs a configured HTTPS endpoint plus runtime credential; untested against a real service in this build. **Unavailable** — not possible from a standalone file; truthful unavailable state is shown. **Awaiting approval** — blocked on a decision, contract, review or provider onboarding.

| Capability | Status | Evidence / notes |
|---|---|---|
| Open directly into one recipient's statement (no portal) | Local | `src/app/main.js`; employee packages contain exactly one record |
| Six jurisdiction profiles with own structure and provenance | Local | `src/data/profiles/*`; `npm run validate` |
| Ten interface languages, governed content per approved language | Local (prepared, unreviewed) | `scripts/validate.js` coverage checks; native-speaker review outstanding |
| Statutory terms in required language beside plain language | Local | `profile.statutoryTerms`, `lineTitle()` |
| Deterministic calculations, reconciliation, bridge, YTD chain | Local | `src/app/calc.js`, `tests/unit/calc.test.js` |
| Tabs (desktop) / section selector (mobile), cards at 320 px | Local | `tests/e2e/run.js` |
| Jargon definitions and calculation disclosure | Local | `components/common.js`, `ui/calc-dialog.js` |
| What changed: reconciled bridge, comparison table | Local | `ui/sections/what-changed.js` |
| Time & leave calendar, balances, neutral calendar export | Local | `ui/sections/time-leave.js`, `export/ics.js` |
| Total reward with transparent definition | Local | `ui/sections/total-reward.js` |
| Tagging, selection tray, query drafts, payload review | Local | `ui/tray.js`, `ui/query.js` |
| Query submission with acknowledgement and case reference | Connected | `adapters/queries.js` (`HttpQueryService`); without an endpoint: "Saved on this device. Not sent to payroll." |
| Lumi local explanations and document search | Local | `ui/lumi-local.js`; labelled "No AI model is connected" |
| Lumi connected governed assistant | Connected | `adapters/assistant.js` (`HttpAssistant`); contract documented in the file; needs the Acorn.Insight (or equivalent) endpoint and token provider |
| Personal pay story (captions, transcript, controls, reduced motion) | Local | `ui/story.js` |
| Narration audio | Awaiting approval | No reviewed audio bundled; `record.story.audio[locale]` seam exists; on-demand device voice only when available |
| Make it mine | Local | `ui/mine.js`; preferences in localStorage, non-sensitive |
| Presenter Studio, presets, import/export/share, employee packaging | Local | `ui/studio.js`, `bin/paylight.js build --employee` |
| Print (paginated, no controls) | Local | `export/print.js`, `styles/print.css` |
| Text-based searchable PDF | Local | `export/pdf.js`; `tests/unit/exports.test.js` runs `pdftotext`. The built-in font covers Western European text only, so a record with other characters (for example Ł or ő in a name) is refused with a message pointing to Print rather than altered. Independent accessibility validation outstanding |
| Typed `.xlsx` workbook, selected extract | Local | `export/xlsx.js`; inline strings only, never formulas. Amounts, hours, dates, period start/end and rates are typed cells; a Particulars sheet carries employer, employee, document and payment particulars |
| Wallet: Apple | Unavailable → Connected | `adapters/wallet/apple.js`; needs pass type ID + signing certificate on an issuing server |
| Wallet: Google | Unavailable → Awaiting approval | `adapters/wallet/google.js`; needs issuer account with sensitive-data pass approval |
| Wallet: Samsung | Unavailable → Awaiting approval | `adapters/wallet/samsung.js`; needs partner onboarding and credentials |
| Identity / authentication | Unavailable → Connected | `adapters/identity.js`: with an endpoint, fetches a short-lived, document-scoped bearer token from a backend token endpoint behind the approved sign-in (credentialed request, HttpOnly session cookie), keeps it in memory only and refreshes before expiry; `tests/unit/identity.test.js`. Without an endpoint nothing authenticates and the local access screen says it is presentation only |
| Record integrity verification ("Verified") | Unavailable → Connected | `adapters/verification.js`; shown only after a real successful check |
| UserWay widget, bottom left | Connected (unverified) | Script injected once from `accessibilityserver.org` with `data-position="5"`; the host was unreachable from the build environment, so entitlement, domain configuration and live placement are unverified |
| Native accessibility (keyboard, focus, structure, reduced motion) | Local (to be tested) | WCAG 2.2 AA conformance must be evaluated with assistive technology, not assumed |
| Analytics / tracking | None | No third-party tracking of any kind |
| Secrets in the HTML or browser storage | None | Endpoints only; tokens from the identity adapter at runtime |
| Production issuance (legal, privacy, delivery, retention) | Awaiting approval | See `docs/DECISIONS.md` |

## Measurements

Run `node scripts/measure.js dist/paylight.html "#region=…"` to reproduce. Figures below are reported, not guaranteed; the environment is a headless Chromium with CPU throttling ×4 at 360×740, not an agreed device profile.

Measured on 9 October 2026 with `node scripts/measure.js` (headless Chromium 141, 360×740 mobile viewport, CPU throttling ×4, file:// origin, no network):

| Bundle | Raw | gzip | brotli | App ready | First contentful paint | DOM nodes |
|---|---|---|---|---|---|---|
| `dist/paylight.html` (presenter: 6 profiles, 7 records, 10 languages) | 1 515 KiB | 355 KiB | 266 KiB | ≈ 1.1 s | ≈ 220 ms | 338 |
| `dist/paylight-ZA-za-new-starter.html` (employee package) | 831 KiB | — | — | ≈ 0.8 s | ≈ 160 ms | 299 |

Section mounts after load (same profile): Pay details ≈ 100 ms, What changed ≈ 250 ms, Time & leave ≈ 160–180 ms, Total reward ≈ 100–120 ms, Record & actions ≈ 155–190 ms. The record is readable before any optional media or connected enhancement loads; the UserWay script is appended asynchronously after first render and cannot block the statement.
