# Decisions taken and questions for the product owner

The PRD (v0.1) states its decisions are recommended defaults pending confirmation. This build follows those defaults. Where the PRD left room, the choice made is recorded here with the question it raises. None of these block presenter use; several gate any employee issuance.

## Decisions applied

| Topic | Decision in this build | Confirm? |
|---|---|---|
| Self-contained | One HTML file (`dist/paylight.html`) with no runtime dependency except the UserWay script host and any connected service endpoints configured in Studio. Fonts: system font stack, so no font files are bundled. | Yes — is a bundled brand typeface wanted? |
| Jurisdictions | `CA-ON`, `CA-QC`, `ZA`, `EU-FR`, `EU-DE`, `EU-IT`. Europe is a navigation group only. | — |
| Deployment target | Standalone browser application with adapter seams. No InfoSlips runtime integration was attempted; it needs the actual template/runtime specification. | Which InfoSlips edition/runtime, and when? |
| Sample employees | One sample employee per profile plus a sparse-data second scenario for South Africa (new starter, first partial month, no history). Records name their (fictional) issuer; no demo labels appear on screen or in exports. | Add more scenarios per region? |
| Statutory amounts | Tax and social-contribution amounts are "supplied by payroll" with a basis; no legal rate is encoded or displayed. Employer-policy percentages (pension match, union dues) are disclosed as calculations. | — |
| Pay story | Leads My pay as a full-width invitation and has its own header button. Narrated by ElevenLabs voices per language (see below); visuals and voice start together when the person opens the story; reduced motion steps through chapters and plays a chapter's voice when the person moves to it. A clip plays only if its recorded text matches the statement; otherwise captions and the device voice remain. | Voice IDs still needed for two languages (below). |
| Lumi | Local mode is deterministic document search plus authored explanations, labelled as such. Connected mode requires an HTTPS endpoint and a runtime bearer token from the identity adapter. | Which governed assistant service (Acorn.Insight endpoint contract)? |
| Queries | Drafts are session-scoped; "Keep on this device" is opt-in with a clear-delete action; offline/unconnected submissions say "Saved on this device. Not sent to payroll." | Payroll query service endpoint and acknowledgement contract (case reference format, SLA wording)? |
| Wallets | Until a provider service is connected, Apple, Google and Samsung buttons run an on-screen add flow (preparing, confirm, added). Presenter Studio labels them "Emulated"; `integrations.wallet.emulate: false` restores the unavailable state. Pass content is brand + neutral label + opaque reference only. | Provider approvals are being handled by the product owner. |
| Access | Optional presentation-only access screen in Studio, clearly labelled as not authentication. | Approved identity provider for employee use? |
| Integrity | "Not verified" unless a verification service returns a real result. No local hash is shown as proof. | Signing/verification design and key custody? |
| Analytics | None. No third-party tracking of any kind. | Confirm no analytics for the presenter phase. |
| Studio launcher | `--studio`, `#studio=1`, Ctrl+Shift+S, and a discreet "Presenter" footer link, all absent from employee packages. The footer carries nothing else. | Keep the footer link in presenter builds? |
| Storage | Preferences in localStorage; interaction state in sessionStorage scoped to document id + version; chat never stored. | — |
| Export notices | Print, PDF and Excel carry "Convenience copy. The issued record is the authoritative version." Demo wording was removed at the product owner's request. | — |
| Print paper | Letter for Canada, A4 elsewhere (from the profile). | — |

## Answers received from the product owner (9 October 2026)

| Question | Answer | What changed |
|---|---|---|
| Legal review owners | Not needed for this phase; remove demo references. | Demo banner, footer provenance, "not proof of earnings" chip and constructed notices removed from screen, exports and data. |
| Lawful basis; delivery and protection design | Not applicable for now. | — |
| UserWay | Tested; it works. | Readiness register marks the widget as verified. |
| Translation review | The product owner will check and report back. | — |
| Narration | Use ElevenLabs, female voices: Megan for English; Jeanne Mance for Québec French; Mélanie for French; Mrs. Sophie for German; Beatrice for Italian; Anneke for Afrikaans; best available for isiZulu and isiXhosa. | Narration prepared and embedded (see `CONFIGURATION.md`). |
| Wallet approvals | The product owner will arrange them; emulate the flow meanwhile. | On-screen add flow for all three providers. |
| Performance budget | Not applicable for now. | — |
| Brand | Fine for now. | — |
| PDF character coverage | Not required. | The PDF keeps the standard font and its refusal message for unsupported characters. |

## Still open

1. **Two narration voice IDs.** The API key available to the build cannot search the voice library, and the IDs for **Mrs. Sophie** (German) and **Anneke** (Afrikaans) could not be confirmed. Stand-ins are in use: Yvonne (German female) and Cheyenne (South African female). Supplying the two voice IDs, or a key with `voices_read`, is a one-line change in `narration/voices.json` followed by `node scripts/narrate.js`.
2. **isiZulu and isiXhosa narration.** ElevenLabs does not officially support either language. The clips were generated with Cheyenne without a language code and should be listened to before they are shown; set `"enabled": false` for a language to fall back to captions.
3. **Record corrections.** When payroll corrects a statement after issue, the fix is a new version of the record that replaces the earlier one (for example "Version 2 replaces version 1, issued 30 September"). The app already models this: Record & actions shows the version lineage and the older version stays available. No bundled sample shows it yet. Should one record include a corrected version 2, so the flow can be demonstrated?
