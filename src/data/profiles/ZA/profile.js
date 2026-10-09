/**
 * Profile ZA — South Africa. Jurisdiction pack for presentation.
 * Constructed for presentation; not reviewed for production issuance.
 * Sources are design references, not an executable legal rulebook.
 *
 * Payslip structure follows section 33 of the Basic Conditions of Employment
 * Act (BCEA): employer name and address, employee name and occupation, the
 * period for which payment is made, remuneration in money, the amount and
 * purpose of each deduction, the actual amount paid, and (where relevant to
 * the calculation) the rate of remuneration, ordinary hours, overtime hours
 * and hours worked on Sundays or public holidays.
 *
 * Statutory amounts (PAYE, UIF, SDL) are supplied by payroll from the official
 * SARS tables and the Unemployment Insurance Contributions Act; this
 * application never recomputes or infers a statutory rate.
 */
export const profile = {
  id: 'ZA',
  version: '2026.1',
  country: 'ZA',
  countryKey: 'country.za',
  jurisdiction: 'ZA',
  subdivision: null,
  group: 'africa',
  currency: 'ZAR',
  timeZone: 'Africa/Johannesburg',
  locales: ['en-ZA', 'af-ZA', 'zu-ZA', 'xh-ZA'],
  defaultLocale: 'en-ZA',
  statutoryLocale: 'en-ZA',
  paper: 'a4',
  taxYear: { startMonth: 3, startDay: 1, basisKey: 'ytd.basis.march_year' },
  payFrequency: 'monthly',
  entity: {
    legalName: 'Avenlo South Africa (Pty) Ltd',
    tradingName: 'Avenlo Group',
    address: { lines: ['Avenlo House, 42 Kestrel Avenue', 'Sandton'], city: 'Johannesburg', region: 'Gauteng', postalCode: '2196', country: 'ZA' },
    registrations: [
      { key: 'company_registration', valueMasked: '2015/••••••/07' },
      { key: 'paye_reference', valueMasked: '7•••••• 0417' },
      { key: 'uif_reference', valueMasked: 'U••••••• /8' },
      { key: 'sdl_reference', valueMasked: 'L•••••• 0417' },
    ],
  },
  primaryTotal: 'net',
  payableTotal: 'payable',
  // South African payslip structure: remuneration (BCEA "remuneration in money")
  // → deductions (each with its purpose) → net pay → amount actually paid, with
  // company (employer) contributions and cost to company shown separately.
  totals: [
    { id: 'remuneration', sum: { categories: ['earning'], cash: true }, required: true, prominent: true },
    { id: 'taxableRemuneration', sum: { categories: ['earning', 'noncash'], taxable: true } },
    { id: 'employeeDeductions', sum: { categories: ['deduction'] }, required: true, prominent: true },
    { id: 'net', formula: ['remuneration', '-', 'employeeDeductions'], required: true, prominent: true, net: true },
    { id: 'reimbursements', sum: { categories: ['reimbursement'] } },
    { id: 'advances', sum: { categories: ['advance'] } },
    { id: 'payable', formula: ['net', '+', 'reimbursements', '-', 'advances'], required: true, prominent: true, payable: true },
    { id: 'employerContributions', sum: { categories: ['employer'] } },
    { id: 'nonCash', sum: { categories: ['noncash'] } },
    { id: 'costToCompany', formula: ['remuneration', '+', 'employerContributions', '+', 'nonCash'] },
  ],
  categoryOrder: ['earning', 'reimbursement', 'deduction', 'noncash', 'employer'],
  reward: { grossTotal: 'remuneration', deductionsTotal: 'employeeDeductions', definitionKey: 'reward.definition.default' },
  statutoryTerms: {
    paye: { term: 'PAYE (Pay-As-You-Earn)', locale: 'en-ZA' },
    uif: { term: 'UIF (Unemployment Insurance Fund)', locale: 'en-ZA' },
    sdl: { term: 'SDL (Skills Development Levy)', locale: 'en-ZA' },
    overtime: { term: 'Overtime (Basic Conditions of Employment Act, section 10)', locale: 'en-ZA' },
  },
  requiredFields: [
    { path: 'employer.legalName', reasonKey: 'req.employer_identity' },
    { path: 'employer.address', reasonKey: 'req.employer_identity' },
    { path: 'employee.displayName', reasonKey: 'req.employee_identity' },
    { path: 'employee.occupation', reasonKey: 'req.occupation' },
    { path: 'document.period', reasonKey: 'req.pay_period' },
    { path: 'document.payDate', reasonKey: 'req.pay_date' },
    { path: 'totals.remuneration', reasonKey: 'req.gross' },
    { path: 'lines[deduction]', reasonKey: 'req.deductions_itemised' },
    { path: 'totals.payable', reasonKey: 'req.net' },
    { path: 'lines[earning].rate', reasonKey: 'req.wage_rate' },
    { path: 'time.entries[regularMinutes]', reasonKey: 'req.hours' },
    { path: 'time.entries[overtimeMinutes]', reasonKey: 'req.overtime' },
    { path: 'employee.identifiers[tax_number]', reasonKey: 'req.tax_identifiers' },
    { path: 'statutoryTerms', reasonKey: 'req.statutory_terms' },
  ],
  requiredDisclosures: ['record_keeping', 'bcea_hours_statement', 'constructed_notice'],
  pack: {
    effectiveFrom: '2026-03-01',
    reviewStatus: 'constructed-unreviewed',
    reviewOwner: 'Unassigned — requires South African payroll and qualified local review before issuance',
    sources: [
      { title: 'Basic Conditions of Employment Act 75 of 1997, section 33 — information about remuneration (Department of Employment and Labour)', url: 'https://www.labour.gov.za/DocumentCenter/Acts/Basic%20Conditions%20of%20Employment/Act%20-%20Basic%20Conditions%20of%20Employment.pdf' },
      { title: 'Department of Employment and Labour — Basic Conditions of Employment', url: 'https://www.labour.gov.za/Legislation/Acts/Basic-Conditions-of-Employment' },
      { title: 'SARS — Pay-As-You-Earn (PAYE)', url: 'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/' },
      { title: 'SARS — Unemployment Insurance Fund (UIF) contributions', url: 'https://www.sars.gov.za/types-of-tax/unemployment-insurance-fund/' },
      { title: 'SARS — Skills Development Levy (SDL)', url: 'https://www.sars.gov.za/types-of-tax/skills-development-levy/' },
    ],
    notes: 'Statement structure follows the BCEA section 33 payslip content list as a design reference. The tax year runs from 1 March to the last day of February; year-to-date values reset on 1 March. PAYE, UIF and SDL amounts are supplied by payroll from the official tables; this application does not recompute them. Retirement fund and medical aid contributions follow employer policy.',
  },
  modules: { timeLeave: true, totalReward: true },
};
