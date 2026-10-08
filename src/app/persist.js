/**
 * Storage boundaries.
 *  - Presentation preferences (non-sensitive) → localStorage "paylight.prefs.v1".
 *  - Interaction state scoped to one document (selection, tags, notes, drafts,
 *    place in the document) → sessionStorage by default; opt-in retention to
 *    localStorage with an explicit clear-delete action.
 *  - Payroll content, identifiers and chat transcripts are never written to
 *    browser storage.
 */
const PREFS_KEY = 'paylight.prefs.v1';
const STUDIO_KEY = 'paylight.studio.v1';
const SESSION_PREFIX = 'paylight.session.v1.';
const RETAINED_PREFIX = 'paylight.retained.v1.';

function safe(fn, fallback) {
  try { return fn(); } catch (err) { return fallback; }
}

export function loadPrefs() {
  return safe(() => JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'), {}) || {};
}

export function savePrefs(prefs) {
  const clean = { presentation: prefs.presentation || {}, acknowledged: prefs.acknowledged || {} };
  safe(() => localStorage.setItem(PREFS_KEY, JSON.stringify(clean)));
}

export function loadStudioSettings() {
  return safe(() => JSON.parse(localStorage.getItem(STUDIO_KEY) || 'null'), null);
}

export function saveStudioSettings(settings) {
  if (!settings) safe(() => localStorage.removeItem(STUDIO_KEY));
  else safe(() => localStorage.setItem(STUDIO_KEY, JSON.stringify(settings)));
}

/** Document scope key: a hash-free opaque identifier using the document id and version only (no personal data). */
export function documentScope(record) {
  return `${record.document.id}@${record.document.version}`;
}

export function loadSession(scope) {
  const fromSession = safe(() => JSON.parse(sessionStorage.getItem(SESSION_PREFIX + scope) || 'null'), null);
  if (fromSession) return { ...fromSession, retained: false };
  const retained = safe(() => JSON.parse(localStorage.getItem(RETAINED_PREFIX + scope) || 'null'), null);
  if (retained) return { ...retained, retained: true };
  return null;
}

export function saveSession(scope, state, { retain = false } = {}) {
  const payload = {
    nav: state.nav,
    selection: state.selection,
    queries: { drafts: state.queries.drafts, submitted: state.queries.submitted },
    savedAt: new Date().toISOString(),
  };
  safe(() => sessionStorage.setItem(SESSION_PREFIX + scope, JSON.stringify(payload)));
  if (retain) safe(() => localStorage.setItem(RETAINED_PREFIX + scope, JSON.stringify(payload)));
  else safe(() => localStorage.removeItem(RETAINED_PREFIX + scope));
}

export function clearSession(scope) {
  safe(() => sessionStorage.removeItem(SESSION_PREFIX + scope));
  safe(() => localStorage.removeItem(RETAINED_PREFIX + scope));
}

/** Remove every document-scoped interaction state (used when Studio switches scenario). */
export function clearAllSessions() {
  for (const store of [sessionStorage, localStorage]) {
    safe(() => {
      const keys = [];
      for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && (k.startsWith(SESSION_PREFIX) || k.startsWith(RETAINED_PREFIX))) keys.push(k); }
      keys.forEach((k) => store.removeItem(k));
    });
  }
}

export function hasRetained(scope) {
  return safe(() => localStorage.getItem(RETAINED_PREFIX + scope) !== null, false);
}
