# Paylight
## Product requirements document: the interactive payslip as the document

**Version:** 0.1  
**Date:** 8 October 2026  
**Audience:** AI-assisted product designers and engineers, payroll owners, and implementation reviewers  
**Status:** Working specification. The decisions below use recommended defaults pending confirmation. This is not a legal opinion, an approved InfoSlips commitment, or authorisation to issue employee records.

## 1. Product idea and decisions

**Working brand:** Paylight  
**Employer:** Avenlo Group, with appropriately named local employing entities  
**Assistant:** Lumi, your pay companion  
**Tagline:** Your pay, clearly.

Create a polished, configurable, self-contained single-page application in which the interactive payslip is the primary document. It should feel personal, useful, and trustworthy, rather than like an HR portal, analytics dashboard, or PDF with controls attached.

An employee should immediately understand what they were paid, what changed, and what deserves attention. They can follow any important number to its supporting details, ask a question about selected lines, and retain the complete record.

The working names are creative proposals, not trademark-cleared names.

### Decisions for the product owner

| Decision | Recommended default |
|---|---|
| What does self-contained mean? | A portable, single-HTML core that works without an application server for reading and exploration. The requested UserWay script and genuine connected actions are declared network exceptions. |
| Which legal jurisdictions are initially represented? | South Africa; Ontario and Quebec in Canada; France, Germany, and Italy within the Europe group. Europe is a navigation group, not a single legal ruleset. |
| Where must this run? | A standalone browser application with integration seams. Running inside an InfoSlips template/runtime is a separate deployment target requiring its actual supported specifications. |

The intended first use is presenter-led exploration using constructed payroll records. Production issuance has separate gates. Do not silently substitute the first for the second.

## 2. Experience principles and record boundary

**The document is the experience.** Open directly into one recipient's pay statement. Do not add a portal homepage, employee directory, general HR navigation, or an account-wide dashboard. Secure access can precede the document without becoming a portal.

**A stable record, a flexible presentation.** Maintain three distinct layers:

| Layer | Contains | Change policy |
|---|---|---|
| Issued record | Employer and employee particulars, pay period, issued amounts, line items, required disclosures, approved language variants, and issue/version metadata | Never edited through presentation controls, chat, tags, or administrative presentation settings. Corrections require a new linked issue. |
| Experience | Tabs, charts, explanations, video-style animation, density, theme, layout preferences, and selected language | May change how the record is explored, without changing its meaning or values. |
| Interaction state | Personal tags, selected lines, query drafts, service responses, and preferences | Stored separately, scoped to the recipient/document, and governed by its own privacy and retention rules. |

This follows the record-versus-experience distinction in the InfoSlips knowledge base. Its capabilities are source-described and implementation-dependent, not independently verified by this PRD. [K1]

**Progressive disclosure without concealment.** Offer a useful summary first and allow exploration in several directions. Required information must remain readily accessible in the complete record and must survive every configuration and export.

**Numbers before decoration.** Every visual, explanation, and narrative must reconcile to the same underlying record. Animation, colour, and AI are supporting mechanisms, not alternative sources of truth.

## 3. Application and packaging

Supply a maintainable source project and a single-file HTML presentation build. Bundle the core JavaScript, styles, graphics, necessary fonts, approved language content, payroll records, and local explanation content. Do not depend on third-party content-delivery networks for the core experience.

The portable core must support navigation, tables/cards, drill-through, calculations, language switching, theme, local personalisation, the animated pay story, print, PDF creation, and Excel export. UserWay is loaded from the exact host supplied by the user.

Use clearly separated adapters for governed generative assistance, payroll query submission, wallet issuance, identity, and record verification. These services may require an authenticated network connection. Signing keys and service credentials must never be embedded in the HTML.

Offline behaviour is functional, not a loading screen: preserve the complete record, show available local explanations, and let employees prepare queries. Do not claim that a query was submitted, an AI model answered, a wallet pass was issued, or a signature was verified when the corresponding service did not complete that action.

An offline HTML file is not, by itself, a secure distribution, access-control, revocation, or immutable archive system. Real employee distribution needs an approved delivery and protection design. A local access screen does not establish authentication.

## 4. Regional configuration and language

### Initial profiles

