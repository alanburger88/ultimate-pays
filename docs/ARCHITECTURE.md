# Paylight architecture and module conventions

Paylight is a dependency-free vanilla ES-module application. In development the
modules are served as-is (`npm run present`). For delivery, `scripts/bundle.js`
concatenates them into **one HTML file** with styles, data and language packs inlined.

```
bin/paylight.js            CLI: present | build | list   (validates flags against the data registry)
scripts/                   bundle.js (single-file bundler), build-single.js, gen-data-index.js, validate.js, lint-modules.js, serve.js
src/index.html             dev shell; the build inlines <link rel=stylesheet> and bundles app/main.js
src/app/                   runtime core (no DOM except dom.js and main.js)
  dom.js      h(), icon(), announce(), trapFocus(), focusables(), debounce(), uid()
  store.js    createStore(): get / set(patch|fn) / update(key, fn) / subscribe(fn, keys)
  i18n.js     t(key, params), setLanguage(), registerStrings(), coverage(), LANGUAGE_NAMES
  content.js  createContent(): governed record content accessor (labels, glossary, explanations, policies…)
  money.js    formatMoney/Amount/Hours/Date/Period…, hoursTimesRate(), baseTimesRate(), roundHalfUp()
  calc.js     computeTotals, verifyRecord, explainLine, varianceBridge, comparisonTable, timeSummary, rewardSummary, grossToNetFlow
  config.js   readLaunch(), resolveConfig() (precedence), validatePresentation() (whitelist), encodeShared()
  presets.js  core | complete | hourly | total-reward
  persist.js  prefs (localStorage, non-sensitive) · session state (sessionStorage, document-scoped) · opt-in retained drafts
  router.js   fragment ↔ navigation (section, line, view) and config keys
  main.js     boot(): resolve config → build document → ctx → render shell → mount section
src/ui/
  shell.js            masthead, nav (tabs / mobile sheet), footer, Lumi launcher, banners
  components/overlay.js  openDialog / openDrawer / openSheet / confirmDialog / openPopover / toast
  components/common.js   amount(), delta(), termButton(), lineTitle(), notice(), kpi(), chartWithTable(), dataTable(), isNarrow()
  sections/<id>.js    one module per statement section: export function render(ctx) -> HTMLElement
  lumi.js, story.js, tray.js, query.js, mine.js, studio.js, calc-dialog.js, gate.js
src/export/           index.js (entry points), pdf.js, xlsx.js, print.js, ics.js
src/adapters/         assistant.js, queries.js, wallet/{index,base,apple,google,samsung}.js, identity.js, verification.js
src/data/             manifest.js → (generated) index.js; profiles/<ID>/{profile.js, content.<locale>.js}; records/<ID>/<scenario>.js; lang/<locale>.js
src/styles/           tokens.css (light/dark/density), base.css (frame, masthead, nav), components.css, print.css
```

## Bundler-safe module syntax (enforced by `npm run lint`)

Only: `import { a, b as c } from './x.js'`, `import * as ns from './x.js'`, `import './x.js'`, `export function`, `export async function`, `export const|let|class`, `export { a, b as c }`. No default exports, no re-exports, no dynamic `import()`, no `import.meta`, no bare specifiers, no circular imports. Data modules must not touch the DOM (they are imported by the Node CLI).

## The `ctx` object (passed to every UI module)

