/**
 * Profile EU-IT — Italy. Jurisdiction pack for presentation.
 * Constructed for presentation; not reviewed for production issuance.
 * Sources are design references, not an executable legal rulebook.
 *
 * Statement structure follows the Italian cedolino paga (prospetto paga) as
 * required by Legge 5 gennaio 1953, n. 4 and recorded in the Libro Unico del
 * Lavoro: identity of the employer and worker, the applied CCNL with level and
 * qualifica, the period, the elements of the retribuzione (paga base,
 * contingenza, scatti di anzianità, superminimo, straordinario, arretrati),
 * the imponibile previdenziale and the employee's INPS contributions, the
 * imponibile fiscale, IRPEF net of detrazioni, the addizionali regionale and
 * comunale, other trattenute, the netto in busta and the amount actually paid.
 * Employer charges (INPS, INAIL, Fondo Est) and the monthly TFR accrual are
 * shown separately, as are the ratei of the tredicesima and quattordicesima.
 *
 * INPS contributions, IRPEF, the addizionali, INAIL and the TFR quota are
 * supplied by payroll from the official tables and rules; this application
 * never recomputes or infers a statutory rate. CCNL minimums, Fondo Est
 * amounts and the superminimo are employer-applied contractual values.
 */
export const profile = {
  id: 'EU-IT',
  version: '2026.1',
  country: 'IT',
  countryKey: 'country.it',
  jurisdiction: 'EU-IT',
  subdivision: null,
  group: 'europe',
  currency: 'EUR',
  locales: ['it-IT', 'en-GB', 'fr-FR', 'de-DE'],
  defaultLocale: 'it-IT',
  statutoryLocale: 'it-IT',
  paper: 'a4',
  taxYear: { startMonth: 1, startDay: 1, basisKey: 'ytd.basis.calendar_year' },
  payFrequency: 'monthly',
  entity: {
    legalName: 'Avenlo Italia S.r.l.',
    tradingName: 'Avenlo Group',
    address: { lines: ['Via Lodovico Muratori 28'], city: 'Milano', region: 'MI', postalCode: '20135', country: 'IT' },
    registrations: [
      { key: 'partita_iva', valueMasked: 'IT •••••• 0918' },
      { key: 'matricola_inps', valueMasked: '49•••• 2603' },
      { key: 'posizione_inail', valueMasked: '•••••• 471' },
    ],
  },
  primaryTotal: 'net',
  payableTotal: 'payable',
  // Italian cedolino structure: Totale competenze (retribuzione lorda) →
  // Imponibile previdenziale → Contributi INPS a carico dipendente →
  // Imponibile fiscale → Ritenute fiscali (IRPEF netta, addizionali) →
  // Altre trattenute → Totale trattenute → Netto in busta → rimborsi non
  // imponibili → Importo pagato. Oneri a carico azienda (INPS, INAIL, Fondo
  // Est, quota TFR) and Costo azienda are shown for information only.
  totals: [
    { id: 'gross', sum: { categories: ['earning'], cash: true }, required: true, prominent: true },
    { id: 'imponibilePrevidenziale', sum: { categories: ['earning'], taxable: true }, required: true },
    { id: 'inpsEmployee', sum: { categories: ['deduction'], groups: ['social'] }, required: true, prominent: true },
    { id: 'imponibileFiscale', formula: ['imponibilePrevidenziale', '-', 'inpsEmployee'], required: true },
    { id: 'taxes', sum: { categories: ['deduction'], groups: ['tax'] }, required: true, prominent: true },
    { id: 'otherDeductions', sum: { categories: ['deduction'], excludeGroups: ['social', 'tax'] } },
    { id: 'employeeDeductions', formula: ['inpsEmployee', '+', 'taxes', '+', 'otherDeductions'], required: true, prominent: true },
    { id: 'net', formula: ['gross', '-', 'employeeDeductions'], required: true, prominent: true, net: true },
    { id: 'reimbursements', sum: { categories: ['reimbursement'] } },
    { id: 'advances', sum: { categories: ['advance'] } },
    { id: 'payable', formula: ['net', '+', 'reimbursements', '-', 'advances'], required: true, prominent: true, payable: true },
    { id: 'employerContributions', sum: { categories: ['employer'] } },
    { id: 'costoAzienda', formula: ['gross', '+', 'employerContributions'] },
  ],
  categoryOrder: ['earning', 'reimbursement', 'deduction', 'employer', 'info'],
  reward: { grossTotal: 'gross', deductionsTotal: 'employeeDeductions', definitionKey: 'reward.definition.default' },
  statutoryTerms: {
    inps: { term: 'INPS — Contributi previdenziali (Istituto Nazionale della Previdenza Sociale)', locale: 'it-IT' },
    irpef: { term: 'IRPEF — Imposta sul reddito delle persone fisiche', locale: 'it-IT' },
    addizionale_regionale: { term: 'Addizionale regionale all’IRPEF', locale: 'it-IT' },
    addizionale_comunale: { term: 'Addizionale comunale all’IRPEF', locale: 'it-IT' },
    tfr: { term: 'TFR (Trattamento di fine rapporto)', locale: 'it-IT' },
    inail: { term: 'INAIL — Assicurazione obbligatoria contro gli infortuni sul lavoro e le malattie professionali', locale: 'it-IT' },
  },
  requiredFields: [
    { path: 'employer.legalName', reasonKey: 'req.employer_identity' },
    { path: 'employer.registrations[matricola_inps]', reasonKey: 'req.employer_identity' },
    { path: 'employee.displayName', reasonKey: 'req.employee_identity' },
    { path: 'employee.identifiers[codice_fiscale]', reasonKey: 'req.tax_identifiers' },
    { path: 'employee.classification', reasonKey: 'req.occupation' },
    { path: 'employee.identifiers[ccnl]', reasonKey: 'req.occupation' },
    { path: 'document.period', reasonKey: 'req.pay_period' },
    { path: 'document.payDate', reasonKey: 'req.pay_date' },
    { path: 'lines[earning]', reasonKey: 'req.wage_rate' },
    { path: 'lines[earning.overtime]', reasonKey: 'req.overtime' },
    { path: 'time.entries', reasonKey: 'req.hours' },
    { path: 'totals.gross', reasonKey: 'req.gross' },
    { path: 'totals.imponibilePrevidenziale', reasonKey: 'req.taxable_base' },
    { path: 'totals.imponibileFiscale', reasonKey: 'req.taxable_base' },
    { path: 'lines[deduction.social]', reasonKey: 'req.social_contributions' },
    { path: 'lines[deduction]', reasonKey: 'req.deductions_itemised' },
    { path: 'totals.net', reasonKey: 'req.net' },
    { path: 'totals.payable', reasonKey: 'req.net_concepts' },
    { path: 'time.leave.balances', reasonKey: 'req.leave_balances' },
    { path: 'lines[employer.retirement]', reasonKey: 'req.employer_contributions' },
    { path: 'lines[employer]', reasonKey: 'req.employer_contributions' },
    { path: 'statutoryTerms', reasonKey: 'req.statutory_terms' },
  ],
  requiredDisclosures: ['record_keeping', 'tfr_accrual_basis', 'constructed_notice'],
  pack: {
    effectiveFrom: '2026-01-01',
    reviewStatus: 'constructed-unreviewed',
    reviewOwner: 'Unassigned — requires Italian payroll (consulente del lavoro) and qualified local review before issuance',
    sources: [
      { title: 'Legge 5 gennaio 1953, n. 4 — Norme concernenti l’obbligo di corrispondere le retribuzioni ai lavoratori a mezzo di prospetti di paga (Normattiva)', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1953-01-05;4' },
      { title: 'Codice civile, art. 2120 — Disciplina del trattamento di fine rapporto (Normattiva)', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262' },
      { title: 'Ministero del Lavoro e delle Politiche Sociali', url: 'https://www.lavoro.gov.it/' },
      { title: 'INPS — Istituto Nazionale della Previdenza Sociale (contributi e aliquote pubblicate annualmente)', url: 'https://www.inps.it/' },
      { title: 'Agenzia delle Entrate — IRPEF, detrazioni e addizionali regionale e comunale', url: 'https://www.agenziaentrate.gov.it/' },
      { title: 'INAIL — Istituto Nazionale per l’Assicurazione contro gli Infortuni sul Lavoro', url: 'https://www.inail.it/' },
      { title: 'Fondo Est — Assistenza sanitaria integrativa per i dipendenti del Commercio, Turismo e Servizi', url: 'https://www.fondoest.it/' },
    ],
    notes: 'Statement structure follows the Italian cedolino paga (Legge 4/1953, Libro Unico del Lavoro) as a design reference: elementi della retribuzione secondo il CCNL applicato, imponibile previdenziale, contributi INPS a carico del dipendente, imponibile fiscale, IRPEF netta delle detrazioni, addizionali regionale e comunale, altre trattenute, netto in busta, importo pagato, oneri a carico azienda, quota TFR e ratei di tredicesima e quattordicesima. The tax year is the calendar year. INPS contributions, IRPEF, the addizionali, INAIL premiums and the monthly TFR quota are supplied by payroll from the official tables and rules; this application does not recompute them. CCNL minimum tables, scatti di anzianità, the superminimo and Fondo Est amounts are contractual values applied by the employer.',
  },
  modules: { timeLeave: true, totalReward: true },
};