| Profile identifier | Jurisdiction | Currency | Available interface languages |
|---|---|---|---|
| `CA-ON` | Ontario, Canada | CAD | English (`en-CA`); Canadian French (`fr-CA`) |
| `CA-QC` | Quebec, Canada | CAD | English (`en-CA`); Canadian French (`fr-CA`) |
| `ZA` | South Africa | ZAR | English (`en-ZA`); Afrikaans (`af-ZA`); isiZulu (`zu-ZA`); isiXhosa (`xh-ZA`) |
| `EU-FR` | France | EUR | English (`en-GB`); Italian (`it-IT`); French (`fr-FR`); German (`de-DE`) |
| `EU-DE` | Germany | EUR | The same four European interface languages |
| `EU-IT` | Italy | EUR | The same four European interface languages |

These are application profile identifiers. The Europe prefixes are not assertions of a common legal jurisdiction. English interface selection does not select UK payroll law.

Each profile supplies regional labels, currency formatting, date/number conventions, pay-period conventions, approved terms, calendar settings, and the appropriate record structure. Model statutory names in their required language separately from the employee's explanatory interface language.

A region switch in presenter mode selects a complete, coherent record/profile. It must not merely replace a currency symbol or convert one country's pay amounts into another currency. Employee-issued records cannot change jurisdiction through a URL parameter.

Keep country, employment/payroll jurisdiction, any relevant subdivision, currency, language, and tax-year basis as separate data properties. Do not infer legal or tax jurisdiction from browser language, current location, or nationality.

### Configuration entry points

Provide an actual command-line wrapper, not instructions that assume a browser can read process arguments. For example:

```bash
npm run present -- --region=CA-QC --lang=fr-CA --preset=complete --studio
npm run present -- --region=ZA --lang=zu-ZA --preset=hourly
npm run build:single -- --region=EU-DE --lang=de-DE
```

Also support a documented URL parameter equivalent and a local-file fragment equivalent, such as:

```text
paylight.html#region=ZA&lang=xh-ZA&preset=complete
```

The wrapper must parse and validate its flags and pass them to the application. Use an explicit precedence: launch configuration overrides saved presentation preferences, which override bundled defaults. Issued-record constraints override all three.

Unsupported profiles or language combinations produce a clear configuration error or an explicitly disclosed language fallback. Never silently fall back to another country's legal record.

### Governed language content

Bundle all specified interface translations, glossary entries, query labels, chart labels, captions, transcripts, error states, and export headings. Maintain original statutory terminology where required and provide plain-language explanations beside it.

Translations of authoritative content must be prepared and reviewed before issuance. Lumi must not translate or rewrite the issued record on demand. In InfoSlips terminology, Acorn.Lingo concerns governed preparation; Acorn.Insight concerns in-document assistance. Lumi is a proposed experience name, not an additional Acorn capability. [K1]

Test every supplied language, including longer strings and correct names/diacritics. Widget-interface and narration-voice language availability must be checked separately; application translation does not prove either is supported.

## 5. Information architecture and responsive design

Interpret the request as **both tabbed and tabular**: clear document sections, with financial tables on larger screens and equivalent labelled cards on small screens.

A persistent, compact masthead identifies the employer, recipient, period, payment date, currency, and record reference. Keep net pay prominent and distinguish any separate payment adjustments.

| Section | Core purpose | Suggested expression |
|---|---|---|
| My pay | Understand the current period at a glance | Net pay, gross pay, deductions, payment information, and entry to the personal pay story |
| Pay details | Inspect all earnings and deductions | Searchable tables, selectable rows, itemised employer contributions, and calculation disclosures |
| What changed | Understand movements since a supplied prior period | Reconciled variance bridge, comparison table, and links to affected lines |
| Time & leave | Connect pay to recorded activity | Shift/leave calendar, regular and premium hours, balances, and accrual explanations |
| Total reward | Understand value beyond take-home pay | Employer-funded benefits, contribution breakdown, and appropriately defined reward totals |
| Record & actions | Retain the complete statement and act on it | Full issued record, disclosures, document provenance, print/download, queries, and wallet options |

Optional modules may disappear cleanly. The complete issued record and required particulars may not.

A signature journey should work across sections: select net pay → inspect its reconciliation → open an overtime line → view the relevant shifts → select the disputed entries → lodge a contextual query. Restore the employee's place, selected lines, and filter state when they return.

