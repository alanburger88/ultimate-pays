/**
 * Paylight bootstrap. Reads launch configuration, resolves the record/profile/
 * language, builds the shared `ctx`, renders the shell and mounts sections.
 */
import { h, clear, announce, prefersReducedMotion, icon } from './dom.js';
import { createStore } from './store.js';
import { setLanguage, t, LANGUAGE_NAMES } from './i18n.js';
import { createContent } from './content.js';
import { readLaunch, resolveConfig, orderSections, SECTION_IDS } from './config.js';
import { loadPrefs, savePrefs, loadStudioSettings, documentScope, loadSession, saveSession, clearSession, hasRetained, clearAllSessions } from './persist.js';
import { createRouter } from './router.js';
import { computeTotals, verifyRecord, rewardSummary, grossToNetFlow, varianceBridge, timeSummary } from './calc.js';
import * as money from './money.js';
import * as registry from '../data/index.js';
import { SECTIONS } from '../ui/sections/index.js';
import { renderMasthead, renderNav, renderFooter, renderLauncher, setOfflineBanner, syncThemeToggle } from '../ui/shell.js';
import { toast, closeAll, closePopover } from '../ui/components/overlay.js';
import { openLumi } from '../ui/lumi.js';
import { openStory, narrationScript } from '../ui/story.js';
import { renderTray } from '../ui/tray.js';
import { openQuery } from '../ui/query.js';
import { openMine } from '../ui/mine.js';
import { openCalc } from '../ui/calc-dialog.js';
import { openTerm } from '../ui/components/common.js';
import { hasStudio, openStudio } from '../ui/studio.js';
import { renderGate } from '../ui/gate.js';
import { exportPdf, exportXlsx, exportIcs, buildPrintView } from '../export/index.js';
import { createAssistant } from '../adapters/assistant.js';
import { createQueryService } from '../adapters/queries.js';
import { walletProviders } from '../adapters/wallet/index.js';
import { createIdentity } from '../adapters/identity.js';
import { createVerification } from '../adapters/verification.js';

const appEl = document.getElementById('app');
let current = null; // { ctx, unsubscribe[] }
let lastScope = null; // document scope shown last in this page

function applyAppearance(presentation) {
  const root = document.documentElement;
  root.dataset.theme = presentation.theme || 'system';
  root.dataset.density = presentation.density || 'comfortable';
  root.dataset.privacy = presentation.privacyMode ? 'on' : 'off';
  root.dataset.motion = presentation.animation === false || presentation.lowData ? 'off' : 'on';
  if (presentation.branding && presentation.branding.accent) root.style.setProperty('--pl-accent', presentation.branding.accent); else root.style.removeProperty('--pl-accent');
  syncThemeToggle();
}

// When the theme follows the device, the toggle follows the device too.
if (window.matchMedia) {
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => syncThemeToggle();
  if (mqDark.addEventListener) mqDark.addEventListener('change', onScheme); else if (mqDark.addListener) mqDark.addListener(onScheme);
}

function loadUserWay() {
  if (document.getElementById('pl-userway') || window.__paylightUserWay) return;
  window.__paylightUserWay = true;
  // UserWay widget: the only accessibility widget on the page. Position 5 = bottom left.
  (function (d) {
    var s = d.createElement("script");
    s.id = "pl-userway";
    s.setAttribute("data-account", "B3W9A2mgGs");
    s.setAttribute("data-position", "5");
    s.setAttribute("src", "https://accessibilityserver.org/widget.js");
    s.async = true;
    s.onerror = function () { window.__paylightUserWayFailed = true; };
    (d.body || d.head).appendChild(s);
  })(document);
}

