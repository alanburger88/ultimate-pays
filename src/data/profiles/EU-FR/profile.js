/**
 * Profile EU-FR — France. Jurisdiction pack for presentation.
 * Models the structure of the French "bulletin de paie simplifié": salaire
 * brut, cotisations et contributions sociales (salariales / patronales),
 * montant net social, net imposable, net à payer avant impôt sur le revenu,
 * impôt sur le revenu prélevé à la source, net payé.
 * Constructed for presentation; not reviewed for production issuance.
 * Sources are design references, not an executable legal rulebook. Statutory
 * contribution and tax amounts are supplied by payroll and never recomputed.
 */
export const profile = {
  id: 'EU-FR',
  version: '2026.1',
  country: 'FR',
  countryKey: 'country.fr',
  jurisdiction: 'EU-FR',
  subdivision: null,
  group: 'europe',
  currency: 'EUR',
  timeZone: 'Europe/Paris',
  // fr-FR and en-GB content packs are written; de-DE and it-IT remain placeholder
  // stubs and are not approved on any record until translated.
  locales: ['fr-FR', 'en-GB', 'de-DE', 'it-IT'],
  defaultLocale: 'fr-FR',
  statutoryLocale: 'fr-FR',
  paper: 'a4',
  taxYear: { startMonth: 1, startDay: 1, basisKey: 'ytd.basis.calendar_year' },
  payFrequency: 'monthly',
  entity: {
    legalName: 'Avenlo France SAS',
    tradingName: 'Avenlo Group',
    address: { lines: ['18 rue Servient'], city: 'Lyon', region: 'Auvergne-Rhône-Alpes', postalCode: '69003', country: 'FR' },
    registrations: [
      { key: 'siret', valueMasked: '••• ••• ••• 00017' },
      { key: 'naf', valueMasked: '70.22Z' },
      { key: 'convention_collective', valueMasked: 'Bureaux d’études techniques (Syntec) — IDCC 1486' },
    ],
  },
  // The French statement has several distinct net concepts. "Net payé" is both
  // the headline net and the amount actually transferred.
  primaryTotal: 'net',
  payableTotal: 'net',
  totals: [
    // Salaire brut: all cash earnings (salaire de base, heures supplémentaires, primes).
    { id: 'gross', sum: { categories: ['earning'], cash: true }, required: true, prominent: true },
    // Earnings exempt from income tax (heures supplémentaires within the annual limit). Still in gross and in net social.
    { id: 'exemptEarnings', sum: { categories: ['earning'], taxable: false } },
    // Total des cotisations et contributions salariales: santé, retraite, CSG/CRDS. Excludes the income tax line and other retenues.
    { id: 'employeeContributions', sum: { categories: ['deduction'], groups: ['health', 'retirement', 'social'] }, required: true, prominent: true },
    // Helper totals for the net imposable formula.
    { id: 'csgCrdsNonDeductible', sum: { lineIds: ['d-csg-nd'] } },
    { id: 'employerHealthTaxable', sum: { lineIds: ['er-mutuelle'] } },
    // Montant net social — simplified, documented definition: brut − cotisations et contributions salariales. See content.totalsPlain.netSocial.
    { id: 'netSocial', formula: ['gross', '-', 'employeeContributions'], required: true, prominent: true },
    // Net imposable: brut − cotisations salariales déductibles (= all employee contributions, adding back the non-deductible CSG/CRDS)
    // + part patronale de la complémentaire santé (imposable) − éléments exonérés d’impôt (heures supplémentaires).
    { id: 'netTaxable', formula: ['gross', '-', 'employeeContributions', '+', 'csgCrdsNonDeductible', '+', 'employerHealthTaxable', '-', 'exemptEarnings'], required: true },
    { id: 'reimbursements', sum: { categories: ['reimbursement'] } },
    // Other retenues that are neither contributions nor tax (e.g. part salariale des titres-restaurant).
    { id: 'otherDeductions', sum: { categories: ['deduction'], excludeGroups: ['health', 'retirement', 'social', 'tax'] } },
    // Net à payer avant impôt sur le revenu.
    { id: 'netBeforeTax', formula: ['gross', '-', 'employeeContributions', '+', 'reimbursements', '-', 'otherDeductions'], required: true, prominent: true },
    // Impôt sur le revenu prélevé à la source (line d-pas).
    { id: 'withholdingTax', sum: { categories: ['deduction'], groups: ['tax'] }, required: true, prominent: true },
    // Net payé = net à payer avant impôt − impôt prélevé à la source. This is the amount transferred.
    { id: 'net', formula: ['netBeforeTax', '-', 'withholdingTax'], required: true, prominent: true, net: true, payable: true },
    // Total des cotisations et contributions patronales (excludes employer-funded benefits such as titres-restaurant).
    { id: 'employerContributions', sum: { categories: ['employer'], excludeGroups: ['benefit'] }, required: true },
    { id: 'employerBenefits', sum: { categories: ['employer'], groups: ['benefit'] } },
    // Coût total employeur = brut + cotisations patronales + avantages financés par l’employeur.
    { id: 'employerCost', formula: ['gross', '+', 'employerContributions', '+', 'employerBenefits'] },
  ],
  categoryOrder: ['earning', 'deduction', 'reimbursement', 'noncash', 'employer'],
  reward: { grossTotal: 'gross', deductionsTotal: 'employeeContributions', definitionKey: 'reward.definition.default' },
  // Original-language statutory names, shown beside the plain-language label whatever the interface language.
  statutoryTerms: {
    securite_sociale: { term: 'Sécurité sociale', locale: 'fr-FR' },
    net_social: { term: 'Montant net social', locale: 'fr-FR' },
    net_imposable: { term: 'Net imposable', locale: 'fr-FR' },
    net_avant_impot: { term: 'Net à payer avant impôt sur le revenu', locale: 'fr-FR' },
    net_paye: { term: 'Net payé', locale: 'fr-FR' },
    pas: { term: 'Prélèvement à la source (impôt sur le revenu)', locale: 'fr-FR' },
    csg_deductible: { term: 'CSG déductible de l’impôt sur le revenu', locale: 'fr-FR' },
    csg_crds_non_deductible: { term: 'CSG/CRDS non déductible de l’impôt sur le revenu', locale: 'fr-FR' },
    vieillesse_plafonnee: { term: 'Sécurité sociale – Vieillesse plafonnée', locale: 'fr-FR' },
    vieillesse_deplafonnee: { term: 'Sécurité sociale – Vieillesse déplafonnée', locale: 'fr-FR' },
    agirc_arrco: { term: 'Retraite complémentaire Agirc-Arrco', locale: 'fr-FR' },
    ceg: { term: 'Contribution d’équilibre général (CEG)', locale: 'fr-FR' },
    maladie: { term: 'Sécurité sociale – Maladie, maternité, invalidité, décès', locale: 'fr-FR' },
    atmp: { term: 'Accidents du travail – Maladies professionnelles', locale: 'fr-FR' },
    allocations_familiales: { term: 'Allocations familiales', locale: 'fr-FR' },
    assurance_chomage: { term: 'Assurance chômage', locale: 'fr-FR' },
    heures_supplementaires: { term: 'Heures supplémentaires', locale: 'fr-FR' },
    conges_payes: { term: 'Congés payés', locale: 'fr-FR' },
  },
  // Mandatory content of the bulletin de paie (Code du travail, art. R3243-1), mapped to the closest interface reason keys.
  requiredFields: [
    { path: 'employer.legalName', reasonKey: 'req.employer_identity' },
    { path: 'employer.registrations[siret]', reasonKey: 'req.tax_identifiers' },
    { path: 'employer.registrations[convention_collective]', reasonKey: 'req.occupation' },
    { path: 'employee.displayName', reasonKey: 'req.employee_identity' },
    { path: 'employee.occupation', reasonKey: 'req.occupation' },
    { path: 'employee.classification', reasonKey: 'req.occupation' },
    { path: 'document.period', reasonKey: 'req.pay_period' },
    { path: 'lines[earning:regular].hours', reasonKey: 'req.hours' },
    { path: 'lines[earning].rate', reasonKey: 'req.wage_rate' },
    { path: 'lines[earning:overtime]', reasonKey: 'req.overtime' },
    { path: 'totals.gross', reasonKey: 'req.gross' },
    { path: 'lines[deduction:retirement]', reasonKey: 'req.social_contributions' },
    { path: 'lines[deduction:social]', reasonKey: 'req.social_contributions' },
    { path: 'lines[deduction]', reasonKey: 'req.deductions_itemised' },
    { path: 'lines[employer]', reasonKey: 'req.employer_contributions' },
    { path: 'totals.netSocial', reasonKey: 'req.net_concepts' },
    { path: 'totals.netTaxable', reasonKey: 'req.taxable_base' },
    { path: 'totals.netBeforeTax', reasonKey: 'req.net_concepts' },
    { path: 'lines[deduction:tax]', reasonKey: 'req.deductions_itemised' },
    { path: 'totals.net', reasonKey: 'req.net' },
    { path: 'document.payDate', reasonKey: 'req.pay_date' },
    { path: 'time.leave.balances', reasonKey: 'req.leave_balances' },
    { path: 'profile.statutoryTerms', reasonKey: 'req.statutory_terms' },
  ],
  requiredDisclosures: ['record_keeping', 'service_public_reference', 'net_social_notice'],
  pack: {
    effectiveFrom: '2026-01-01',
    reviewStatus: 'not-required',
    reviewOwner: 'Unassigned — requires French payroll (gestionnaire de paie) and qualified local review before issuance',
    sources: [
      { title: 'Ministère du Travail — Le bulletin de paie', url: 'https://travail-emploi.gouv.fr/droit-du-travail/la-remuneration/article/le-bulletin-de-paie' },
      { title: 'Légifrance — Code du travail (bulletin de paie : articles L3243-1 et suivants, R3243-1 et suivants)', url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050/' },
      { title: 'service-public.fr — Bulletin de paie (fiche F559)', url: 'https://www.service-public.fr/particuliers/vosdroits/F559' },
      { title: 'Bulletin officiel de la Sécurité sociale (BOSS) — rubrique Montant net social', url: 'https://boss.gouv.fr/' },
      { title: 'economie.gouv.fr — Le prélèvement à la source de l’impôt sur le revenu', url: 'https://www.economie.gouv.fr/prelevement-a-la-source' },
    ],
    notes: 'Statement structure follows the bulletin de paie simplifié rubrics (santé, retraite, famille, assurance chômage, autres contributions, CSG/CRDS, montant net social, net à payer avant impôt, impôt prélevé à la source, net payé) as a design reference. All statutory contribution and tax amounts are supplied by payroll with their basis; no legal rate is encoded. The montant net social and net imposable formulas are simplified, documented definitions over the lines present in the record (no benefits in kind, no retraite supplémentaire) and require review against the BOSS doctrine before issuance. The réduction de cotisations salariales on heures supplémentaires and the PAS rate mention are not modelled. Content packs: fr-FR (statutory language) and en-GB are written; de-DE and it-IT are placeholder stubs.',
  },
  modules: { timeLeave: true, totalReward: true },
};