Use infographics only where they clarify: a gross-to-net flow, a net-pay change bridge, a reward composition graphic, and a calendar are sufficient starting points. Every chart needs a textual or tabular equivalent and meaningful links to underlying data.

### Mobile

Replace desktop tabs with a clearly labelled section selector opening a vertical menu or bottom sheet. Do not use horizontally scrolling tabs, carousels, wide tables, or swipe-only navigation.

Transform financial rows into labelled, selectable cards without losing rate, hours, amount, category, or year-to-date context. Use drill-in detail where density demands it. Vertical scrolling within a section is expected.

No page, table, menu, chart, or modal may require horizontal scrolling at 320 CSS pixels. Do not achieve this by clipping content. Large text, long translations, and the software keyboard must remain usable.

### Theme and visual language

Offer light, dark, and system-following appearance. Persist non-sensitive preferences. Use restrained motion, legible typography, generous touch targets, and consistent number alignment. The AI designer may choose the palette, typography, illustration style, and transitions.

Reserve safe space for the bottom-left UserWay launcher and bottom-right Lumi launcher. Neither may cover essential content or conflict with device safe areas, menus, or query controls.

## 6. Core interactions

### 6.1 Lumi: contextual assistance

Launch Lumi from the floating bottom-right button. It slides in from the right on desktop and uses an appropriately sized or full-screen panel on mobile.

Offer useful starting questions, such as “Why is my pay different?”, “Explain this deduction”, and “Show me the overtime behind this amount.” Selected lines become explicit context only with the employee's awareness.

Connected answers must use only this recipient's permitted record, supplied comparison periods, approved explanations, and authorised employer policy. Show the record lines or policy references supporting an answer and provide a “Show me” link to the relevant section.

All arithmetic comes from deterministic application functions, not generated guesses. Lumi cannot change pay, approve a payroll correction, provide a tax ruling, access another employee's information, or submit a query without confirmation.

When no model service is connected, provide local document search and authored explanations with truthful capability wording. Do not present canned answers as live generative AI. Preserve the connected-assistant integration as a required capability and test it when a service is supplied.

Handle unsupported questions honestly and offer a contextual payroll query. Treat user text and retrieved policy content as data, not privileged instructions.

### 6.2 The personal pay story

Create a short, personalised animation that feels like a video rather than a slideshow of unrelated charts. Suggested chapters: greeting and period, money paid, significant changes, benefits, and useful next action.

Build scenes from the same record and comparison data used elsewhere. Provide play/pause, replay, seek, progress, captions, transcript, and audio controls when narration exists. A chapter can pause and take the employee to its source figures.

Do not autoplay audio. Support reduced motion and a static transcript. The core animation must work locally; narration can use bundled, reviewed audio. Do not assume every browser has an offline voice for every requested language. Missing audio must not remove any information.

The story is an explanation, not a substitute for the full statement. Avoid celebrations or value judgements about overtime, deductions, debt, or lower tax.

### 6.3 Tagging and contextual queries

Allow one or multiple pay lines to be selected and tagged, including selections across earnings and deductions. Offer sensible tags such as “Please explain”, “Hours question”, and “Expected a different amount”, plus optional private notes.

A compact selection tray shows the number of selected items and allows review, removal, or query creation. Preserve stable line identifiers through sorting, filtering, and mobile transformations.

Before submission, show the query text, selected lines, document reference, and exactly what will be sent. Tags and notes never change the issued record.

Connected submission requires a service acknowledgement before showing “Submitted” and a returned case reference. Prevent duplicate submissions and preserve the draft after failure. With no connection, say “Saved on this device. Not sent to payroll.” Do not invent a case reference or promised response time.

### 6.4 Jargon and calculation disclosure

Explain terms in place through tap-, click-, and keyboard-accessible controls, not hover alone. Keep definitions short, locally appropriate, and linked to deeper context when useful.

For explainable amounts, show the inputs, formula, applicable rate/base, rounding, and source period. Examples include hours × rate, supplied overtime premiums, an employer contribution, a leave balance movement, and a variance between periods.

Do not reverse-engineer an authoritative tax formula from its final amount. Where the source does not supply a calculation trace, say that payroll supplied the amount and offer an appropriate query path.

