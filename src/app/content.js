/**
 * Access to governed record content (profile content packs): line labels,
 * plain-language explanations, statutory terms, glossary, disclosures, policies.
 * Content is prepared per profile and per approved language; it is never
 * generated or rewritten at runtime. Missing translations fall back to the
 * profile's default language and the fallback is recorded for disclosure.
 */
export function createContent({ profile, contents, locale }) {
  const primary = contents[locale] || null;
  const fallback = contents[profile.defaultLocale] || Object.values(contents)[0] || {};
  const fallbackUsed = new Set();
  const missing = new Set();
  const effectiveLocale = primary ? locale : profile.defaultLocale;

  function pick(section, key) {
    const a = primary && primary[section] ? primary[section][key] : undefined;
    if (a !== undefined) return a;
    const b = fallback[section] ? fallback[section][key] : undefined;
    if (b !== undefined) { fallbackUsed.add(`${section}.${key}`); return b; }
    missing.add(`${section}.${key}`);
    return undefined;
  }

  const api = {
    locale: effectiveLocale,
    isFallbackLocale: !primary,
    fallbackUsed: () => Array.from(fallbackUsed),
    missing: () => Array.from(missing),
    /** Line label object: { label, plain, statutory? } */
    line(key) { return pick('lines', key) || { label: key, plain: '' }; },
    lineLabel(line) { const c = api.line(line.key); return line.labelOverride || c.label || line.key; },
    linePlain(line) { return api.line(line.key).plain || ''; },
    /** Statutory term in its required language, if the profile defines one for this key. */
    statutory(key) {
      const terms = profile.statutoryTerms || {};
      return terms[key] || null;
    },
    total(id) { return pick('totals', id) || id; },
    totalPlain(id) { return pick('totalsPlain', id) || ''; },
    glossary(termKey) { return pick('glossary', termKey) || null; },
    glossaryAll() { return { ...(fallback.glossary || {}), ...((primary && primary.glossary) || {}) }; },
    disclosure(key) { return pick('disclosures', key) || null; },
    explanation(key) { return pick('explanations', key) || null; },
    policy(id) { return pick('policies', id) || null; },
    benefit(key) { return pick('benefits', key) || { label: key }; },
    leaveType(key) { return pick('leaveTypes', key) || { label: key }; },
    entryType(key) { return pick('entryTypes', key) || { label: key }; },
    group(key) { return pick('groups', key) || key; },
    category(key) { return pick('categories', key) || key; },
    document(key) { return pick('document', key) || ''; },
    employerField(key) { return pick('employerFields', key) || key; },
    employeeField(key) { return pick('employeeFields', key) || key; },
    paymentMethod(key) { return pick('paymentMethods', key) || key; },
    adjustment(key) { return pick('adjustments', key) || { label: key }; },
    story(key) { return pick('story', key) || ''; },
    raw(section, key) { return pick(section, key); },
  };
  return api;
}
