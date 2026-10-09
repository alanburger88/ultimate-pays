# Configuring Paylight

## Command line

The wrapper validates its flags against the bundled data registry before serving or building anything. An unknown profile, an unsupported region/language combination, an unknown preset or scenario is a visible error, never a silent fallback to another country's record.

```bash
npm run present -- --region=CA-QC --lang=fr-CA --preset=complete --studio
npm run present -- --region=ZA --lang=zu-ZA --preset=hourly
npm run build:single -- --region=EU-DE --lang=de-DE
npm run build:single -- --region=EU-DE --lang=de-DE --scenario=de-company-car --employee
npm run build                                  # presenter bundle + one employee package per scenario
node bin/paylight.js list                      # profiles, languages and scenarios
```

| Flag | Meaning |
|---|---|
| `--region=ID` | Profile identifier: `CA-ON`, `CA-QC`, `ZA`, `EU-FR`, `EU-DE`, `EU-IT`. Selects a complete, coherent record/profile, never just a currency symbol. |
| `--lang=TAG` | Interface language approved for that profile (see table below). |
| `--preset=NAME` | `core`, `complete`, `hourly`, `total-reward`. Chooses optional modules, starting section and table/chart emphasis. |
| `--scenario=ID` | Record within the profile (e.g. `za-overtime`, `za-new-starter`). Defaults to the first. |
| `--studio` | Open Presenter Studio on launch (`present` only). |
| `--employee` | Build an employee package: one recipient, no Studio, no other recipients' data. Requires `--region`. |
| `--out=FILE` | Output path for `build`. |
| `--endpoints=FILE` | JSON file of HTTPS service endpoints embedded in the build (see Integration endpoints). Never read from a link. |
| `--narration=off` | Leave the pay-story voice clips out of the build (smaller file; captions and the device voice remain). |
| `--port`, `--host`, `--open` | Dev-server options for `present`. |

`present` starts a dependency-free static server and prints a URL whose fragment carries the launch configuration. `build` embeds the same configuration as JSON (never code) in `<script id="paylight-launch" type="application/json">` inside the single HTML file.

## URL fragment and local-file equivalent

Any build or the dev server accepts the same options in the fragment, which also works when the file is opened directly from disk:

```text
paylight.html#region=ZA&lang=xh-ZA&preset=complete
paylight.html#region=CA-QC&lang=fr-CA&preset=hourly&section=time-leave
paylight.html#region=EU-FR&lang=fr-FR&studio=1
paylight.html#config=<base64url presentation settings>   (shareable preset link from Studio; configuration only)
```

Navigation keys (`section`, `line`, `view`) are also kept in the fragment so the browser's back button and shared links restore the employee's place.

`docs/URL-PARAMETERS.md` lists every parameter and a ready-made link for each region, record and language.

## Precedence

```
issued-record constraints  >  launch configuration (fragment, then embedded JSON)  >  saved presentation preferences  >  bundled defaults
```

- An employee package is bound to one recipient's record: `region` and `scenario` in the fragment are ignored with a notice.
- A record's approved language list limits the language selector; a saved language preference that the record does not approve falls back to the profile's default language **with a visible notice**. An explicit `--lang`/fragment request for an unsupported language is a configuration error offering an explicit "Continue in <default>" action.
- Optional modules that the record cannot support (no time data, no prior periods) are disabled with a stated reason in Studio.

## Profiles and languages

| Profile | Jurisdiction | Currency | Interface languages | Paper |
|---|---|---|---|---|
| `CA-ON` | Ontario, Canada | CAD | `en-CA`, `fr-CA` | Letter |
| `CA-QC` | Quebec, Canada | CAD | `fr-CA`, `en-CA` | Letter |
| `ZA` | South Africa | ZAR | `en-ZA`, `af-ZA`, `zu-ZA`, `xh-ZA` | A4 |
| `EU-FR` | France | EUR | `fr-FR`, `en-GB`, `de-DE`, `it-IT` | A4 |
| `EU-DE` | Germany | EUR | `de-DE`, `en-GB`, `fr-FR`, `it-IT` | A4 |
| `EU-IT` | Italy | EUR | `it-IT`, `en-GB`, `fr-FR`, `de-DE` | A4 |

"Europe" is a navigation group, not a legal ruleset. The English interface for European profiles does not select UK payroll law. Country, payroll jurisdiction, subdivision, currency, language and tax-year basis are separate properties of each profile and record.

## Presenter Studio