### 6.5 Employee personalisation

Provide “Make it mine”: reorder permitted sections, choose a starting section, pin useful summaries, change density, choose table/chart emphasis, and set theme or language.

Provide move-up/down controls as an alternative to drag-and-drop. Allow preview, save, and reset. Preferences must not remove required disclosures, change amounts, rewrite statutory terms, or change the complete-record export.

### 6.6 Presenter Studio

Provide a separate administrative configuration screen accessible through the command-line option and a discreet documented launcher or shortcut. It must not appear in ordinary employee navigation.

Studio controls region, supported language, persona/scenario, optional modules, starting section, branding, density, animation/narration, and available integration paths. Offer meaningful presets such as Core, Complete, Hourly, and Total reward.

Allow declarative configuration import/export and reset. Validate imported settings; do not execute imported code. Shareable preset links contain configuration only, never personal data or credentials.

Lock required record fields and disclosures. Show why a setting cannot be disabled. Switching scenarios clears recipient-specific selections, drafts, chat, and sensitive caches.

A hidden button is not authorisation. Remove Studio and multi-person data from employee production packages; any remotely available administration requires actual role-based access.

## 7. UserWay and native usability

Use UserWay as the **only accessibility widget or toolbar**. Do not create a competing accessibility menu. Integrate the supplied script with valid JavaScript quotation marks and the documented bottom-left position:

```html
<script>
(function (d) {
  var s = d.createElement("script");
  s.setAttribute("data-account", "B3W9A2mgGs");
  s.setAttribute("data-position", "5");
  s.setAttribute("src", "https://accessibilityserver.org/widget.js");
  s.async = true;
  (d.body || d.head).appendChild(s);
})(document);
</script>
<noscript>
  Please ensure JavaScript is enabled for purposes of
  <a href="https://accessibilityserver.org">website accessibility</a>.
</noscript>
```

Load it once. Verify bottom-left positioning on desktop and mobile, including dashboard overrides and safe-area spacing. UserWay documents position `5` as bottom left. The supplied account's entitlement, domain configuration, and custom script host have not been validated here. [S1]

The widget-only restriction applies to the add-on, not to the quality of the underlying application. Build semantic headings and tables, labelled controls, keyboard navigation, focus management, meaningful reading order, accessible errors, chart alternatives, captions, and sufficient contrast into the application. Target WCAG 2.2 AA and test rather than claiming conformance from the widget's presence. [K1, S2]

Respect reduced-motion preferences automatically. A failed or blocked widget must not prevent reading, navigation, print, export, or local explanations.

The script is third-party code executing in a page containing payroll information. Review its data access, network behaviour, permitted domains, and contractual/privacy position before real employee use. Do not describe it as isolated from the document merely because it is called a widget.

## 8. Retention outputs and wallet integration

| Output | Required behaviour |
|---|---|
| Print | A clean, complete, pagination-aware record with repeated table headings and all required information. No floating buttons, chat, animation, or cropped content. Support appropriate A4/Letter layouts. |
| PDF | A genuine downloadable, searchable, text-based PDF from the same governed data. Preserve required content, selected approved language, document identity, and version lineage. Do not substitute a screenshot or an image-only PDF. Validate accessibility independently. |
| Excel | A genuine `.xlsx` workbook with useful sheets for earnings, deductions, employer contributions, relevant time/leave, and document metadata. Preserve numeric/date types, currency, signs, and identifiers. Treat notes and other untrusted strings as text, not executable spreadsheet formulas. |
| Selected-data export | An explicitly named extract with its scope and row count. Do not let an active filter silently remove lines from the full record export. |
| Wallet | A privacy-minimised companion pass linking to an authenticated view of the document, not the full SPA and not a substitute for the legally required payslip. |

Keep optional commentary, private notes, and query history out of retained outputs unless explicitly selected. Export warnings must distinguish a convenience copy or selected extract from an authoritative issued version.

### Wallet provider requirements

Implement distinct Apple, Google, and Samsung adapters, with availability determined by approved use case, device, country, issuer configuration, and provider response.

Apple passes require the appropriate identifiers and signing certificate; Google requires explicit permission for sensitive-data pass use; Samsung integration requires partner onboarding and credentials. Therefore three working provider buttons cannot honestly be guaranteed by a standalone HTML file alone. [S3, S4, S5]

