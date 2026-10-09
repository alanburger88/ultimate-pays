/**
 * Constructed record — Étienne Roy, Avenlo Québec inc. (Québec).
 * Scenario: hourly warehouse technician with variable hours, overtime paid at
 * 150 % reconciled to shifts, a separate vacation-indemnity accrual (hours
 * balance and 4 % money accrual) with a vacation payout in a prior period, a
 * statutory holiday indemnity in a prior period, and Québec source deductions
 * (impôt fédéral, impôt du Québec, RRQ, RQAP, AE) supplied by payroll.
 * Pay periods are numbered by pay date within the calendar (tax) year, as
 * T4/RL-1 year-to-date totals are: period 1 of 2026 is 21 Dec 2025 – 3 Jan
 * 2026, paid Friday 9 Jan 2026, so the Sep 13–26 period paid 2 Oct 2026 is
 * period 20 and every ytdMinor covers the 20 pay dates since 9 Jan 2026.
 * Period 1 (64 h regular plus the 25 Dec and 1 Jan statutory holiday
 * indemnities, gross 219200) is older than the three periods kept in
 * `history`; its amounts are folded into every ytdMinor.
 * All amounts are integer minor units (cents). All identities, addresses and
 * bank details are fictitious. Not employer-issued. Not proof of earnings.
 */
