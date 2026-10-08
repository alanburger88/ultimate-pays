/**
 * Interface language runtime. Packs are flat { key: string } maps.
 *  - {name} placeholders are interpolated from params
 *  - plural forms use Intl.PluralRules: key.one / key.other (etc.) with params.count
 *  - a missing key falls back to the fallback pack and is recorded (never silent in dev)
 */
const state = {
  locale: 'en-CA',
  pack: {},
  fallbackLocale: 'en-CA',
  fallbackPack: {},
  missing: new Set(),
  fallbackUsed: new Set(),
  pluralRules: null,
  listeners: new Set(),
  moduleDefaults: {},
};

/**
 * UI modules may register English defaults for keys they introduce without editing the
 * reference pack (avoids concurrent edits). The consolidation script moves them into
 * en-CA.js before translation. Keys already in a pack are never overridden.
 */
export function registerStrings(strings) {
  for (const [k, v] of Object.entries(strings)) if (!(k in state.moduleDefaults)) state.moduleDefaults[k] = v;
}
export function moduleDefaults() { return { ...state.moduleDefaults }; }

export function setLanguage({ locale, pack, fallbackLocale, fallbackPack }) {
  state.locale = locale;
  state.pack = pack || {};
  state.fallbackLocale = fallbackLocale || locale;
  state.fallbackPack = fallbackPack || {};
  state.pluralRules = new Intl.PluralRules(locale);
  state.missing.clear();
  state.fallbackUsed.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const fn of state.listeners) fn(locale);
}

export function onLanguageChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
export function currentLocale() { return state.locale; }
export function fallbackLocale() { return state.fallbackLocale; }
export function missingKeys() { return Array.from(state.missing); }
export function fallbackKeys() { return Array.from(state.fallbackUsed); }

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined || params[name] === null ? m : String(params[name])));
}

function lookup(key) {
  if (Object.prototype.hasOwnProperty.call(state.pack, key)) return state.pack[key];
  if (Object.prototype.hasOwnProperty.call(state.fallbackPack, key)) {
    state.fallbackUsed.add(key);
    return state.fallbackPack[key];
  }
  if (Object.prototype.hasOwnProperty.call(state.moduleDefaults, key)) return state.moduleDefaults[key];
  return null;
}

export function has(key) {
  return Object.prototype.hasOwnProperty.call(state.pack, key) || Object.prototype.hasOwnProperty.call(state.fallbackPack, key) || Object.prototype.hasOwnProperty.call(state.moduleDefaults, key);
}

/** Translate a key. t('key', {count: 3}) picks key.one/key.other according to the locale's plural rules. */
export function t(key, params) {
  let template = null;
  if (params && typeof params.count === 'number' && state.pluralRules) {
    const category = state.pluralRules.select(params.count);
    template = lookup(`${key}.${category}`);
    if (template === null && category !== 'other') template = lookup(`${key}.other`);
  }
  if (template === null) template = lookup(key);
  if (template === null) {
    state.missing.add(key);
    return `⟦${key}⟧`;
  }
  return interpolate(template, params);
}

/** Translate with an explicit pack (used by exports that render in a chosen language without switching the UI). */
export function tIn(pack, fallbackPack, key, params) {
  let template = Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : (Object.prototype.hasOwnProperty.call(fallbackPack, key) ? fallbackPack[key] : null);
  if (template === null) return `⟦${key}⟧`;
  return interpolate(template, params);
}

/** Pack coverage report: keys present in reference but missing in pack, and extras. */
export function coverage(pack, reference) {
  const refKeys = Object.keys(reference);
  const missing = refKeys.filter((k) => !Object.prototype.hasOwnProperty.call(pack, k) || pack[k] === '' || pack[k] === null);
  const extra = Object.keys(pack).filter((k) => !Object.prototype.hasOwnProperty.call(reference, k));
  const untranslated = refKeys.filter((k) => Object.prototype.hasOwnProperty.call(pack, k) && pack[k] === reference[k] && reference[k].length > 12 && !/^[\d\s%:.,–—-]+$/.test(reference[k]));
  return { missing, extra, untranslated, total: refKeys.length };
}

export const LANGUAGE_NAMES = {
  'en-CA': 'English (Canada)',
  'fr-CA': 'Français (Canada)',
  'en-ZA': 'English (South Africa)',
  'af-ZA': 'Afrikaans',
  'zu-ZA': 'isiZulu',
  'xh-ZA': 'isiXhosa',
  'en-GB': 'English (UK)',
  'fr-FR': 'Français (France)',
  'de-DE': 'Deutsch',
  'it-IT': 'Italiano',
};
