/**
 * Profile CA-QC — Québec, Canada. Jurisdiction pack for presentation.
 * Constructed for presentation; not reviewed for production issuance.
 * Sources are design references, not an executable legal rulebook.
 *
 * Statement structure follows the pay-slip content list of the Loi sur les
 * normes du travail (art. 46) as published by the CNESST: employer, employee,
 * occupation, payment date and period, hours paid at the prevailing rate,
 * overtime hours with the applicable premium, nature and amount of bonuses
 * and indemnities, wage rate, gross wages, nature and amount of each
 * deduction, net wages. Québec pay statements conventionally separate the
 * retenues à la source (federal tax, Québec tax, RRQ, RQAP, AE) from other
 * deductions, which this profile models as two sub-totals.
 */
export const profile = {
  id: 'CA-QC',
  version: '2026.1',
  country: 'CA',
  countryKey: 'country.ca',
  jurisdiction: 'CA-QC',
  subdivision: 'QC',
  group: 'north-america',
  currency: 'CAD',
  locales: ['fr-CA', 'en-CA'],
  defaultLocale: 'fr-CA',
  statutoryLocale: 'fr-CA',
  paper: 'letter',
  taxYear: { startMonth: 1, startDay: 1, basisKey: 'ytd.basis.calendar_year' },
  payFrequency: 'biweekly',
  entity: {
    legalName: 'Avenlo Québec inc.',
    tradingName: 'Avenlo Québec',
    address: { lines: ['5800, rue Saint-Patrick, bureau 410'], city: 'Montréal', region: 'QC', postalCode: 'H4E 0A0', country: 'CA' },
    registrations: [
      { key: 'rq_identification', valueMasked: '•••• •••• RS0001' },
      { key: 'cra_payroll_account', valueMasked: 'RP•••• 0002' },
    ],
  },
  primaryTotal: 'net',
  payableTotal: 'payable',
  totals: [
    { id: 'gross', sum: { categories: ['earning'], cash: true }, required: true, prominent: true },
    { id: 'taxableGross', sum: { categories: ['earning', 'noncash'], taxable: true } },
    { id: 'statutoryDeductions', sum: { categories: ['deduction'], groups: ['tax', 'social'] }, prominent: true },
    { id: 'otherDeductions', sum: { categories: ['deduction'], excludeGroups: ['tax', 'social'] } },
    { id: 'employeeDeductions', formula: ['statutoryDeductions', '+', 'otherDeductions'], required: true, prominent: true },
    { id: 'net', formula: ['gross', '-', 'employeeDeductions'], required: true, prominent: true, net: true },
    { id: 'reimbursements', sum: { categories: ['reimbursement'] } },
    { id: 'advances', sum: { categories: ['advance'] } },
    { id: 'payable', formula: ['net', '+', 'reimbursements', '-', 'advances'], required: true, prominent: true, payable: true },
    { id: 'employerContributions', sum: { categories: ['employer'] } },
    { id: 'nonCash', sum: { categories: ['noncash'] } },
    { id: 'vacationAccrual', sum: { categories: ['info'], groups: ['leave'] } },
  ],
  categoryOrder: ['earning', 'reimbursement', 'deduction', 'noncash', 'employer', 'info'],
  reward: { grossTotal: 'gross', deductionsTotal: 'employeeDeductions', definitionKey: 'reward.definition.default' },
  statutoryTerms: {
    rrq: { term: 'Régime de rentes du Québec (RRQ)', locale: 'fr-CA' },
    rqap: { term: 'Régime québécois d’assurance parentale (RQAP)', locale: 'fr-CA' },
    ae: { term: 'Assurance-emploi (AE)', locale: 'fr-CA' },
    impot_quebec: { term: 'Impôt du Québec', locale: 'fr-CA' },
    impot_federal: { term: 'Impôt fédéral', locale: 'fr-CA' },
    fss: { term: 'Fonds des services de santé (FSS)', locale: 'fr-CA' },
    indemnite_vacances: { term: 'Indemnité afférente au congé annuel (Loi sur les normes du travail)', locale: 'fr-CA' },
    jour_ferie: { term: 'Indemnité de jour férié (Loi sur les normes du travail)', locale: 'fr-CA' },
    heures_supplementaires: { term: 'Heures supplémentaires (Loi sur les normes du travail)', locale: 'fr-CA' },
  },
  requiredFields: [
    { path: 'employer.legalName', reasonKey: 'req.employer_identity' },
    { path: 'employee.displayName', reasonKey: 'req.employee_identity' },
    { path: 'employee.occupation', reasonKey: 'req.occupation' },
    { path: 'document.payDate', reasonKey: 'req.pay_date' },
    { path: 'document.period', reasonKey: 'req.pay_period' },
    { path: 'lines[earning:regular].hours', reasonKey: 'req.hours' },
    { path: 'lines[earning:overtime]', reasonKey: 'req.overtime' },
    { path: 'lines[earning].rate', reasonKey: 'req.wage_rate' },
    { path: 'totals.gross', reasonKey: 'req.gross' },
    { path: 'lines[deduction]', reasonKey: 'req.deductions_itemised' },
    { path: 'lines[deduction:social]', reasonKey: 'req.social_contributions' },
    { path: 'totals.net', reasonKey: 'req.net' },
    { path: 'profile.statutoryTerms', reasonKey: 'req.statutory_terms' },
  ],
  requiredDisclosures: ['record_keeping', 'vacation_pay_basis', 'source_deductions', 'constructed_notice'],
  pack: {
    effectiveFrom: '2026-01-01',
    reviewStatus: 'constructed-unreviewed',
    reviewOwner: 'Unassigned — requires Québec payroll and qualified local review before issuance',
    sources: [
      { title: 'CNESST — Bulletin de paie (contenu obligatoire du bulletin de paie)', url: 'https://www.cnesst.gouv.qc.ca/fr/conditions-travail/salaire/bulletin-paie' },
      { title: 'LégisQuébec — Loi sur les normes du travail, RLRQ c. N-1.1, art. 46 (bulletin de paie)', url: 'https://www.legisquebec.gouv.qc.ca/fr/document/lc/N-1.1' },
      { title: 'Revenu Québec — Retenues à la source et cotisations de l’employeur', url: 'https://www.revenuquebec.ca/fr/entreprises/retenues-et-cotisations/' },
    ],
    notes: 'Statement structure follows the art. 46 pay-slip content list as a design reference. Federal and Québec income tax, RRQ, RQAP, AE and FSS amounts are supplied by payroll from the official tables; this application never recomputes or infers a statutory rate. The vacation indemnity accrual percentage and union dues percentage are employer-policy figures referenced from the collective agreement content. Source URLs could not be re-verified from the build environment and must be confirmed at review.',
  },
  modules: { timeLeave: true, totalReward: true },
};