function buildDocument(config) {
  const profile = registry.profiles[config.profileId];
  const record = registry.findRecord(config.profileId, config.scenarioId);
  const contents = registry.contents[config.profileId] || {};
  const content = createContent({ profile, contents, locale: config.locale });
  const pack = registry.languages[config.locale] || {};
  // Fallback chain: the profile's default language, then the reference pack (en-CA). Fallback use is recorded for disclosure.
  const fallbackLocale = registry.languages[profile.defaultLocale] && Object.keys(registry.languages[profile.defaultLocale]).length ? profile.defaultLocale : 'en-CA';
  const fallbackPack = { ...(registry.languages['en-CA'] || {}), ...(registry.languages[fallbackLocale] || {}) };
  setLanguage({ locale: config.locale, pack, fallbackLocale, fallbackPack });
  const totals = computeTotals(record.lines, profile).totals;
  const latestPrior = (record.history || [])[0] || null;
  const computed = {
    totals,
    verify: verifyRecord(record, profile),
    reward: rewardSummary(record, profile),
    flow: grossToNetFlow(record, profile),
    bridge: latestPrior ? varianceBridge(record, latestPrior, profile) : null,
    time: timeSummary(record),
  };
  return { profile, record, content, locale: config.locale, registry, computed, fallbackLocale };
}

function renderConfigError(config, launch) {
  clear(appEl);
  appEl.dataset.loading = 'false';
  const profile = registry.profiles[config.profileId] || registry.profiles[registry.defaultProfileId];
  setLanguage({ locale: 'en-CA', pack: registry.languages['en-CA'], fallbackLocale: 'en-CA', fallbackPack: registry.languages['en-CA'] });
  const list = h('ul', null, config.errors.map((e) => h('li', null, t(e.key, e.params))));
  const actions = h('div', { class: 'pl-btn-group' });
  const hasLangError = config.errors.some((e) => e.key === 'config.unsupported_language' || e.key === 'config.language_pack_missing');
  if (hasLangError) {
    actions.appendChild(h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { const p = new URLSearchParams(location.hash.slice(1)); p.set('lang', profile.defaultLocale); location.hash = p.toString(); boot(); } } }, t('config.continue_default', { lang: LANGUAGE_NAMES[profile.defaultLocale] || profile.defaultLocale })));
  }
  if (config.errors.some((e) => e.key === 'config.unknown_region' || e.key === 'config.unknown_scenario' || e.key === 'config.unknown_preset')) {
    actions.appendChild(h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: () => { const p = new URLSearchParams(location.hash.slice(1)); p.delete('region'); p.delete('scenario'); p.delete('preset'); p.delete('lang'); p.set('region', registry.defaultProfileId); location.hash = p.toString(); boot(); } } }, t('config.continue_with', { region: registry.defaultProfileId })));
  }
  if (hasStudio) actions.appendChild(h('button', { class: 'pl-btn', type: 'button', on: { click: () => { const p = new URLSearchParams(location.hash.slice(1)); p.delete('region'); p.delete('lang'); p.delete('scenario'); p.set('studio', '1'); location.hash = p.toString(); boot(); } } }, t('config.open_studio')));
  appEl.appendChild(h('main', { class: 'pl-wrap', style: { padding: '48px 16px' } },
    h('div', { class: 'pl-card pl-card-lg stack', role: 'alert', style: { maxWidth: '560px', margin: '0 auto' } },
      h('h1', null, t('config.error_title')), list, actions,
      h('p', { class: 'muted small' }, 'paylight.html#region=ZA&lang=xh-ZA&preset=complete'),
    )));
}

