/**
 * Profile EU-DE — Germany. Jurisdiction pack for presentation.
 * Constructed for presentation; not reviewed for production issuance.
 * Sources are design references, not an executable legal rulebook.
 *
 * Statement structure follows the German Entgeltabrechnung as described by
 * § 108 Gewerbeordnung (GewO) and the Entgeltbescheinigungsverordnung (EBV):
 * Abrechnungszeitraum, Gesamtbrutto (Barbezüge plus Sachbezüge / geldwerter
 * Vorteil), Steuerbrutto, SV-Brutto, Lohnsteuer, Solidaritätszuschlag,
 * Kirchensteuer, the employee's social-insurance contributions (KV, RV, AV,
 * PV), the Nettoverdienst, then net-level movements (the non-cash benefit is
 * deducted again because it was never paid in cash; tax-free reimbursements
 * are added) and finally the Auszahlungsbetrag. Employer contributions and
 * Umlagen are shown separately for information.
 *
 * Lohnsteuer, Solidaritätszuschlag, Kirchensteuer and every social-insurance
 * contribution are supplied by payroll from the official tables and rates;
 * this application never recomputes or infers a statutory rate. The value of
 * the company-car benefit is likewise supplied by payroll from the statutory
 * valuation method; only its basis (the gross list price) is shown.
 */