Open with `--studio`, the fragment `studio=1`, the keyboard shortcut **Ctrl+Shift+S**, or the discreet "Presenter" link in the footer. Studio changes presentation only (region/scenario/language selection, preset, modules, branding, density, animation, narration, integration endpoints). Required record fields and disclosures are shown locked with the reason. Configuration can be exported/imported as validated JSON and shared as a link that carries settings only — never personal data or credentials. Employee packages built with `--employee` do not contain Studio or any other recipient's record.

## Integration endpoints

Studio accepts HTTPS endpoints for the assistant (Lumi), payroll query, identity, verification and wallet issuing services. Only endpoints are stored. Without an endpoint each capability shows its truthful local/unavailable state.

Bearer tokens come from the identity adapter at runtime. Its endpoint is a backend token service behind the organisation's approved sign-in: the browser sends a credentialed `GET <endpoint>?document=<id>&version=<n>` (the sign-in session travels as an HttpOnly cookie) and receives `{ "access_token": "…", "expires_in": 300 }`. The token is kept in memory for this document only and refreshed before it expires. No signing key, certificate, client secret or token is ever embedded in the HTML, placed in a URL, or written to browser storage.

| Service | Request from the browser | Required response |
|---|---|---|
| Assistant | `POST` `{ question, documentRef, lineIds, sectionId, locale }` with `Authorization: Bearer` | `{ answer, sources: [{ type, id }], suggestions? }` |
| Payroll queries | `POST` the reviewed payload with `Idempotency-Key` | `{ caseReference, acknowledgedAt, nextStep? }`; `409` with `caseReference` for a duplicate |
| Verification | `POST` `{ documentRef, version, lines, totals }` | `{ verified: true, verifiedAt }` only after a real check with keys held outside the package |
| Wallet (per provider) | `POST` `{ provider, documentRef, version }` | `{ url, state: 'requested' \| 'issued' \| 'added' }`; "added" only on provider confirmation |

Without a wallet endpoint, each provider runs an on-screen add flow (preparing, confirm, added) and Presenter Studio lists it as **Emulated**. To show the plain unavailable state instead, add `"wallet": { "emulate": false }` to the endpoints file.

## Pay-story narration (ElevenLabs)

The story is read aloud by ElevenLabs voices. Clips are generated once, at build time, and embedded in each build for the records it contains, so the API key never reaches a browser or a file.

```bash
ELEVENLABS_API_KEY=… node scripts/narrate.js            # all records and languages (reuses cached clips)
node scripts/narrate.js --only=EU-DE --lang=de-DE        # one region / language
node scripts/narrate.js --dry-run                        # list what would be generated and the character count
node scripts/narrate.js --prune                          # also delete clips no longer used
npm run build                                            # embeds narration/audio clips into every build
```

- `narration/voices.json` holds the model (`eleven_v4`), the output format (`mp3_22050_32`) and one voice per language: name, library `voiceId`, `languageCode` and `enabled`.
- The script opens the app in headless Chromium and reads each chapter's exact spoken text, so audio always matches the captions. Clips are cached in `narration/audio/<hash>.mp3`; the same text and voice are never generated twice.
- At runtime a clip plays only if its recorded text still matches what the statement says; otherwise that chapter falls back to captions and the device voice.
- Behind an HTTPS proxy the script relaunches Node with `NODE_USE_ENV_PROXY=1` so requests use it.

| Language | Voice | Note |
|---|---|---|
| en-CA, en-GB, en-ZA | Megan | |
| fr-CA | Jeanne Mance | |
| fr-FR | Mélanie | |
| de-DE | Yvonne | Stand-in until the ID for Mrs. Sophie is supplied |
| it-IT | Beatrice | |
| af-ZA | Cheyenne (South African) | Stand-in until the ID for Anneke is supplied |
| zu-ZA, xh-ZA | Cheyenne (South African) | Best effort: not an officially supported ElevenLabs language; listen before showing |

The presenter build carries every clip (about 6.6 MB of audio, roughly 8.5 MB once embedded); an employee package carries only its own record's languages.

## Storage

| What | Where | Notes |
|---|---|---|
| Theme, density, language, section order, pins, privacy/low-data toggles | `localStorage` (`paylight.prefs.v1`) | Non-sensitive presentation preferences only. |
| Studio settings | `localStorage` (`paylight.studio.v1`) | Presenter bundles only. |
| Place in the document, selected lines, tags, notes, draft queries, acknowledgements | `sessionStorage`, scoped to document id + version | Opt-in "Keep on this device" moves them to `localStorage`; a clear-delete action removes them. |
| Lumi conversation | Memory only | Never stored. |
| Payroll amounts, identifiers, bank details | Never stored by the application | |
