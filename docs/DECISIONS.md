# Decisions taken and questions for the product owner

The PRD (v0.1) states its decisions are recommended defaults pending confirmation. This build follows those defaults. Where the PRD left room, the choice made is recorded here with the question it raises. None of these block presenter use; several gate any employee issuance.

## Decisions applied

| Topic | Decision in this build | Confirm? |
|---|---|---|
| Self-contained | One HTML file (`dist/paylight.html`) with no runtime dependency except the UserWay script host and any connected service endpoints configured in Studio. Fonts: system font stack, so no font files are bundled. | Yes — is a bundled brand typeface wanted? |
| Jurisdictions | `CA-ON`, `CA-QC`, `ZA`, `EU-FR`, `EU-DE`, `EU-IT`. Europe is a navigation group only. | — |
| Deployment target | Standalone browser application with adapter seams. No InfoSlips runtime integration was attempted; it needs the actual template/runtime specification. | Which InfoSlips edition/runtime, and when? |
| Personas | One constructed persona per profile plus a sparse-data second scenario for South Africa (new starter, first partial month, no history). | Add more scenarios per region? |
| Statutory amounts | Tax and social-contribution amounts are "supplied by payroll" with a basis; no legal rate is encoded or displayed. Employer-policy percentages (pension match, union dues) are disclosed as calculations. | — |
| Pay story | Visuals start automatically on open (never audio); reduced motion gives a stepped, static mode; no narration audio is bundled; optional on-demand read-aloud uses the device voice only when a voice for the language exists and narration is set to "audio when available". | Should reviewed narration audio be commissioned per language? |
| Lumi | Local mode is deterministic document search plus authored explanations, labelled as such. Connected mode requires an HTTPS endpoint and a runtime bearer token from the identity adapter. | Which governed assistant service (Acorn.Insight endpoint contract)? |
| Queries | Drafts are session-scoped; "Keep on this device" is opt-in with a clear-delete action; offline/unconnected submissions say "Saved on this device. Not sent to payroll." | Payroll query service endpoint and acknowledgement contract (case reference format, SLA wording)? |
| Wallets | Three adapters with truthful availability; none can issue from a static file. Pass preview is brand + neutral label + record reference only. | Which providers are in scope first, and who holds issuer credentials/certificates? |
| Access | Optional presentation-only access screen in Studio, clearly labelled as not authentication. | Approved identity provider for employee use? |
| Integrity | "Not verified" unless a verification service returns a real result. No local hash is shown as proof. | Signing/verification design and key custody? |
| Analytics | None. No third-party tracking of any kind. | Confirm no analytics for the presenter phase. |
| Studio launcher | `--studio`, `#studio=1`, Ctrl+Shift+S, and a discreet "Presenter" footer link, all absent from employee packages. | Keep the footer link in presenter builds? |
| Storage | Preferences in localStorage; interaction state in sessionStorage scoped to document id + version; chat never stored. | — |
| Export notices | Every print/PDF/Excel carries "constructed presentation record / not proof of earnings" and "convenience copy". | Wording approval. |
| Print paper | Letter for Canada, A4 elsewhere (from the profile). | — |

## Open questions that need an answer before employee issuance

1. **Legal review owners** for each jurisdiction pack (field lists, terminology order, retention, delivery conditions) — currently "constructed-unreviewed".
2. **Lawful basis and purpose** per processing activity (statement delivery, Lumi, queries, wallets), not consent by default.
3. **Delivery and protection design**: authentication, protected transmission/storage, revocation, supersession, archive strategy.
4. **UserWay**: account entitlement for `B3W9A2mgGs`, allowed domains, custom host `accessibilityserver.org`, and a review of the script's data access in a page containing payroll information. The host was not reachable from the build environment, so the widget's bottom-left placement has only been verified by the documented `data-position="5"` setting and CSS safe zones, not by observing the live widget.
5. **Translation review**: all packs were prepared by the build (not by certified translators) and must be reviewed by native speakers before issuance. Particular care: isiZulu and isiXhosa payroll terminology, Quebec French statutory terms, German EBV terminology, Italian cedolino terms.
6. **Narration voices and audio**: whether to commission reviewed audio per language, and which languages have device voices in the target fleet.
7. **Wallet provider approvals**: Apple pass type ID and certificate, Google Wallet sensitive-data approval, Samsung partner onboarding.
8. **Performance budget**: the agreed mid-range device/network profile for the measurements in `node scripts/measure.js`.
9. **Brand**: Paylight/Lumi/Avenlo are working names and are not trademark-cleared.
10. **Record corrections**: the supersession flow (new linked issue, older versions preserved) is modelled in the data but no correction scenario is bundled — add one?
11. **PDF character coverage**: the PDF uses the standard Helvetica font, which covers Western European text. A record containing other characters (for example Ł, ő or ş in a name) is refused with a message pointing to Print, rather than altered. Embedding a broader licensed font would remove that limit at a cost of roughly 100–300 KiB per build. Which font, if any, should be licensed and embedded?