export function boot() {
  // The accessibility widget is available on every screen, including configuration errors and the access screen.
  loadUserWay();
  if (current) { for (const u of current.unsubscribe) u(); current = null; closeAll(); closePopover(); }
  const { launch, notices: launchNotices } = readLaunch();
  const prefs = loadPrefs();
  const studioSettings = registry.packageKind === 'employee' ? null : loadStudioSettings();
  const config = resolveConfig({ launch, prefs, studioSettings, registry });
  applyAppearance(config.presentation);
  if (config.studio && hasStudio && !launch.region && !launch.scenario && !launch.lang && studioSettings === null && launch.studio) {
    // Studio opened explicitly: render the document first, then open Studio on top.
  }
  if (!config.ok) { renderConfigError(config, launch); if (config.studio && hasStudio) openStudio(makeMinimalCtx(config)); return; }
  const doc = buildDocument(config);
  const scope = documentScope(doc.record);
  // Switching to another recipient's record in this page (fragment or Studio) clears the previous
  // recipient's selections, notes, drafts and chat. A language change keeps the same record and scope.
  if (lastScope && lastScope !== scope && registry.packageKind !== 'employee') clearAllSessions();
  lastScope = scope;
  const restored = loadSession(scope);
  // A deep-linked section wins; a line without a section opens Pay details; otherwise return to where the employee was.
  const restoredNav = (restored && restored.nav) || {};
  const startSection = (launch.section && SECTION_IDS.includes(launch.section)) ? launch.section : (config.initialLine ? 'pay-details' : (restoredNav.section || config.startSection));

  const store = createStore({
    config,
    prefs: { presentation: { ...config.presentation }, acknowledged: prefs.acknowledged || {} },
    nav: { section: startSection, lineId: config.initialLine || restoredNav.lineId || null, view: launch.view || restoredNav.view || null, filters: restoredNav.filters || { query: '', category: 'all', sort: 'default' }, entryIds: restoredNav.entryIds || null, entryDate: restoredNav.entryDate || null, chartViews: restoredNav.chartViews || {} },
    selection: (restored && restored.selection) || { lineIds: [], entryIds: [], tags: {}, notes: {} },
    queries: { drafts: (restored && restored.queries && restored.queries.drafts) || [], submitted: (restored && restored.queries && restored.queries.submitted) || [], active: null },
    lumi: { open: false, messages: [], contextLineIds: null, busy: false },
    story: { open: false },
    online: navigator.onLine,
    retainDrafts: Boolean(restored && restored.retained) || hasRetained(scope),
    notices: [...launchNotices, ...config.notices],
  });

  const identity = createIdentity({ integration: config.presentation.integrations.identity, documentRef: { id: doc.record.document.id, version: doc.record.document.version } });
  const tokenProvider = () => identity.token();
  const services = {
    assistant: createAssistant({ integration: config.presentation.integrations.assistant, tokenProvider }),
    queries: createQueryService({ integration: config.presentation.integrations.queries, tokenProvider }),
    wallets: walletProviders({ integration: config.presentation.integrations.wallet || {}, record: doc.record, profile: doc.profile, tokenProvider }),
    identity,
    verification: createVerification({ integration: config.presentation.integrations.verification, tokenProvider }),
  };

  current = { ctx: null, unsubscribe: [] };
  const ctx = createContext({ store, doc, config, services, scope });
  // Read-only hook for the narration build step: the story's spoken text for the statement on screen.
  window.__paylight = Object.freeze({ narrationScript: () => narrationScript(ctx), locale: ctx.locale, ref: `${doc.record.document.id}@${doc.record.document.version}` });
  current.ctx = ctx;
  renderApp(ctx);
  if (restored && (restored.selection.lineIds.length || restored.nav.lineId)) toast(t('notice.restored'));
  for (const n of store.get().notices) if (n.key && n.level !== 'error') toast(t(n.key, n.params), { kind: n.level === 'warning' ? 'error' : 'info', duration: 8000 });
  if (config.studio && hasStudio) openStudio(ctx);
}

function makeMinimalCtx(config) {
  const write = (cfg) => { const p = new URLSearchParams(location.hash.slice(1)); for (const [k, v] of Object.entries(cfg)) { if (v === null || v === undefined || v === false || v === '') p.delete(k); else p.set(k, v === true ? '1' : v); } history.replaceState(null, '', `#${p.toString()}`); };
  return { t, config, registry, services: null, store: createStore({ config, prefs: { presentation: config.presentation } }), doc: null, actions: { reboot: boot, toast, reconfigure: (cfg) => { write(cfg); boot(); } } };
}