Default pass content should be minimal: brand and a neutral document label/reference. Do not include salary, bank details, tax identifiers, or sensitive deductions in previews, barcodes, notifications, or pass metadata by default. Any richer content needs a separately approved purpose and provider assessment.

Links must not contain a reusable payroll-access credential. Opening the linked document requires authorisation independent of possessing the pass.

Offer a pass preview and explain connection requirements when issuance is unavailable. Say an add request was opened or issued when that is all the evidence supports; claim “Added” only where confirmation is actually available.

## 9. Data contract and constructed records

Use a normalised model with explicit regional extensions rather than country-specific hard-coded screens.

| Data area | Minimum content |
|---|---|
| Document | ID, version, issue timestamp, period, pay date, currency, jurisdiction/profile version, content/language versions, and supersession references |
| Parties | Required employer/employee particulars; display-safe identifiers; legal entity and occupation/classification where applicable |
| Financial lines | Stable IDs, category, description key, amount/sign, cash/non-cash role, relevant bases/rates/hours, year-to-date values, and source/calculation references |
| Context | Relevant prior records, shift/time entries, leave movements, benefits, and approved explanatory policy |
| Governance | Field requirements, applicability conditions, approval state, provenance, and integrity-verification status |
| Separate state | Preferences, tags, selections, draft queries, service acknowledgements, and assistant context |

Use integer minor units or an appropriate decimal representation for money. Apply rounding deliberately. Separate gross remuneration, taxable bases, employee deductions, employer contributions, reimbursements, non-cash benefits, advances, net earnings, and the actual amount payable. Do not assume every regional record can be reconciled with one oversimplified gross-minus-deductions formula.

Year-to-date totals must identify their basis and reconcile to the included/source history. Do not assume every country's tax year begins in January. Currency and date formatting must not change stored values.

### Starting personas and scenarios

| Profile | Employee | Useful scenario |
|---|---|---|
| CA-ON | Maya Bennett | Regular pay plus an adjustment and an employer retirement contribution |
| CA-QC | Étienne Roy | Hourly earnings, overtime, separately represented vacation-related pay, and local deduction terminology |
| ZA | Nomsa Dlamini | Overtime, retirement and medical contributions, and a leave movement |
| EU-DE | Lina Hoffmann | Distinct tax/social deductions and an identified non-cash benefit |
| EU-FR | Camille Laurent | Distinct net concepts, withholding, and employer-funded benefits |
| EU-IT | Sofia Ricci | Contract-related classification, accrual explanations, and pay adjustments |

The builder should create plausible, internally reconciled amounts and supporting detail for each persona, including at least three comparable periods where a comparison is shown. Include regular, variable-hours, adjustment, and sparse-data conditions. Never invent a legal tax rate merely to make the display look complete.

Use only constructed identities and non-operational contact/bank details. Avoid real tax identifiers, customer data, logos, or working financial accounts.

Keep staging jargon out of the employee interface. Presenter documentation and Studio must state that the records are constructed for presentation and are not employer-issued. Downloaded presentation records must retain a discreet “Not proof of earnings” notice so they cannot be confused with actual employment evidence.

Non-live actions must always describe their true outcome. These provenance and action-state controls cannot be removed to imply genuine issuance, payment, submission, or verification.

## 10. Jurisdiction, privacy, and integrity gates

A legal-ready structure is not a legal-compliance certification. For each actual deployment, obtain payroll and qualified local review of the completed record, delivery process, language, privacy, and retention arrangements.

Each jurisdiction pack must identify its effective dates, sources, required/conditional/prohibited fields, required terminology and presentation order, delivery/access conditions, retention rules, and review owner. Missing or incompatible mandatory data blocks production issuance. Optional feature switches cannot bypass that check.

Use the attached payroll paper as a feature and modelling input, not an executable legal rulebook. Its portal framing is expressly not adopted. Its tax rates, broad consent statements, retention periods, and country generalisations must not be copied without current verification. [U1]

Ontario and Quebec need distinct statement handling; France specifies required content and presentation; Germany has its own remuneration statement provisions. These primary sources support separate packs, not a claim that this initial review covers all relevant law. Italy and South Africa also require complete current local review before issuance. [S6, S7, S8, S9]