export const record = {
  schemaVersion: 1,
  scenario: {
    id: 'etienne-roy',
    summary: 'Hourly pay with variable hours and overtime at 150 % reconciled to shifts, a separate vacation-indemnity accrual with a prior-period vacation payout, and Québec source deductions supplied by payroll.',
    tags: ['variable-hours', 'overtime', 'leave'],
  },
  document: {
    id: 'AVQ-CA-QC-2026-20-0318',
    version: 1,
    issuedAt: '2026-09-30T15:40:00-04:00',
    supersedes: null,
    supersededBy: null,
    profileId: 'CA-QC',
    profileVersion: '2026.1',
    contentVersion: '2026.1',
    period: { start: '2026-09-13', end: '2026-09-26', sequence: 20, of: 26, frequency: 'biweekly' },
    payDate: '2026-10-02',
    currency: 'CAD',
    taxYear: { label: '2026', start: '2026-01-01', end: '2026-12-31' },
    languages: ['fr-CA', 'en-CA'],
    provenance: { kind: 'constructed', notice: 'not-proof-of-earnings', issuer: null, generatedBy: 'Paylight presentation data' },
    integrity: { status: 'not-verified', method: null },
  },
  employer: {
    legalName: 'Avenlo Québec inc.',
    tradingName: 'Avenlo Québec',
    address: { lines: ['5800, rue Saint-Patrick, bureau 410'], city: 'Montréal', region: 'QC', postalCode: 'H4E 0A0', country: 'CA' },
    registrations: [
      { key: 'rq_identification', valueMasked: '•••• •••• RS0001' },
      { key: 'cra_payroll_account', valueMasked: 'RP•••• 0002' },
    ],
    payrollContact: { label: 'Service de la paie — Avenlo Québec', email: 'paie@avenlo-quebec.example' },
  },
  employee: {
    displayName: 'Étienne Roy',
    givenName: 'Étienne',
    familyName: 'Roy',
    employeeNumber: 'AVQ-20318',
    occupation: 'Technicien d’entrepôt',
    classification: 'Horaire, temps plein, syndiqué',
    department: 'Logistique — Centre de distribution de Montréal',
    location: 'Montréal (Québec)',
    hireDate: '2024-05-06',
    identifiers: [{ key: 'nas', valueMasked: '••• ••• 517' }],
  },
  payment: { method: 'eft', amountMinor: 170371, date: '2026-10-02', bankMasked: '•••• 2093', reference: 'DD-2026-20-0318' },
  lines: [
    // Earnings
    { id: 'e-reg', category: 'earning', group: 'regular', key: 'regular_hourly', amountMinor: 219200, cash: true, taxable: true, ytdMinor: 4111370,
      calc: { type: 'hours_rate', hoursHundredths: 8000, rateMinor: 2740, multiplier100: 100 },
      timeEntryIds: ['t-01', 't-02', 't-03', 't-04', 't-05', 't-06', 't-07', 't-08', 't-09', 't-10'], timeBucket: 'regularMinutes',
      sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.salaire_regulier', policyIds: [], glossaryKey: 'salaire_brut' },
    { id: 'e-ot', category: 'earning', group: 'overtime', key: 'overtime_150', amountMinor: 20550, cash: true, taxable: true, ytdMinor: 123300, statutoryKey: 'heures_supplementaires',
      calc: { type: 'hours_rate', hoursHundredths: 500, rateMinor: 2740, multiplier100: 150 },
      timeEntryIds: ['t-02', 't-04', 't-08'], timeBucket: 'overtimeMinutes',
      sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.heures_supp', policyIds: ['pol-heures-supp'], glossaryKey: 'heures_supplementaires' },
    // Deductions — retenues à la source (statutory amounts supplied by payroll; never recomputed here)
    { id: 'd-fed', category: 'deduction', group: 'tax', key: 'impot_federal', amountMinor: 20760, cash: true, taxable: false, ytdMinor: 371730, statutoryKey: 'impot_federal',
      calc: { type: 'supplied', basisMinor: 236873 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.impot_federal', glossaryKey: 'impot_federal' },
    { id: 'd-qc', category: 'deduction', group: 'tax', key: 'impot_quebec', amountMinor: 23510, cash: true, taxable: false, ytdMinor: 422080, statutoryKey: 'impot_quebec',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.impot_quebec', glossaryKey: 'impot_quebec' },
    { id: 'd-rrq', category: 'deduction', group: 'social', key: 'rrq', amountMinor: 14482, cash: true, taxable: false, ytdMinor: 272023, statutoryKey: 'rrq',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.rrq', glossaryKey: 'rrq' },
    { id: 'd-rqap', category: 'deduction', group: 'social', key: 'rqap', amountMinor: 1184, cash: true, taxable: false, ytdMinor: 22327, statutoryKey: 'rqap',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.rqap', glossaryKey: 'rqap' },
    { id: 'd-ae', category: 'deduction', group: 'social', key: 'ae', amountMinor: 3141, cash: true, taxable: false, ytdMinor: 59209, statutoryKey: 'ae',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.ae', glossaryKey: 'ae' },
    // Deductions — autres retenues (employer policy / collective agreement)
    { id: 'd-union', category: 'deduction', group: 'union', key: 'cotisation_syndicale', amountMinor: 2877, cash: true, taxable: false, ytdMinor: 54234,
      calc: { type: 'rate_base', baseLineIds: ['e-reg', 'e-ot'], ratePermyriad: 120 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.cotisation_syndicale', policyIds: ['pol-syndicat'], glossaryKey: 'syndicat' },
    { id: 'd-ins', category: 'deduction', group: 'health', key: 'assurance_collective_employe', amountMinor: 3425, cash: true, taxable: false, ytdMinor: 68500,
      calc: { type: 'fixed', amountMinor: 3425 }, sourceRef: 'benefits:assurance-collective', explanationKey: 'exp.assurance_collective', policyIds: ['pol-assurance'], glossaryKey: 'assurance_collective' },
    // Employer contributions
    { id: 'er-rrq', category: 'employer', group: 'social', key: 'rrq_employeur', amountMinor: 14482, cash: false, taxable: false, ytdMinor: 272023, statutoryKey: 'rrq',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.rrq' },
    { id: 'er-ae', category: 'employer', group: 'social', key: 'ae_employeur', amountMinor: 4397, cash: false, taxable: false, ytdMinor: 82893, statutoryKey: 'ae',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.ae' },
    { id: 'er-rqap', category: 'employer', group: 'social', key: 'rqap_employeur', amountMinor: 1659, cash: false, taxable: false, ytdMinor: 31276, statutoryKey: 'rqap',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.rqap' },
    { id: 'er-fss', category: 'employer', group: 'social', key: 'fss_employeur', amountMinor: 3956, cash: false, taxable: false, ytdMinor: 74574, statutoryKey: 'fss',
      calc: { type: 'supplied', basisMinor: 239750 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.fss', glossaryKey: 'fss' },
    { id: 'er-ins', category: 'employer', group: 'health', key: 'assurance_collective_employeur', amountMinor: 6850, cash: false, taxable: false, ytdMinor: 137000,
      calc: { type: 'fixed', amountMinor: 6850 }, sourceRef: 'benefits:assurance-collective', explanationKey: 'exp.assurance_collective', policyIds: ['pol-assurance'] },
    // Information — vacation indemnity accrued this period (not paid now; not part of any pay total)
    { id: 'i-vac', category: 'info', group: 'leave', key: 'vacation_accrual', amountMinor: 9590, cash: false, taxable: false, ytdMinor: 180785, statutoryKey: 'indemnite_vacances',
      calc: { type: 'rate_base', baseLineIds: ['e-reg', 'e-ot'], ratePermyriad: 400 }, sourceRef: 'payroll:run-2026-20', explanationKey: 'exp.indemnite_vacances_accumulee', policyIds: ['pol-vacances'], glossaryKey: 'indemnite_vacances' },
  ],
  suppliedTotals: {
    gross: 239750, taxableGross: 239750, statutoryDeductions: 63077, otherDeductions: 6302, employeeDeductions: 69379, net: 170371,
    reimbursements: 0, advances: 0, payable: 170371, employerContributions: 31344, nonCash: 0, vacationAccrual: 9590,
  },
  adjustments: [],
  history: [
    // Period 19 — nine worked days (72 h) plus the Fête du Travail (7 September 2026) paid as a statutory holiday indemnity. No overtime.
    { periodId: '2026-19', taxYearLabel: '2026', period: { start: '2026-08-30', end: '2026-09-12', sequence: 19, of: 26 }, payDate: '2026-09-18',
      lines: [
        { id: 'e-reg', category: 'earning', group: 'regular', key: 'regular_hourly', amountMinor: 197280, cash: true, taxable: true, ytdMinor: 3892170, hoursHundredths: 7200 },
        { id: 'e-hol', category: 'earning', group: 'leave', key: 'holiday_pay', amountMinor: 21920, cash: true, taxable: true, ytdMinor: 175360, hoursHundredths: 800 },
        { id: 'd-fed', category: 'deduction', group: 'tax', key: 'impot_federal', amountMinor: 17930, ytdMinor: 350970 },
        { id: 'd-qc', category: 'deduction', group: 'tax', key: 'impot_quebec', amountMinor: 20420, ytdMinor: 398570 },
        { id: 'd-rrq', category: 'deduction', group: 'social', key: 'rrq', amountMinor: 13167, ytdMinor: 257541 },
        { id: 'd-rqap', category: 'deduction', group: 'social', key: 'rqap', amountMinor: 1083, ytdMinor: 21143 },
        { id: 'd-ae', category: 'deduction', group: 'social', key: 'ae', amountMinor: 2872, ytdMinor: 56068 },
        { id: 'd-union', category: 'deduction', group: 'union', key: 'cotisation_syndicale', amountMinor: 2630, ytdMinor: 51357 },
        { id: 'd-ins', category: 'deduction', group: 'health', key: 'assurance_collective_employe', amountMinor: 3425, ytdMinor: 65075 },
        { id: 'er-rrq', category: 'employer', group: 'social', key: 'rrq_employeur', amountMinor: 13167, cash: false, ytdMinor: 257541 },
        { id: 'er-ae', category: 'employer', group: 'social', key: 'ae_employeur', amountMinor: 4021, cash: false, ytdMinor: 78496 },
        { id: 'er-rqap', category: 'employer', group: 'social', key: 'rqap_employeur', amountMinor: 1517, cash: false, ytdMinor: 29617 },
        { id: 'er-fss', category: 'employer', group: 'social', key: 'fss_employeur', amountMinor: 3617, cash: false, ytdMinor: 70618 },
        { id: 'er-ins', category: 'employer', group: 'health', key: 'assurance_collective_employeur', amountMinor: 6850, cash: false, ytdMinor: 130150 },
        { id: 'i-vac', category: 'info', group: 'leave', key: 'vacation_accrual', amountMinor: 8768, cash: false, ytdMinor: 171195 },
      ],
      suppliedTotals: { gross: 219200, statutoryDeductions: 55472, otherDeductions: 6055, employeeDeductions: 61527, net: 157673, payable: 157673, employerContributions: 29172, vacationAccrual: 8768 } },
    // Period 18 — ten worked days (80 h) plus 3 h of overtime at 150 %.
    { periodId: '2026-18', taxYearLabel: '2026', period: { start: '2026-08-16', end: '2026-08-29', sequence: 18, of: 26 }, payDate: '2026-09-04',
      lines: [
        { id: 'e-reg', category: 'earning', group: 'regular', key: 'regular_hourly', amountMinor: 219200, cash: true, taxable: true, ytdMinor: 3694890, hoursHundredths: 8000 },
        { id: 'e-ot', category: 'earning', group: 'overtime', key: 'overtime_150', amountMinor: 12330, cash: true, taxable: true, ytdMinor: 102750, hoursHundredths: 300 },
        { id: 'd-fed', category: 'deduction', group: 'tax', key: 'impot_federal', amountMinor: 19700, ytdMinor: 333040 },
        { id: 'd-qc', category: 'deduction', group: 'tax', key: 'impot_quebec', amountMinor: 22350, ytdMinor: 378150 },
        { id: 'd-rrq', category: 'deduction', group: 'social', key: 'rrq', amountMinor: 13956, ytdMinor: 244374 },
        { id: 'd-rqap', category: 'deduction', group: 'social', key: 'rqap', amountMinor: 1144, ytdMinor: 20060 },
        { id: 'd-ae', category: 'deduction', group: 'social', key: 'ae', amountMinor: 3033, ytdMinor: 53196 },
        { id: 'd-union', category: 'deduction', group: 'union', key: 'cotisation_syndicale', amountMinor: 2778, ytdMinor: 48727 },
        { id: 'd-ins', category: 'deduction', group: 'health', key: 'assurance_collective_employe', amountMinor: 3425, ytdMinor: 61650 },
        { id: 'er-rrq', category: 'employer', group: 'social', key: 'rrq_employeur', amountMinor: 13956, cash: false, ytdMinor: 244374 },
        { id: 'er-ae', category: 'employer', group: 'social', key: 'ae_employeur', amountMinor: 4246, cash: false, ytdMinor: 74475 },
        { id: 'er-rqap', category: 'employer', group: 'social', key: 'rqap_employeur', amountMinor: 1602, cash: false, ytdMinor: 28100 },
        { id: 'er-fss', category: 'employer', group: 'social', key: 'fss_employeur', amountMinor: 3820, cash: false, ytdMinor: 67001 },
        { id: 'er-ins', category: 'employer', group: 'health', key: 'assurance_collective_employeur', amountMinor: 6850, cash: false, ytdMinor: 123300 },
        { id: 'i-vac', category: 'info', group: 'leave', key: 'vacation_accrual', amountMinor: 9261, cash: false, ytdMinor: 162427 },
      ],
      suppliedTotals: { gross: 231530, statutoryDeductions: 60183, otherDeductions: 6203, employeeDeductions: 66386, net: 165144, payable: 165144, employerContributions: 30474, vacationAccrual: 9261 } },
    // Period 17 — one worked week (40 h) and one week of vacation (3–7 August 2026) paid as a separate vacation indemnity line.
    { periodId: '2026-17', taxYearLabel: '2026', period: { start: '2026-08-02', end: '2026-08-15', sequence: 17, of: 26 }, payDate: '2026-08-21',
      lines: [
        { id: 'e-reg', category: 'earning', group: 'regular', key: 'regular_hourly', amountMinor: 109600, cash: true, taxable: true, ytdMinor: 3475690, hoursHundredths: 4000 },
        { id: 'e-vac', category: 'earning', group: 'leave', key: 'vacation_pay', amountMinor: 109600, cash: true, taxable: true, ytdMinor: 109600, hoursHundredths: 4000 },
        { id: 'd-fed', category: 'deduction', group: 'tax', key: 'impot_federal', amountMinor: 17930, ytdMinor: 313340 },
        { id: 'd-qc', category: 'deduction', group: 'tax', key: 'impot_quebec', amountMinor: 20420, ytdMinor: 355800 },
        { id: 'd-rrq', category: 'deduction', group: 'social', key: 'rrq', amountMinor: 13167, ytdMinor: 230418 },
        { id: 'd-rqap', category: 'deduction', group: 'social', key: 'rqap', amountMinor: 1083, ytdMinor: 18916 },
        { id: 'd-ae', category: 'deduction', group: 'social', key: 'ae', amountMinor: 2872, ytdMinor: 50163 },
        { id: 'd-union', category: 'deduction', group: 'union', key: 'cotisation_syndicale', amountMinor: 2630, ytdMinor: 45949 },
        { id: 'd-ins', category: 'deduction', group: 'health', key: 'assurance_collective_employe', amountMinor: 3425, ytdMinor: 58225 },
        { id: 'er-rrq', category: 'employer', group: 'social', key: 'rrq_employeur', amountMinor: 13167, cash: false, ytdMinor: 230418 },
        { id: 'er-ae', category: 'employer', group: 'social', key: 'ae_employeur', amountMinor: 4021, cash: false, ytdMinor: 70229 },
        { id: 'er-rqap', category: 'employer', group: 'social', key: 'rqap_employeur', amountMinor: 1517, cash: false, ytdMinor: 26498 },
        { id: 'er-fss', category: 'employer', group: 'social', key: 'fss_employeur', amountMinor: 3617, cash: false, ytdMinor: 63181 },
        { id: 'er-ins', category: 'employer', group: 'health', key: 'assurance_collective_employeur', amountMinor: 6850, cash: false, ytdMinor: 116450 },
        { id: 'i-vac', category: 'info', group: 'leave', key: 'vacation_accrual', amountMinor: 8768, cash: false, ytdMinor: 153166 },
      ],
      suppliedTotals: { gross: 219200, statutoryDeductions: 55472, otherDeductions: 6055, employeeDeductions: 61527, net: 157673, payable: 157673, employerContributions: 29172, vacationAccrual: 8768 } },
  ],
  time: {
    scheduleNote: 'variable',
    entries: [
      // Week of 14 September 2026 — 42.50 h worked: 40.00 h regular, 2.50 h overtime
      { id: 't-01', date: '2026-09-14', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-02', date: '2026-09-15', type: 'work', start: '07:00', end: '17:00', breakMinutes: 30, workedMinutes: 570, regularMinutes: 480, overtimeMinutes: 90, premiumMinutes: 0, paidMinutes: 570, overtimeCode: 'ot150' },
      { id: 't-03', date: '2026-09-16', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-04', date: '2026-09-17', type: 'work', start: '07:00', end: '16:30', breakMinutes: 30, workedMinutes: 540, regularMinutes: 480, overtimeMinutes: 60, premiumMinutes: 0, paidMinutes: 540, overtimeCode: 'ot150' },
      { id: 't-05', date: '2026-09-18', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      // Week of 21 September 2026 — 42.50 h worked: 40.00 h regular, 2.50 h overtime
      { id: 't-06', date: '2026-09-21', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-07', date: '2026-09-22', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-08', date: '2026-09-23', type: 'work', start: '07:00', end: '18:00', breakMinutes: 30, workedMinutes: 630, regularMinutes: 480, overtimeMinutes: 150, premiumMinutes: 0, paidMinutes: 630, overtimeCode: 'ot150' },
      { id: 't-09', date: '2026-09-24', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
      { id: 't-10', date: '2026-09-25', type: 'work', start: '07:00', end: '15:30', breakMinutes: 30, workedMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, premiumMinutes: 0, paidMinutes: 480 },
    ],
    leave: {
      balances: [
        // Hours in hundredths: 80 h per year credited at 3.08 h per pay period; the week of 3–7 August 2026 (40 h) was taken in period 17.
        { type: 'vacation', unit: 'hours', opening: 5744, accrued: 308, taken: 0, adjusted: 0, closing: 6052, asOf: '2026-09-26', explanationKey: 'exp.vacances' },
      ],
      movements: [
        { id: 'lm-1', date: '2026-09-26', type: 'vacation', kind: 'accrued', amount: 308, unit: 'hours', lineId: 'i-vac' },
      ],
    },
    upcomingPayDates: ['2026-10-16', '2026-10-30', '2026-11-13'],
  },
  benefits: [
    { id: 'b-assurance', key: 'assurance_collective', employerAmountMinor: 6850, employeeAmountMinor: 3425, lineIds: ['er-ins', 'd-ins'], cash: false },
    { id: 'b-syndicat', key: 'syndicat', employerAmountMinor: 0, employeeAmountMinor: 2877, lineIds: ['d-union'], cash: false },
  ],
  disclosures: [
    { id: 'disc-record', key: 'record_keeping', required: true },
    { id: 'disc-vacances', key: 'vacation_pay_basis', required: true },
    { id: 'disc-retenues', key: 'source_deductions', required: true },
    { id: 'disc-heures-supp', key: 'overtime_basis', required: false },
    { id: 'disc-query', key: 'query_window', required: false },
    { id: 'disc-constructed', key: 'constructed_notice', required: true },
  ],
  policies: ['pol-heures-supp', 'pol-vacances', 'pol-jours-feries', 'pol-syndicat', 'pol-assurance'],
  highlights: [
    { kind: 'change', lineId: 'e-ot', reasonKey: 'highlight.overtime' },
    { kind: 'change', lineId: 'i-vac', reasonKey: 'highlight.leave_movement' },
  ],
  story: { audio: {} },
};
