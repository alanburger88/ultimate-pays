/**
 * Hash routing. The fragment carries launch configuration (region, lang,
 * preset, scenario, studio) and navigation (section, line). Navigation writes
 * use replaceState for drill-ins and pushState for section changes so the
 * browser back button returns the employee to where they were.
 */
const CONFIG_KEYS = ['region', 'lang', 'preset', 'scenario', 'studio', 'config', 'theme', 'density'];

export function parseHash(hash) {
  const params = new URLSearchParams((hash || '').replace(/^#/, ''));
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export function buildHash(current, nav) {
  const params = new URLSearchParams();
  for (const k of CONFIG_KEYS) if (current[k] !== undefined && current[k] !== null && current[k] !== '') params.set(k, current[k]);
  if (nav.section) params.set('section', nav.section);
  if (nav.lineId) params.set('line', nav.lineId);
  if (nav.view) params.set('view', nav.view);
  return `#${params.toString()}`;
}

export function createRouter({ onNavigate, onConfigChange }) {
  let last = parseHash(location.hash);
  let suppress = false;

  function configOf(obj) { const c = {}; for (const k of CONFIG_KEYS) if (obj[k] !== undefined) c[k] = obj[k]; return c; }

  window.addEventListener('hashchange', (e) => {
    if (suppress) { suppress = false; return; }
    // An in-page anchor (e.g. '#pl-main') is not configuration: restore the previous fragment and ignore it.
    const raw = location.hash.replace(/^#/, '');
    if (raw && !raw.includes('=')) {
      const prev = e && e.oldURL ? new URL(e.oldURL).hash : '';
      history.replaceState(null, '', prev || '#');
      return;
    }
    const next = parseHash(location.hash);
    const prevCfg = JSON.stringify(configOf(last));
    const nextCfg = JSON.stringify(configOf(next));
    last = next;
    if (prevCfg !== nextCfg) onConfigChange(next);
    else onNavigate({ section: next.section || null, lineId: next.line || null, view: next.view || null });
  });

  return {
    current: () => parseHash(location.hash),
    write(nav, { push = false } = {}) {
      const current = parseHash(location.hash);
      const hash = buildHash(current, nav);
      if (hash === location.hash) return;
      suppress = true;
      last = parseHash(hash);
      if (push) history.pushState(null, '', hash); else history.replaceState(null, '', hash);
      // pushState/replaceState do not fire hashchange; reset the suppress flag on next tick.
      window.setTimeout(() => { suppress = false; }, 0);
    },
    writeConfig(cfg) {
      const current = parseHash(location.hash);
      const params = new URLSearchParams();
      const merged = { ...current, ...cfg };
      for (const k of CONFIG_KEYS) if (merged[k] !== undefined && merged[k] !== null && merged[k] !== '' && merged[k] !== false) params.set(k, merged[k] === true ? '1' : merged[k]);
      for (const k of ['section', 'line', 'view']) if (merged[k]) params.set(k, merged[k]);
      suppress = true;
      last = parseHash(`#${params.toString()}`);
      history.replaceState(null, '', `#${params.toString()}`);
      window.setTimeout(() => { suppress = false; }, 0);
    },
  };
}