Do not assume consent is the universal basis for processing payroll information. Define the actual lawful basis and purpose for each processing activity, including optional AI, analytics, and wallet services. GDPR itself provides multiple lawful bases. [S10]

For employee use, require approved authentication/authorisation, protected transmission and storage, retention and retrieval, version-linked issuance evidence, correction/supersession handling, and a documented archive strategy. Immutable browser objects or a hash stored beside editable data do not establish tamper evidence.

Where integrity verification exists, use a trusted verification design with keys controlled outside the recipient's editable package. Show “Verified” only after a real successful check. Preserve older issues when a correction is made.

Do not store payroll content, bank/tax identifiers, or chat transcripts in ordinary browser preference storage. Keep only non-sensitive preferences there. Protect any explicitly retained local query state and provide a clear-delete action.

Default to no third-party behavioural tracking. Any analytics must have an approved purpose, minimal fields, appropriate retention, and no raw payroll or chat content. Opening a document is not proof of understanding, receipt of wages, or agreement with its contents.

## 11. Useful additions, without portal expansion

Add a reconciled “What changed?” view; a one-action return from a chart to its source row; a low-data presentation with all record content intact; a presentation privacy control for screen sharing; and a read-only pay/shift calendar.

Any calendar export should use a neutral event title and omit salary or identifiers unless explicitly requested. Future pay dates or balances must be distinguished from issued historical facts.

Keep total reward definitions transparent. Employer contributions are not employee deductions, and annualised figures must not ignore extra pay periods or benefit-specific rules.

Do not include lending, earned-wage-access transactions, benefit enrolment, bank-detail changes, or financial advice in the initial scope. These are separately governed integrations, not consequences of displaying a payslip. Optional planning tools may be considered later only with supplied calculation rules and unmistakable separation from issued values.

## 12. Acceptance outcomes

The builder may choose its internal implementation and visual approach, but must demonstrate the following:

| Area | Acceptance outcome |
|---|---|
| Configuration | Documented command-line and URL/fragment options select coherent profiles and languages. Invalid combinations are handled visibly. |
| Financial integrity | Totals, calculation disclosures, comparison bridges, charts, animation, PDF, and Excel reconcile exactly. Personalisation cannot change the record. |
| Regional content | Every initial profile has its own coherent structure and provenance. Required content cannot be disabled. No claim of production approval appears without evidence. |
| Languages | All requested language variants work end to end, including disclosures, errors, captions, and export headings. Original statutory terms are preserved where required. |
| Navigation and mobile | Both desktop tables/tabs and mobile cards/vertical navigation work. No horizontal scrolling or clipped financial details at 320 CSS pixels or during large-text testing. |
| Progressive disclosure | A user can move from net pay to a line, its calculation/supporting activity, a query, and back without losing context. |
| Assistance | Lumi uses permitted source context, links to evidence, does not invent values, and handles missing information and unavailable services truthfully. |
| Media | Play/pause, seeking, replay, transcript, language changes, and reduced-motion behaviour work. Story values match the record. |
| Query workflow | Multi-selection survives filtering; the employee reviews the payload; offline, failure, retry, and confirmed-submission states are distinct. |
| Accessibility | UserWay launches bottom left; Lumi bottom right. Native keyboard/focus and screen-reader paths remain usable with the widget blocked. Conformance is tested, not assumed. |
| Exports | Complete, legible print and text-based PDF; valid typed `.xlsx`; required disclosures and provenance retained; no silent filtering. |
| Wallets | Provider-specific adapters and truthful availability states exist. Credentials stay outside the browser. Real provider acceptance is tested before a live claim. |
| Administration | Studio configures the presentation without bypassing required fields. Employee packages cannot expose Studio or other recipients. |
| Privacy/security | No secrets or cross-recipient data leakage. Third-party behaviour is reviewed, and production integrity/access claims have corresponding evidence. |

Additionally, evaluate whether representative employees can locate take-home pay, explain a significant movement, and prepare a query without coaching. These are evaluation goals, not asserted business results.

Measure payload and rendering performance on an agreed mid-range mobile/network profile. Prioritise record access before optional media and connected enhancements. Report measurements rather than asserting a performance guarantee.

## 13. AI-builder direction and delivery

