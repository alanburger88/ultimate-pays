# Link parameters

Paylight reads its starting state from the part of the address after `#`. Parameters are joined with `&`, for example:

```
paylight.html#region=ZA&scenario=za-overtime&lang=zu-ZA&preset=complete
```

The same parameters work in the presenter file (`paylight.html`), on the local dev server (`npm run present`) and on any web host. Links never carry personal data, and they can never set where data is sent: service endpoints are deployment configuration only (see `CONFIGURATION.md`).

## How to use them

1. Open `paylight.html` in your browser. The address bar shows something like `file:///C:/Users/you/Downloads/paylight-v0.4/paylight.html#section=my-pay`.
2. Click the address bar and replace everything after the `#` with the parameters you want, for example `region=ZA&lang=zu-ZA`.
3. Press Enter. The statement switches straight away; no reload is needed.

The `#` comes once, then each parameter is `name=value`, and parameters are joined with `&`. Order does not matter.

```
paylight.html#region=ZA                                   South Africa, default language (English)
paylight.html#region=ZA&lang=zu-ZA                         South Africa in isiZulu
paylight.html#region=ZA&scenario=za-new-starter            South Africa, the second employee (Sipho Khumalo)
paylight.html#region=EU-DE&lang=en-GB&section=pay-details  Germany in English, opening on Pay details
```

Changing only the region is enough: a language or employee left over from the previous country is dropped, and the new country opens in its default language. A language a country does not offer shows a short message listing the ones it does, with a button to continue.

The same text works after a web address once the file is hosted, for example `https://example.com/paylight.html#region=EU-FR&lang=fr-FR`, and can be saved as a bookmark or sent as a link.

## Parameters

| Parameter | Values | What it does |
|---|---|---|
| `region` | `CA-ON`, `CA-QC`, `ZA`, `EU-FR`, `EU-DE`, `EU-IT` | Jurisdiction profile to open. |
| `scenario` | see the table below | Which employee record in that region. Defaults to the region's first record. |
| `lang` | see the table below | Interface and record language. It must be one the region supports. Otherwise the page names the supported languages and offers to continue in the region's default. |
| `preset` | `core`, `complete`, `hourly`, `total-reward` | Which sections are on. Sections a jurisdiction requires (for example Time & leave in South Africa) stay on whatever the preset says. |
| `section` | `my-pay`, `pay-details`, `what-changed`, `time-leave`, `total-reward`, `record-actions` | Section to open first. |
| `line` | a pay line ID, e.g. `e-base`, `d-cpp` | Opens Pay details with that line in view and focused. |
| `view` | `totals` (Pay details), `calendar` or `list` (Time & leave), `cmp:<periodId>` (What changed) | Opens a specific view inside the section. |
| `theme` | `light`, `dark`, `system` | Appearance. |
| `density` | `comfortable`, `compact` | Spacing. |
| `studio` | `1` | Opens Presenter Studio on load (presenter file only; Ctrl+Shift+S does the same). |
| `config` | a code produced by Studio | A shared preset: appearance, sections, order, pins, narration. Create it in Presenter Studio with **Copy shareable preset link**. |

Precedence: the record's own requirements, then the link, then the employee's saved Make it mine preferences, then defaults.

## Ready-made links

Default language first in each row.

| Region | Record | Languages | Link (default language) |
|---|---|---|---|
| Canada · Ontario | Maya Bennett — Salaried, retroactive adjustment, expense reimbursement, employer RRSP match | `en-CA` English (Canada), `fr-CA` French (Canada) | `#region=CA-ON&scenario=on-salaried` |
| Canada · Québec | Étienne Roy — Hourly with overtime, vacation indemnity, Québec source deductions | `fr-CA` French (Canada), `en-CA` English (Canada) | `#region=CA-QC&scenario=qc-hourly` |
| South Africa | Nomsa Dlamini — Monthly salary with overtime, annual leave, public holiday, retirement and medical aid | `en-ZA` English (South Africa), `af-ZA` Afrikaans, `zu-ZA` isiZulu, `xh-ZA` isiXhosa | `#region=ZA&scenario=za-overtime` |
| South Africa | Sipho Khumalo — New starter's first partial month, no history | `en-ZA` English (South Africa), `af-ZA` Afrikaans, `zu-ZA` isiZulu, `xh-ZA` isiXhosa | `#region=ZA&scenario=za-new-starter` |
| Europe · France | Camille Laurent — Monthly bulletin de paie with the French net concepts and overtime | `fr-FR` French (France), `en-GB` English (UK), `de-DE` German, `it-IT` Italian | `#region=EU-FR&scenario=fr-monthly` |
| Europe · Germany | Lina Hoffmann — Company car benefit taxed and deducted, tax-free travel reimbursement | `de-DE` German, `en-GB` English (UK), `fr-FR` French (France), `it-IT` Italian | `#region=EU-DE&scenario=de-company-car` |
| Europe · Italy | Sofia Ricci — CCNL monthly cedolino with TFR, ferie, ROL | `it-IT` Italian, `en-GB` English (UK), `fr-FR` French (France), `de-DE` German | `#region=EU-IT&scenario=it-ccnl` |