export const profile = {
  id: 'EU-DE',
  version: '2026.1',
  country: 'DE',
  countryKey: 'country.de',
  jurisdiction: 'EU-DE',
  subdivision: null,
  group: 'europe',
  currency: 'EUR',
  timeZone: 'Europe/Berlin',
  locales: ['de-DE', 'en-GB', 'fr-FR', 'it-IT'],
  defaultLocale: 'de-DE',
  statutoryLocale: 'de-DE',
  paper: 'a4',
  taxYear: { startMonth: 1, startDay: 1, basisKey: 'ytd.basis.calendar_year' },
  payFrequency: 'monthly',
  entity: {
    legalName: 'Avenlo Deutschland GmbH',
    tradingName: 'Avenlo Group',
    address: { lines: ['Lindenhofstraße 41'], city: 'Berlin', region: 'BE', postalCode: '10435', country: 'DE' },
    registrations: [
      { key: 'betriebsnummer', valueMasked: '•••• 3419' },
      { key: 'steuernummer', valueMasked: '30/•••/•• 412' },
    ],
  },
  primaryTotal: 'net',
  payableTotal: 'payable',
  // German Entgeltabrechnung structure (EBV): Gesamtbrutto (cash pay + non-cash
  // benefit) → Steuern → Sozialversicherung (Arbeitnehmeranteil) → Nettoverdienst
  // → Abzug des geldwerten Vorteils, Nettoabzüge, steuerfreie Erstattungen →
  // Auszahlungsbetrag. Employer contributions are shown for information only.
  totals: [
    { id: 'gross', sum: { categories: ['earning', 'noncash'] }, required: true, prominent: true },
    { id: 'cashGross', sum: { categories: ['earning'], cash: true } },
    { id: 'taxableGross', sum: { categories: ['earning', 'noncash'], taxable: true }, required: true },
    { id: 'socialGross', sum: { categories: ['earning', 'noncash'], notFlags: ['sv_free'] }, required: true },
    { id: 'taxes', sum: { categories: ['deduction'], groups: ['tax'] }, required: true, prominent: true },
    { id: 'socialInsurance', sum: { categories: ['deduction'], groups: ['social'] }, required: true, prominent: true },
    { id: 'employeeDeductions', formula: ['taxes', '+', 'socialInsurance'], required: true },
    { id: 'net', formula: ['gross', '-', 'employeeDeductions'], required: true, prominent: true, net: true },
    { id: 'nonCash', sum: { categories: ['noncash'] }, required: true },
    { id: 'netDeductions', sum: { categories: ['deduction'], excludeGroups: ['tax', 'social'] } },
    { id: 'reimbursements', sum: { categories: ['reimbursement'] } },
    { id: 'payable', formula: ['net', '-', 'nonCash', '-', 'netDeductions', '+', 'reimbursements'], required: true, prominent: true, payable: true },
    { id: 'employerContributions', sum: { categories: ['employer'] } },
  ],
  categoryOrder: ['earning', 'noncash', 'deduction', 'reimbursement', 'employer'],
  reward: { grossTotal: 'cashGross', deductionsTotal: 'employeeDeductions', definitionKey: 'reward.definition.default' },
  statutoryTerms: {
    lohnsteuer: { term: 'Lohnsteuer', locale: 'de-DE' },
    solidaritaetszuschlag: { term: 'Solidaritätszuschlag', locale: 'de-DE' },
    kirchensteuer: { term: 'Kirchensteuer', locale: 'de-DE' },
    kv: { term: 'Krankenversicherung (KV)', locale: 'de-DE' },
    rv: { term: 'Rentenversicherung (RV)', locale: 'de-DE' },
    av: { term: 'Arbeitslosenversicherung (AV)', locale: 'de-DE' },
    pv: { term: 'Pflegeversicherung (PV)', locale: 'de-DE' },
    geldwerter_vorteil: { term: 'Geldwerter Vorteil', locale: 'de-DE' },
    umlage_u2: { term: 'Umlage U2 (Aufwendungsausgleichsgesetz)', locale: 'de-DE' },
  },
  requiredFields: [
    { path: 'employer.legalName', reasonKey: 'req.employer_identity' },
    { path: 'employer.address', reasonKey: 'req.employer_identity' },
    { path: 'employee.displayName', reasonKey: 'req.employee_identity' },
    { path: 'employee.identifiers[tax_id]', reasonKey: 'req.tax_identifiers' },
    { path: 'document.period', reasonKey: 'req.pay_period' },
    { path: 'document.payDate', reasonKey: 'req.pay_date' },
    { path: 'totals.gross', reasonKey: 'req.gross' },
    { path: 'totals.taxableGross', reasonKey: 'req.taxable_base' },
    { path: 'totals.socialGross', reasonKey: 'req.taxable_base' },
    { path: 'lines[deduction.tax]', reasonKey: 'req.deductions_itemised' },
    { path: 'lines[deduction.social]', reasonKey: 'req.social_contributions' },
    { path: 'totals.net', reasonKey: 'req.net' },
    { path: 'totals.payable', reasonKey: 'req.net_concepts' },
    { path: 'lines[noncash]', reasonKey: 'req.taxable_base' },
    { path: 'lines[employer]', reasonKey: 'req.employer_contributions' },
    { path: 'time.leave.balances', reasonKey: 'req.leave_balances' },
    { path: 'statutoryTerms', reasonKey: 'req.statutory_terms' },
  ],
  requiredDisclosures: ['record_keeping', 'noncash_benefit_basis', 'constructed_notice'],
  pack: {
    effectiveFrom: '2026-01-01',
    reviewStatus: 'constructed-unreviewed',
    reviewOwner: 'Unassigned — requires German payroll (Entgeltabrechnung) and qualified local review before issuance',
    sources: [
      { title: 'Gewerbeordnung (GewO) § 108 — Abrechnung des Arbeitsentgelts (gesetze-im-internet.de)', url: 'https://www.gesetze-im-internet.de/gewo/__108.html' },
      { title: 'Entgeltbescheinigungsverordnung (EBV) — Verordnung zur Erstellung einer Entgeltbescheinigung nach § 108 Absatz 3 Satz 1 GewO (gesetze-im-internet.de)', url: 'https://www.gesetze-im-internet.de/entgbv/' },
      { title: 'Bundesministerium der Finanzen — Lohnsteuer (programmablaufplan and tables published annually)', url: 'https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Lohnsteuer/lohnsteuer.html' },
      { title: 'Deutsche Rentenversicherung — Beiträge und Beitragsbemessungsgrenzen', url: 'https://www.deutsche-rentenversicherung.de/' },
    ],
    notes: 'Statement structure follows § 108 GewO and the Entgeltbescheinigungsverordnung as a design reference: Abrechnungszeitraum, Gesamtbrutto including Sachbezüge, Steuerbrutto, SV-Brutto, Steuern, Sozialversicherungsbeiträge, Nettoverdienst, Nettobe- und -abzüge, Auszahlungsbetrag. The tax year is the calendar year. Lohnsteuer, Solidaritätszuschlag, Kirchensteuer, all social-insurance contributions and the statutory valuation of the company-car benefit are supplied by payroll from the official tables; this application does not recompute them. The employer’s betriebliche Altersvorsorge contribution follows employer policy.',
  },
  modules: { timeLeave: true, totalReward: true },
};