Deliver the source project, portable HTML build, documented configuration commands, profile/language resources, test instructions, and a short integration/readiness register. Specify which capabilities are local, connected, unavailable, or awaiting approval.

Do not leave prominent controls as unexplained decorative placeholders. Make local interactions functional; for external operations provide a real adapter contract, explicit unavailable state, and testable completion criteria.

Prioritise record fidelity and regional structure first, exploration second, and expressive polish third. All requested features remain represented; dependence on external services must be explicit rather than silently omitted.

**Creative freedom:** choose the visual system, distinctive transitions, narrative treatment, chart forms, component composition, and elegant empty states. Prefer a few memorable, useful interactions over many disconnected feature panels. Do not add features that compromise record integrity, privacy, accessibility, regional correctness, or the document-first scope.

## 14. Source and evidence notes

Requirements in this PRD are proposed design requirements unless expressly attributed below. The supplied material is distinguished from independently consulted primary documentation.

**[K1] InfoSlips Comprehensive Knowledge Base.md, version 1.1.** Relevant sections: Product identity; Document architecture; Capability reference; Acorn intelligence; Accessibility and digital inclusion extensions; Advanced experience patterns; Source register and evidence status; Claim controls and source reconciliation. The compilation's underlying sources were not independently reviewed here. Exact capabilities depend on edition, configuration, integration, deployment, and approval.

**[K2] InfoSlips Case Study Supplement.md.** CS-25, “Vodacom | Group payroll & total reward”, and CS-35, “PepsiCo | Payroll & employee communication”, provide source-reported implementation inspiration for multi-country reward communication and drillable deductions. They do not establish every proposed feature as native or supply a basis for projected cost/turnover improvements. No case metric is used as a product target.

**[U1] Pasted text.txt, “The Architecture of the Modern Digital Payslip: Global Compliance, Structural Taxonomy, and Next-Generation Capabilities”.** Used for its pay-structure, total-reward, time/leave, explanation, and personalised-media ideas. Its legal and privacy assertions are not treated as validated production rules.

Primary documentation consulted on 8 October 2026:

- **[S1] UserWay, “Customizing Widget Position in the Advanced Code” and “UserWay Widget Advanced Script Attributes Guide”.** `https://help.userway.org/en/articles/9540762-customizing-widget-position-in-the-advanced-code` and `https://help.userway.org/en/articles/15073139-userway-widget-advanced-script-attributes-guide`
- **[S2] W3C, WCAG 2.2 and “Evaluating Web Accessibility Overview”.** `https://www.w3.org/TR/WCAG22/` and `https://www.w3.org/WAI/test-evaluate/`
- **[S3] Apple Developer, “Getting Started with Apple Wallet”.** `https://developer.apple.com/wallet/get-started/`
- **[S4] Google for Developers, “Generic Private Pass: Overview”.** `https://developers.google.com/wallet/generic-private-pass`
- **[S5] Samsung Developer, “Introduction” to Wallet Cards integration.** `https://developer.samsung.com/wallet/welcome/introduction.html`
- **[S6] Ontario, Employment Standards Act Policy and Interpretation Manual, section 12 and associated vacation-statement discussion.** `https://www.ontario.ca/document/print/book/104586` Official guidance, not a replacement for the legislation or a complete applicability review.
- **[S7] CNESST, “Pay slip”.** `https://www.cnesst.gouv.qc.ca/en/working-conditions/wage-and-pay/pay/pay-slip`
- **[S8] French Ministry of Labour, “Le bulletin de paie”, updated 2 March 2026.** `https://travail-emploi.gouv.fr/droit-du-travail/la-remuneration/article/le-bulletin-de-paie`
- **[S9] Germany, Gewerbeordnung §108 and Entgeltbescheinigungsverordnung.** `https://www.gesetze-im-internet.de/gewo/__108.html` and `https://www.gesetze-im-internet.de/entgbv/BJNR271200012.html`
- **[S10] EUR-Lex, Regulation (EU) 2016/679, Article 6.** `https://eur-lex.europa.eu/legal-content/EN-PT/ALL/?uri=CELEX%3A32016R0679`

This source review establishes selected design constraints and dependencies. It is not an exhaustive legal, accessibility, security, or wallet-eligibility assessment.
