# Configuring Paylight

## Command line

The wrapper validates its flags against the bundled data registry before serving or building anything. An unknown profile, an unsupported region/language combination, an unknown preset or scenario is a visible error, never a silent fallback to another country's record.

```bash
npm run present -- --region=CA-QC --lang=fr-CA --preset=complete --studio
npm run present -- --region=ZA --lang=zu-ZA --preset=hourly
npm run build:single -- --region=EU-DE --lang=de-DE
npm run build:single -- --region=EU-DE --lang=de-DE --scenario=lina-hoffmann --employee
npm run build                                  # presenter bundle + one employee package per scenario
node bin/paylight.js list                      # profiles, languages and scenarios
```

| Flag | Meaning |
|---|---|
| `--region=ID` | Profile identifier: `CA-ON`, `CA-QC`, `ZA`, `EU-FR`, `EU-DE`, `EU-IT`. Selects a complete, coherent record/profile, never just a currency symbol. |
| `--lang=TAG` | Interface language approved for that profile (see table below). |
| `--preset=NAME` | `core`, `complete`, `hourly`, `total-reward`. Chooses optional modules, starting section and table/chart emphasis. |
| `--scenario=ID` | Record within the profile (e.g. `nomsa-dlamini`, `sipho-khumalo`). Defaults to the first. |
| `--studio` | Open Presenter Studio on launch (`present` only). |
| `--employee` | Build an employee package: one recipient, no Studio, no other recipients' data. Requires `--region`. |
| `--out=FILE` | Output path for `build`. |
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

Studio accepts HTTPS endpoints for the assistant (Lumi), payroll query, identity, verification and wallet issuing services. Only endpoints are stored. Bearer tokens come from the identity adapter at runtime; no signing key, certificate or credential is ever embedded in the HTML or written to browser storage. Without an endpoint each capability shows its truthful local/unavailable state.

## Storage

| What | Where | Notes |
|---|---|---|
| Theme, density, language, section order, pins, privacy/low-data toggles | `localStorage` (`paylight.prefs.v1`) | Non-sensitive presentation preferences only. |
| Studio settings | `localStorage` (`paylight.studio.v1`) | Presenter bundles only. |
| Place in the document, selected lines, tags, notes, draft queries, acknowledgements | `sessionStorage`, scoped to document id + version | Opt-in "Keep on this device" moves them to `localStorage`; a clear-delete action removes them. |
| Lumi conversation | Memory only | Never stored. |
| Payroll amounts, identifiers, bank details | Never stored by the application | |