function createContext({ store, doc, config, services, scope }) {
  const fmtOpts = () => ({ currency: doc.record.document.currency, locale: doc.locale });
  const fmt = {
    money: (minor, o = {}) => money.formatMoney(minor, { ...fmtOpts(), ...o, currency: o.currency || doc.record.document.currency }),
    amount: (minor, o = {}) => money.formatAmount(minor, { ...fmtOpts(), ...o }),
    hours: (hh, o = {}) => money.formatHours(hh, { locale: doc.locale, ...o }),
    minutesAsHours: (m) => money.formatMinutesAsHours(m, { locale: doc.locale }),
    days: (hundredths) => `${money.formatNumber(hundredths / 100, { locale: doc.locale, digits: 2 })} ${t('common.days')}`,
    number: (n, digits = 0) => money.formatNumber(n, { locale: doc.locale, digits }),
    percent: (permyriad, digits = 2) => money.formatPercent(permyriad, { locale: doc.locale, digits }),
    rate: (minor, per = null) => money.formatRate(minor, { ...fmtOpts(), per }),
    date: (iso, style) => money.formatDate(iso, { locale: doc.locale, style }),
    // Issue times are shown in the issuer's zone (profile.timeZone); { local: true } for the viewer's own clock.
    dateTime: (iso, o = {}) => money.formatDateTime(iso, { locale: doc.locale, timeZone: o.local ? undefined : doc.profile.timeZone }),
    period: (p) => money.formatPeriod(p, { locale: doc.locale }),
  };

  const ctx = {
    store, doc, config, services, scope, t, fmt,
    get content() { return doc.content; },
    get locale() { return doc.locale; },
    registry,
    theme: () => store.get().prefs.presentation.theme,
    privacy: () => Boolean(store.get().prefs.presentation.privacyMode),
    lowData: () => Boolean(store.get().prefs.presentation.lowData),
    reducedMotion: () => prefersReducedMotion() || store.get().prefs.presentation.animation === false || Boolean(store.get().prefs.presentation.lowData),
    modules: () => config.modules,
    sections: () => {
      const order = orderSections(store.get().prefs.presentation.sectionOrder || config.sectionOrder, config.modules);
      return order.map((id) => SECTIONS.find((s) => s.id === id)).filter(Boolean);
    },
    line: (id) => doc.record.lines.find((l) => l.id === id) || null,
    selectedLines: () => store.get().selection.lineIds.map((id) => doc.record.lines.find((l) => l.id === id)).filter(Boolean),
    actions: null,
  };

  const actions = {
    go(sectionId, { lineId = null, view = null, push = false, focus = true } = {}) {
      const sections = ctx.sections();
      if (!sections.some((s) => s.id === sectionId)) sectionId = sections[0].id;
      const from = store.get().nav.section;
      if (from !== sectionId) placeMemory.set(from, window.scrollY);
      store.update('nav', (nav) => ({ ...nav, section: sectionId, lineId, view }));
      router.write({ section: sectionId, lineId, view }, { push });
      if (focus) requestAnimationFrame(() => focusSection(sectionId, { lineId, view }));
      announce(t('a11y.section_changed', { section: t((sections.find((s) => s.id === sectionId) || {}).titleKey || 'nav.my_pay') }));
    },
    focusLine(lineId, { section = 'pay-details' } = {}) { actions.go(section, { lineId, push: true }); },
    showEntries(entryIds, { date = null } = {}) { store.update('nav', (nav) => ({ ...nav, entryIds, entryDate: date })); actions.go('time-leave', { push: true, lineId: null }); },
    toggleSelect(lineId) {
      const sel = store.get().selection;
      const has = sel.lineIds.includes(lineId);
      store.set({ selection: { ...sel, lineIds: has ? sel.lineIds.filter((x) => x !== lineId) : [...sel.lineIds, lineId] } });
      const line = ctx.line(lineId);
      announce(t(has ? 'select.line_deselected' : 'select.line_selected', { line: line ? doc.content.lineLabel(line) : lineId }));
    },
    select(lineIds) { const sel = store.get().selection; store.set({ selection: { ...sel, lineIds: Array.from(new Set([...sel.lineIds, ...lineIds])) } }); },
    deselect(lineIds) { const sel = store.get().selection; store.set({ selection: { ...sel, lineIds: sel.lineIds.filter((x) => !lineIds.includes(x)) } }); },
    toggleSelectEntry(entryId) { const sel = store.get().selection; const has = sel.entryIds.includes(entryId); store.set({ selection: { ...sel, entryIds: has ? sel.entryIds.filter((x) => x !== entryId) : [...sel.entryIds, entryId] } }); },
    clearSelection() { const sel = store.get().selection; store.set({ selection: { ...sel, lineIds: [], entryIds: [] } }); },
    setTag(lineId, tagId) { const sel = store.get().selection; const tags = { ...sel.tags }; if (tagId) tags[lineId] = tagId; else delete tags[lineId]; store.set({ selection: { ...sel, tags } }); },
    setNote(lineId, note) { const sel = store.get().selection; const notes = { ...sel.notes }; if (note && note.trim()) notes[lineId] = note.slice(0, 1000); else delete notes[lineId]; store.set({ selection: { ...sel, notes } }); },
    openLumi(opts = {}) { if (!config.modules.lumi) return; const launcher = document.getElementById('pl-lumi-launcher'); if (launcher) launcher.setAttribute('aria-expanded', 'true'); store.update('lumi', (l) => ({ ...l, open: true })); openLumi(ctx, opts); },
    lumiClosed() { const launcher = document.getElementById('pl-lumi-launcher'); if (launcher) launcher.setAttribute('aria-expanded', 'false'); store.update('lumi', (l) => ({ ...l, open: false })); },
    openStory(opts = {}) { if (!config.modules.story) return; openStory(ctx, opts); },
    openQuery(opts = {}) { if (!config.modules.queries) return; openQuery(ctx, opts); },
    openCalc(lineId) { openCalc(ctx, lineId); },
    openTerm(termKey, anchor) { openTerm(ctx, termKey, anchor); },
    openMine() { if (!config.modules.personalise) return; openMine(ctx); },
    openStudio() { if (hasStudio) openStudio(ctx); },
    toast(message, opts) { return toast(message, opts); },
    setPrefs(partial, { persist = true } = {}) {
      const prefs = store.get().prefs;
      const presentation = { ...prefs.presentation, ...partial };
      store.set({ prefs: { ...prefs, presentation } });
      if (persist) savePrefs({ presentation: pickPersistable(presentation), acknowledged: prefs.acknowledged });
      applyAppearance(presentation);
      if ('privacyMode' in partial && partial.privacyMode) toast(t('notice.privacy_on'));
    },
    resetPrefs() {
      // Defaults are what the launch configuration, Studio settings and bundled defaults give WITHOUT any saved preference.
      const prefs = store.get().prefs;
      const { launch } = readLaunch();
      const fresh = resolveConfig({ launch, prefs: {}, studioSettings: registry.packageKind === 'employee' ? null : loadStudioSettings(), registry });
      const presentation = { ...fresh.presentation };
      store.set({ prefs: { ...prefs, presentation } });
      savePrefs({ presentation: {}, acknowledged: prefs.acknowledged });
      applyAppearance(presentation);
    },
    setTheme(theme) { actions.setPrefs({ theme }); toast(t('notice.theme_changed', { theme: t(`theme.${theme}`) })); },
    setDensity(density) { actions.setPrefs({ density }); },
    setLocale(locale) {
      if (!config.approvedLocales.includes(locale)) return;
      const prefs = store.get().prefs;
      savePrefs({ presentation: pickPersistable({ ...prefs.presentation, lang: locale }), acknowledged: prefs.acknowledged });
      router.writeConfig({ lang: locale });
      boot();
      toast(t('notice.language_changed', { lang: LANGUAGE_NAMES[locale] || locale }));
    },
    setRetainDrafts(on) { store.set({ retainDrafts: Boolean(on) }); persist(); },
    clearLocal() { clearSession(scope); store.set({ selection: { lineIds: [], entryIds: [], tags: {}, notes: {} }, queries: { drafts: [], submitted: [], active: null }, retainDrafts: false }); toast(t('record.cleared')); },
    saveQueries(queries) { store.set({ queries }); },
    exportPdf: () => exportPdf(ctx),
    exportXlsx: (opts) => exportXlsx(ctx, opts),
    exportSelected: () => exportXlsx(ctx, { selectedOnly: true }),
    exportIcs: () => exportIcs(ctx),
    print: () => { window.print(); },
    reboot: () => boot(),
    reconfigure(cfg) { router.writeConfig(cfg); boot(); },
  };
  ctx.actions = actions;

  const router = createRouter({
    onNavigate: (nav) => {
      // Browser back/forward: re-render, then put focus and scroll back where the employee was.
      const from = store.get().nav.section;
      const section = nav.section || from;
      if (section !== from) placeMemory.set(from, window.scrollY);
      store.update('nav', (n) => ({ ...n, section, lineId: nav.lineId, view: nav.view }));
      requestAnimationFrame(() => focusSection(section, { lineId: nav.lineId, view: nav.view }));
    },
    onConfigChange: () => boot(),
  });
  ctx.router = router;

  function persist() { saveSession(scope, store.get(), { retain: store.get().retainDrafts }); }
  current.unsubscribe.push(store.subscribe(persist, ['nav', 'selection', 'queries', 'retainDrafts']));
  // Keep the fragment honest when a module clears or changes nav.lineId/view without calling go().
  current.unsubscribe.push(store.subscribe((s) => { router.write({ section: s.nav.section, lineId: s.nav.lineId, view: s.nav.view }); }, ['nav']));
  // If the record only has one language, keep the fragment honest.
  router.write({ section: store.get().nav.section, lineId: store.get().nav.lineId, view: store.get().nav.view });
  return ctx;
}