### Every region, record and language

```
paylight.html#region=CA-ON&scenario=on-salaried&lang=en-CA
paylight.html#region=CA-ON&scenario=on-salaried&lang=fr-CA
paylight.html#region=CA-QC&scenario=qc-hourly&lang=fr-CA
paylight.html#region=CA-QC&scenario=qc-hourly&lang=en-CA
paylight.html#region=ZA&scenario=za-overtime&lang=en-ZA
paylight.html#region=ZA&scenario=za-overtime&lang=af-ZA
paylight.html#region=ZA&scenario=za-overtime&lang=zu-ZA
paylight.html#region=ZA&scenario=za-overtime&lang=xh-ZA
paylight.html#region=ZA&scenario=za-new-starter&lang=en-ZA
paylight.html#region=ZA&scenario=za-new-starter&lang=af-ZA
paylight.html#region=ZA&scenario=za-new-starter&lang=zu-ZA
paylight.html#region=ZA&scenario=za-new-starter&lang=xh-ZA
paylight.html#region=EU-FR&scenario=fr-monthly&lang=fr-FR
paylight.html#region=EU-FR&scenario=fr-monthly&lang=en-GB
paylight.html#region=EU-FR&scenario=fr-monthly&lang=de-DE
paylight.html#region=EU-FR&scenario=fr-monthly&lang=it-IT
paylight.html#region=EU-DE&scenario=de-company-car&lang=de-DE
paylight.html#region=EU-DE&scenario=de-company-car&lang=en-GB
paylight.html#region=EU-DE&scenario=de-company-car&lang=fr-FR
paylight.html#region=EU-DE&scenario=de-company-car&lang=it-IT
paylight.html#region=EU-IT&scenario=it-ccnl&lang=it-IT
paylight.html#region=EU-IT&scenario=it-ccnl&lang=en-GB
paylight.html#region=EU-IT&scenario=it-ccnl&lang=fr-FR
paylight.html#region=EU-IT&scenario=it-ccnl&lang=de-DE
```

### Useful combinations

```
paylight.html#region=CA-ON&section=pay-details&line=e-base          Pay details, base salary line in focus
paylight.html#region=CA-ON&section=pay-details&view=totals           Pay details, totals and reconciliation
paylight.html#region=ZA&scenario=za-overtime&section=time-leave&view=calendar   Time & leave calendar
paylight.html#region=EU-DE&lang=en-GB&preset=total-reward            Total reward view in English
paylight.html#region=EU-FR&preset=core&theme=dark                    Core sections, dark appearance
paylight.html#region=EU-IT&lang=it-IT&studio=1                       Open Presenter Studio
```

## Employee packages

`paylight build --all` also writes one file per record, for example `paylight-ZA-za-overtime.html`. Each holds only that person's record and has no Studio. In these files:

- `region` and `scenario` are fixed by the file and ignored if given.
- `lang` works for the record's languages.
- `section`, `line`, `view`, `theme`, `density` work as above.
- A `config` link can change appearance only (theme, density, emphasis, low data, privacy, animation, narration).

| File | Person | Languages |
|---|---|---|
| `paylight-CA-ON-on-salaried.html` | Maya Bennett | en-CA, fr-CA |
| `paylight-CA-QC-qc-hourly.html` | Étienne Roy | fr-CA, en-CA |
| `paylight-ZA-za-overtime.html` | Nomsa Dlamini | en-ZA, af-ZA, zu-ZA, xh-ZA |
| `paylight-ZA-za-new-starter.html` | Sipho Khumalo | en-ZA, af-ZA, zu-ZA, xh-ZA |
| `paylight-EU-FR-fr-monthly.html` | Camille Laurent | fr-FR, en-GB, de-DE, it-IT |
| `paylight-EU-DE-de-company-car.html` | Lina Hoffmann | de-DE, en-GB, fr-FR, it-IT |
| `paylight-EU-IT-it-ccnl.html` | Sofia Ricci | it-IT, en-GB, fr-FR, de-DE |

## Command-line equivalents

The same choices can be baked into a build, so the file opens that way without a fragment:

```
node bin/paylight.js build --region=EU-FR --lang=fr-FR --preset=complete --out=dist/fr.html
node bin/paylight.js present --region=ZA --lang=xh-ZA --studio
```