```js
ctx.store        // createStore — state: { config, prefs:{presentation}, nav:{section,lineId,view,filters,entryIds,entryDate}, selection:{lineIds,entryIds,tags,notes}, queries:{drafts,submitted,active}, lumi, story, online, retainDrafts, notices }
ctx.doc          // { profile, record, content, locale, registry, computed:{ totals, verify, reward, flow, bridge, time }, fallbackLocale }
ctx.config       // resolved config: profileId, scenarioId, locale, approvedLocales, preset, modules, sectionOrder, startSection, presentation, studio, packageKind, locked
ctx.services     // { assistant, queries, wallets[], identity, verification }
ctx.t(key, params)               // interface strings
ctx.content                      // governed content accessor (= ctx.doc.content): lineLabel(line), linePlain(line), statutory(key), total(id), totalPlain(id), glossary(key), disclosure(key), explanation(key), policy(id), benefit(key), leaveType(key), entryType(key), group(key), category(key), document(key), employerField(key), employeeField(key), paymentMethod(key), adjustment(key)
ctx.fmt          // money(minor,{signDisplay}) amount(minor) hours(hundredths) minutesAsHours(min) days(hundredths) number(n,digits) percent(permyriad) rate(minor,per) date(iso,style) dateTime(iso) period(period)
ctx.locale, ctx.theme(), ctx.privacy(), ctx.lowData(), ctx.reducedMotion(), ctx.modules(), ctx.sections(), ctx.line(id), ctx.selectedLines()
ctx.actions:
  go(sectionId, {lineId, view, push})   focusLine(lineId)   showEntries(entryIds, {date})
  toggleSelect(lineId) select(ids) deselect(ids) clearSelection() toggleSelectEntry(entryId) setTag(lineId, tagId) setNote(lineId, note)
  openLumi({question, contextLineIds}) lumiClosed() openStory({chapter: 'greeting'|'money'|'changes'|'benefits'|'next' | index}) openQuery({lineIds, entryIds, draftId}) openCalc(lineId) openTerm(key, anchorEl) openMine() openStudio()
  toast(msg,{kind,action}) setPrefs(partial) resetPrefs() setTheme() cycleTheme() setDensity() setLocale(locale) setRetainDrafts(bool) clearLocal() saveQueries(queries)
  exportPdf() exportXlsx({selectedOnly}) exportSelected() exportIcs() print() reboot() reconfigure(cfg)
```

## Rendering model

- A section module's `render(ctx)` returns a fresh element. The shell re-renders the active section whenever `nav` or `prefs` change, and also on `selection`/`queries` changes for sections listed in `LISTENERS` (main.js). Keep renders pure and fast; read everything from `ctx`.
- Focus restoration across re-renders: put `data-focus-key="…"` (stable) or an `id` on focusable elements you want restored.
- Lines: every row/card for a pay line carries `data-line-id="<id>"` and the element that should receive focus when navigating to the line carries `data-line-focus`. The shell scrolls to and highlights `nav.lineId` after mount.
- Money is always rendered through `amount(ctx, minor)` / `delta(ctx, minor)` from `components/common.js` (privacy mode, tabular numerals). Never format money by hand and never compute money outside `calc.js` / `money.js`.
- Charts: inline SVG built with `h('svg:…')`, always wrapped in `chartWithTable(ctx, {chart, table, label})` so a table equivalent exists and low-data mode works. Every chart element that represents a line links back to it via `ctx.actions.focusLine(id)`.
- Mobile (`isNarrow()`, ≤720px): financial tables become labelled, selectable cards (`.pl-cards > .pl-line-card`) that keep rate, hours, amount, category and YTD. Nothing may require horizontal scrolling at 320 CSS px. Do not clip; wrap.
- Jargon: wrap defined terms with `termButton(ctx, key)` or add `termIconButton(ctx, key)`; definitions open as popovers (tap/click/keyboard).
- Interface strings: use `ctx.t(key)`. If a module needs a key that is not in `src/data/lang/en-CA.js`, do **not** edit that file; call `registerStrings({ 'ns.key': 'English text' })` from `src/app/i18n.js` at module top level. The consolidation step moves them into the packs for translation.
- Governed content (labels, explanations, policies, glossary, disclosures) comes only from `ctx.content`. Never invent explanation text in UI code.
- Overlays: `openDialog`, `openDrawer` (Lumi), `openSheet` (mobile menus) from `components/overlay.js`. They trap focus, close on Escape, restore focus and lock scroll.
- Truthfulness: anything that depends on a service (`ctx.services.*`) must show its real state. Never show "Submitted", "Verified", "Added" or "answered by AI" without the service's acknowledgement.
- Accessibility: semantic headings per section (one `h1`), tables with `<th scope>`, buttons not divs, visible focus, `aria-pressed`/`aria-selected` where state exists, `announce()` for important state changes, no hover-only affordances, 44px touch targets.
- Styling: use existing classes in `src/styles/components.css`. Add new rules at the end of that file under a comment naming your module. No inline colour values; use tokens.

## Storage boundaries

Only non-sensitive presentation preferences go to localStorage. Selection/tags/notes/drafts are sessionStorage, document-scoped, with opt-in retention and a clear-delete action (`ctx.actions.clearLocal()`). Chat is never stored. No payroll values, identifiers or bank details in any storage.