function pickPersistable(p) {
  const out = {};
  for (const k of ['theme', 'density', 'emphasis', 'lang', 'sectionOrder', 'startSection', 'pins', 'privacyMode', 'lowData', 'animation', 'narration']) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

/** Scroll position per section for the life of the page, so returning to a section restores the employee's place. */
const placeMemory = new Map();

/** Focus a section after navigation without losing the employee's place. A requested line is handled by mountSection. */
function focusSection(sectionId, { lineId = null, view = null } = {}) {
  const el = document.getElementById(`section-${sectionId}`);
  if (!el) return;
  if (lineId) return;
  if (view === 'totals') {
    const target = el.querySelector('.pl-dtotals');
    if (target) { const heading = target.querySelector('h2, h3') || target; if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1'); target.scrollIntoView({ block: 'start' }); heading.focus({ preventScroll: true }); return; }
  }
  el.focus({ preventScroll: true });
  window.scrollTo({ top: placeMemory.has(sectionId) ? placeMemory.get(sectionId) : 0, behavior: 'auto' });
}

function renderApp(ctx) {
  const { store } = ctx;
  clear(appEl);
  appEl.dataset.loading = 'false';
  document.title = `${t('app.name')} — ${ctx.doc.content.document('title')} — ${ctx.doc.record.employee.displayName}`;

  const start = () => {
    clear(appEl);
    const main = h('main', { class: 'pl-main', id: 'pl-main', tabindex: '-1' }, h('div', { class: 'pl-wrap', id: 'pl-section-host' }));
    const trayHost = h('div', { id: 'pl-tray-host' });
    appEl.append(
      h('a', { class: 'pl-skip', href: '#pl-main', on: { click: (e) => { e.preventDefault(); const s = document.querySelector('#pl-section-host .pl-section') || document.getElementById('pl-main'); if (s) s.focus(); } } }, t('app.skip_to_content')),
      h('a', { class: 'pl-skip', href: '#pl-nav', on: { click: (e) => { e.preventDefault(); const tab = document.querySelector('.pl-tab[aria-selected="true"]'); const mobile = document.querySelector('.pl-nav-mobile .pl-btn'); const target = tab && tab.offsetParent ? tab : mobile; if (target) target.focus(); } } }, t('app.skip_to_nav')),
      renderMasthead(ctx),
      renderNav(ctx),
      main,
      renderFooter(ctx),
      trayHost,
      ctx.config.modules.lumi ? renderLauncher(ctx) : null,
      h('div', { class: 'pl-userway-reserve', aria: { hidden: 'true' } }),
      h('div', { id: 'pl-print-host', class: 'pl-print-only' }),
    );
    measureMasthead();
    mountSection(ctx);
    renderTrayInto(ctx, trayHost);
    setOfflineBanner(ctx, appEl, !navigator.onLine);
    loadUserWay();
    window.setTimeout(() => { if (window.__paylightUserWayFailed) announce(t('a11y.userway_blocked')); }, 4000);
  };

  if (ctx.config.presentation.accessGate && !sessionStorage.getItem('paylight.gate')) {
    appEl.appendChild(renderGate(ctx, () => { try { sessionStorage.setItem('paylight.gate', '1'); } catch (e) { /* ignore */ } start(); }));
  } else start();

  const unsub = [];
  unsub.push(store.subscribe((s, changed) => {
    if (changed.has('nav')) { syncNav(ctx); mountSection(ctx); }
    if (changed.has('selection')) { const host = document.getElementById('pl-tray-host'); if (host) renderTrayInto(ctx, host); if (!changed.has('nav')) remountIfListens(ctx, 'selection'); }
    if (changed.has('prefs')) { const old = document.querySelector('.pl-nav'); if (old) old.replaceWith(renderNav(ctx)); const m = document.querySelector('.pl-masthead'); if (m) m.replaceWith(renderMasthead(ctx)); measureMasthead(); mountSection(ctx); }
    if (changed.has('queries')) remountIfListens(ctx, 'queries');
  }));
  current.unsubscribe.push(...unsub);

  const onOnline = () => { store.set({ online: true }); setOfflineBanner(ctx, appEl, false); };
  const onOffline = () => { store.set({ online: false }); setOfflineBanner(ctx, appEl, true); };
  window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
  current.unsubscribe.push(() => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); });

  const onKey = (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's') && hasStudio) { e.preventDefault(); ctx.actions.openStudio(); }
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l') && ctx.config.modules.lumi) { e.preventDefault(); ctx.actions.openLumi(); }
  };
  document.addEventListener('keydown', onKey);
  current.unsubscribe.push(() => document.removeEventListener('keydown', onKey));

  const onBeforePrint = () => { const host = document.getElementById('pl-print-host'); if (!host) return; clear(host); const view = buildPrintView(ctx); if (view) host.appendChild(view); };
  const onAfterPrint = () => { const host = document.getElementById('pl-print-host'); if (host) clear(host); };
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  current.unsubscribe.push(() => { window.removeEventListener('beforeprint', onBeforePrint); window.removeEventListener('afterprint', onAfterPrint); });
  const onResize = () => measureMasthead();
  window.addEventListener('resize', onResize);
  current.unsubscribe.push(() => window.removeEventListener('resize', onResize));
}

