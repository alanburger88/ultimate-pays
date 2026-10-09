/**
 * Constructed record — Sipho Khumalo, Avenlo South Africa (Pty) Ltd (Johannesburg).
 * Scenario: a new starter's first, partial month. Pro rata basic salary per
 * working day, PAYE and UIF supplied by payroll, employer UIF and SDL, no
 * benefits yet, no pay history, leave balances opening at zero with accrual
 * only. All amounts are integer minor units (cents). All identities, addresses
 * and bank details are fictitious. Not employer-issued. Not proof of earnings.
 */
export const record = {
  schemaVersion: 1,
  scenario: {
    id: 'za-new-starter',
    summary: 'A new starter’s first partial month: pro rata salary per working day, statutory PAYE and UIF only, no benefits yet, no history and leave balances starting from zero',
    tags: ['sparse', 'first-period'],
  },
  document: {
    id: 'AVN-ZA-2026-07-0991',
    version: 1,
    issuedAt: '2026-09-23T15:40:00+02:00',
    supersedes: null,
    supersededBy: null,
    profileId: 'ZA',
    profileVersion: '2026.1',
    contentVersion: '2026.1',
    // The period for which payment is made runs from the start date to month end.
    period: { start: '2026-09-14', end: '2026-09-30', sequence: 7, of: 12, frequency: 'monthly' },
    payDate: '2026-09-25',
    currency: 'ZAR',
    taxYear: { label: '2026/27', start: '2026-03-01', end: '2027-02-28' },
    // Only en-ZA content is prepared; af-ZA, zu-ZA and xh-ZA are added once translated.
    languages: ['en-ZA', 'af-ZA', 'zu-ZA', 'xh-ZA'],
    provenance: { kind: 'constructed', notice: 'not-proof-of-earnings', issuer: null, generatedBy: 'Paylight presentation data' },
    integrity: { status: 'not-verified', method: null },
  },
  employer: {
    legalName: 'Avenlo South Africa (Pty) Ltd',
    tradingName: 'Avenlo Group',
    address: { lines: ['Avenlo House, 42 Kestrel Avenue', 'Sandton'], city: 'Johannesburg', region: 'Gauteng', postalCode: '2196', country: 'ZA' },
    registrations: [
      { key: 'company_registration', valueMasked: '2015/••••••/07' },
      { key: 'paye_reference', valueMasked: '7•••••• 0417' },
      { key: 'uif_reference', valueMasked: 'U••••••• /8' },
      { key: 'sdl_reference', valueMasked: 'L•••••• 0417' },
    ],
    payrollContact: { label: 'Avenlo People Services (Johannesburg)', email: 'payroll.za@avenlo.example' },
  },
  employee: {
    displayName: 'Sipho Khumalo',
    givenName: 'Sipho',
    familyName: 'Khumalo',
    employeeNumber: 'AVZA-20991',
    occupation: 'Customer Service Agent',
    classification: 'Permanent, full-time, monthly paid (probation)',
    department: 'Customer Operations',
    location: 'Sandton, Gauteng',
    hireDate: '2026-09-14',
    identifiers: [{ key: 'tax_number', valueMasked: '•••• ••• 509' }],
  },
  payment: { method: 'eft', amountMinor: 1032350, date: '2026-09-25', bankMasked: '•••• 3318', reference: 'AVZA-2026-07-0991' },
  lines: [
    { id: 'e-basic-prorata', category: 'earning', group: 'regular', key: 'basic_salary_prorata', amountMinor: 1170000, cash: true, taxable: true, ytdMinor: 1170000,
      calc: { type: 'units_rate', unitsHundredths: 1300, unit: 'days', rateMinor: 90000, sourcePeriod: { start: '2026-09-14', end: '2026-09-30' } },
      sourceRef: 'payroll:run-2026-09', explanationKey: 'exp.basic_salary_prorata', policyIds: ['pol-pro-rata'], glossaryKey: 'pro_rata' },
    { id: 'd-paye', category: 'deduction', group: 'tax', key: 'paye', amountMinor: 125950, cash: true, taxable: false, ytdMinor: 125950, statutoryKey: 'paye',
      calc: { type: 'supplied', basisMinor: 1170000 }, sourceRef: 'payroll:run-2026-09', explanationKey: 'exp.paye_first_period', glossaryKey: 'paye' },
    { id: 'd-uif', category: 'deduction', group: 'social', key: 'uif_employee', amountMinor: 11700, cash: true, taxable: false, ytdMinor: 11700, statutoryKey: 'uif',
      calc: { type: 'supplied', basisMinor: 1170000 }, sourceRef: 'payroll:run-2026-09', explanationKey: 'exp.uif', glossaryKey: 'uif' },
    { id: 'er-uif', category: 'employer', group: 'social', key: 'uif_employer', amountMinor: 11700, cash: false, taxable: false, ytdMinor: 11700, statutoryKey: 'uif',
      calc: { type: 'supplied', basisMinor: 1170000 }, sourceRef: 'payroll:run-2026-09', explanationKey: 'exp.uif_employer', glossaryKey: 'uif' },
    { id: 'er-sdl', category: 'employer', group: 'social', key: 'sdl_employer', amountMinor: 11700, cash: false, taxable: false, ytdMinor: 11700, statutoryKey: 'sdl',
      calc: { type: 'supplied', basisMinor: 1170000 }, sourceRef: 'payroll:run-2026-09', explanationKey: 'exp.sdl', glossaryKey: 'sdl' },
  ],
  suppliedTotals: { remuneration: 1170000, taxableRemuneration: 1170000, employeeDeductions: 137650, net: 1032350, reimbursements: 0, advances: 0, payable: 1032350, employerContributions: 23400, nonCash: 0, costToCompany: 1193400 },
  adjustments: [],
  history: [],
  time: {
    scheduleNote: 'standard_week_40',
    entries: [
      { id: 't-01', date: '2026-09-14', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-02', date: '2026-09-15', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-03', date: '2026-09-16', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-04', date: '2026-09-17', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-05', date: '2026-09-18', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-06', date: '2026-09-21', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-07', date: '2026-09-22', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-08', date: '2026-09-23', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-09', date: '2026-09-24', type: 'holiday', holidayKey: 'heritage_day', minutes: 480, paidMinutes: 480 },
      { id: 't-10', date: '2026-09-25', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-11', date: '2026-09-28', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-12', date: '2026-09-29', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-13', date: '2026-09-30', type: 'work', start: '08:00', end: '17:00', breakMinutes: 60, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
    ],
    leave: {
      balances: [
        { type: 'annual', unit: 'days', opening: 0, accrued: 74, taken: 0, adjusted: 0, closing: 74, asOf: '2026-09-30', explanationKey: 'exp.annual_leave_new_starter' },
        { type: 'sick', unit: 'days', opening: 0, accrued: 50, taken: 0, adjusted: 0, closing: 50, asOf: '2026-09-30', explanationKey: 'exp.sick_leave_new_starter' },
      ],
      movements: [
        { id: 'lm-1', date: '2026-09-30', type: 'annual', kind: 'accrued', amount: 74, unit: 'days' },
        { id: 'lm-2', date: '2026-09-30', type: 'sick', kind: 'accrued', amount: 50, unit: 'days' },
      ],
    },
    upcomingPayDates: ['2026-10-23', '2026-11-25', '2026-12-24'],
  },
  benefits: [],
  disclosures: [
    { id: 'disc-record', key: 'record_keeping', required: true },
    { id: 'disc-hours', key: 'bcea_hours_statement', required: true },
    { id: 'disc-benefits', key: 'benefits_pending', required: false },
    { id: 'disc-query', key: 'query_window', required: false },
    { id: 'disc-constructed', key: 'constructed_notice', required: true },
  ],
  policies: ['pol-pro-rata', 'pol-new-starter-benefits', 'pol-annual-leave', 'pol-sick-leave', 'pol-pay-date'],
  highlights: [
    { kind: 'change', lineId: 'e-basic-prorata', reasonKey: 'highlight.first_period' },
  ],
  story: { audio: {} },
};