function measureMasthead() {
  const root = document.documentElement;
  const m = document.querySelector('.pl-masthead');
  const n = document.querySelector('.pl-nav');
  if (m) root.style.setProperty('--pl-masthead-h', `${m.offsetHeight}px`);
  // Height of whatever stays stuck at the top, so focused elements scroll clear of it (scroll-padding-top).
  let sticky = 0;
  if (m && getComputedStyle(m).position === 'sticky') sticky += m.offsetHeight;
  if (n && getComputedStyle(n).position === 'sticky') sticky += n.offsetHeight;
  root.style.setProperty('--pl-sticky-h', `${sticky}px`);
}

/** While a text field has focus on a narrow or short screen, floating controls step aside (see base.css). */
function isTextField(el) { return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(el.type))); }
document.addEventListener('focusin', (e) => { if (isTextField(e.target) && window.matchMedia('(max-width: 720px), (max-height: 500px)').matches) document.documentElement.dataset.typing = 'true'; });
document.addEventListener('focusout', (e) => { if (isTextField(e.target)) delete document.documentElement.dataset.typing; });

function syncNav(ctx) {
  const current = ctx.store.get().nav.section;
  document.querySelectorAll('.pl-tab').forEach((b) => { const on = b.dataset.section === current; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const mobile = document.querySelector('.pl-nav-mobile');
  if (mobile) { const s = ctx.sections().find((x) => x.id === current); const b = mobile.querySelector('b'); if (b && s) b.textContent = t(s.titleKey); }
}

const LISTENERS = { 'pay-details': ['selection'], 'time-leave': ['selection'], 'record-actions': ['queries', 'selection'] };
function remountIfListens(ctx, key) {
  const section = ctx.store.get().nav.section;
  if ((LISTENERS[section] || []).includes(key)) mountSection(ctx);
}

function mountSection(ctx) {
  const host = document.getElementById('pl-section-host');
  if (!host) return;
  const nav = ctx.store.get().nav;
  const sections = ctx.sections();
  const def = sections.find((s) => s.id === nav.section) || sections[0];
  const active = document.activeElement;
  const focusKey = active && host.contains(active) ? (active.dataset.focusKey || active.id || null) : null;
  const scrollY = window.scrollY;
  let el;
  try { el = def.render(ctx); } catch (err) { console.error(err); el = h('div', { class: 'pl-notice', dataset: { kind: 'error' }, role: 'alert' }, h('div', null, `${t('common.error')}: ${err.message}`)); }
  const section = h('section', { class: 'pl-section', id: `section-${def.id}`, role: 'tabpanel', aria: { labelledby: `tab-${def.id}` }, tabindex: '-1', dataset: { section: def.id } }, el);
  clear(host);
  host.appendChild(section);
  if (focusKey) { const again = host.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`) || document.getElementById(focusKey); if (again) { again.focus({ preventScroll: true }); window.scrollTo({ top: scrollY }); } }
  // Scroll to and focus the requested line only when the request changes, never on every re-render.
  const lineKey = nav.lineId ? `${def.id}|${nav.lineId}` : null;
  if (lineKey && mountSection.lastLineKey !== lineKey) {
    mountSection.lastLineKey = lineKey;
    requestAnimationFrame(() => { const row = host.querySelector(`[data-line-id="${CSS.escape(nav.lineId)}"]`); if (row) { row.scrollIntoView({ block: 'center', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' }); row.classList.add('is-focus'); const f = row.querySelector('[data-line-focus]') || row; if (f.focus) f.focus({ preventScroll: true }); announce(t('a11y.line_focus', { line: (ctx.line(nav.lineId) && ctx.content.lineLabel(ctx.line(nav.lineId))) || nav.lineId })); } });
  } else if (!lineKey) {
    mountSection.lastLineKey = null;
    if (nav.lineId === null) { /* nothing to highlight */ }
  }
  if (nav.lineId) { const row = host.querySelector(`[data-line-id="${CSS.escape(nav.lineId)}"]`); if (row) row.classList.add('is-focus'); }
}

function renderTrayInto(ctx, host) {
  clear(host);
  const tray = renderTray(ctx);
  if (tray) host.appendChild(tray);
}

try { boot(); } catch (err) {
  console.error(err);
  clear(appEl);
  appEl.appendChild(h('div', { class: 'pl-wrap', style: { padding: '32px 16px' } }, h('div', { class: 'pl-notice', dataset: { kind: 'error' }, role: 'alert' }, h('div', null, `Paylight could not open the statement: ${err.message}`))));
}
