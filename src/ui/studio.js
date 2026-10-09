/**
 * Presenter Studio (PRD §6.6). A large dialog that configures the presentation:
 * region profile, interface language, persona/scenario, preset, optional modules,
 * starting section, branding, density/appearance/emphasis/animation/narration,
 * integration endpoints, access gate, readiness register and a record summary.
 *
 * Studio never reads or writes record files and never changes a record's values.
 * It writes studio settings (localStorage, presenter bundles only) and reboots the
 * application through ctx.actions.reconfigure. Imported configuration is validated
 * with validatePresentation() and applied to the form only; nothing is executed.
 *
 * ctx.doc may be null when Studio opens from the configuration-error screen; the
 * region/language/scenario controls and Apply still work in that case.
 */
import { h, icon, announce, clear, uid } from '../app/dom.js';
import { registerStrings, LANGUAGE_NAMES } from '../app/i18n.js';
import { openDialog, confirmDialog, toast } from './components/overlay.js';
import { notice } from './components/common.js';
import { loadStudioSettings, saveStudioSettings, clearAllSessions } from '../app/persist.js';
import { validatePresentation, encodeShared, orderSections, SECTION_IDS, OPTIONAL_MODULES, DEFAULT_PRESENTATION, requiredModules, safeEndpoint } from '../app/config.js';
import { PRESETS } from '../app/presets.js';
import { verifyRecord } from '../app/calc.js';
import * as registry from '../data/index.js';

export const hasStudio = true;

registerStrings({
  'studio.section_setup': 'Record and language',
  'studio.section_presentation': 'Presentation',
  'studio.section_services': 'Services and readiness',
  'studio.section_configuration': 'Configuration',
  'studio.no_scenarios': 'No record is bundled for this profile.',
  'studio.no_languages': 'No bundled interface language is approved for this record.',
  'studio.region_locked': 'The region is fixed for this package.',
  'studio.start_section_note': 'Only sections enabled by the modules above are offered.',
  'studio.branding_accent_hex': 'Accent colour as hex (#rrggbb)',
  'studio.branding_accent_default': 'Use the default accent',
  'studio.branding_accent_invalid': 'Enter a six-digit hex colour such as #0e6e6b, or leave empty for the default.',
  'studio.branding_note': 'Branding changes labels and the accent colour only. No employer logo is used.',
  'studio.integration_wallet_provider': '{wallet} issuing service',
  'studio.integration_invalid': 'Enter a plain https:// address without passwords, keys or tokens, or leave the field empty.',
  'studio.readiness_pending': 'Not yet loaded',
  'studio.readiness_capability': 'Capability',
  'studio.readiness_state': 'State',
  'studio.readiness_note': 'States describe the presentation that is open now. Endpoints entered above take effect after Apply.',
  'studio.cap_record': 'Record access and statement',
  'studio.cap_explanations': 'Explanations and calculations',
  'studio.cap_exports': 'Exports (PDF, Excel, calendar)',
  'studio.cap_print': 'Print',
  'studio.cap_lumi': 'Lumi assistance',
  'studio.cap_queries': 'Payroll query submission',
  'studio.cap_wallet': 'Wallet pass — {wallet}',
  'studio.cap_verification': 'Record verification',
  'studio.cap_identity': 'Identity and access',
  'studio.cap_userway': 'UserWay accessibility widget',
  'studio.cap_detail_local': 'Works inside this file without any service.',
  'studio.cap_detail_connected': 'Connected to {service}.',
  'studio.cap_detail_no_endpoint': 'No HTTPS endpoint is configured.',
  'studio.cap_detail_lumi_local': 'Deterministic local answers from the record and authored explanations.',
  'studio.cap_detail_userway_failed': 'The widget script could not load. Every function remains available with the keyboard.',
  'studio.cap_detail_userway_loaded': 'The widget script loaded from the UserWay servers.',
  'studio.cap_detail_userway_pending': 'The widget script has not finished loading.',
  'studio.record_persona': 'Persona',
  'studio.record_period': 'Pay period',
  'studio.record_currency': 'Currency',
  'studio.record_lines': 'Pay lines',
  'studio.record_document': 'Record reference',
  'studio.record_none': 'No record is available for this selection.',
  'studio.verify_running': 'Checking the record arithmetic…',
  'studio.verify_result_announce': 'Arithmetic check complete.',
  'studio.export_download': 'Download JSON',
  'studio.export_downloaded': 'Configuration file downloaded.',
  'studio.export_copy_failed': 'The clipboard is not available here. Copy the text below instead.',
  'studio.export_shape_note': 'The file contains presentation settings and endpoint addresses only. No record content, personal data or credentials.',
  'studio.import_apply': 'Import into the form',
  'studio.import_applied': 'Configuration imported into the form. Review it, then Apply.',
  'studio.import_notices': 'Import notices',
  'studio.import_empty': 'Paste configuration JSON first.',
  'studio.import_unknown_region': 'Region “{region}” is not bundled and was ignored.',
  'studio.import_unknown_scenario': 'Scenario “{scenario}” is not bundled for {region} and was ignored.',
  'studio.import_unknown_language': 'Language “{lang}” is not approved for {region} and was ignored.',
  'studio.share_fallback': 'The clipboard is not available here. Copy the link below instead.',
  'studio.fragment_equivalent': 'Address fragment equivalent',
  'studio.command_present': 'Present with Studio open',
  'studio.copy_command': 'Copy command',
  'studio.copy_fragment': 'Copy fragment',
  'studio.copied_command': 'Command copied.',
  'studio.apply_note': 'Apply saves these settings on this device and reopens the statement with them. Switching the region or scenario clears selections, drafts, chat and caches.',
  'studio.reset_done': 'Studio settings cleared.',
  'studio.lang_locked_note': 'Languages are limited to those the selected record approves and this file bundles.',
  'studio.modules_note': 'Modules the record cannot support are locked with the reason.',
  'studio.current_marker': '(current)',
  'studio.doc_missing_note': 'The statement is not open. Choose a region, language and scenario, then Apply.',
  'studio.disclosure_excerpt': 'Disclosure “{key}”',
});

const GROUP_ORDER = ['north-america', 'africa', 'europe'];
const GROUP_KEYS = { 'north-america': 'studio.group_north_america', africa: 'studio.group_africa', europe: 'studio.group_europe' };
const NAV_KEYS = { 'my-pay': 'nav.my_pay', 'pay-details': 'nav.pay_details', 'what-changed': 'nav.what_changed', 'time-leave': 'nav.time_leave', 'total-reward': 'nav.total_reward', 'record-actions': 'nav.record_actions' };
const INTEGRATIONS = ['assistant', 'queries', 'identity', 'verification'];
const WALLETS = ['apple', 'google', 'samsung'];
const HEX = /^#[0-9a-fA-F]{6}$/;
/** Endpoints: plain HTTPS only, never with embedded credentials (see safeEndpoint in config.js). */
const HTTPS = { test: (v) => Boolean(safeEndpoint(v)) };

/* ----------------------------------------------------------------------------
 * Form state
 * ------------------------------------------------------------------------- */

function endpointOf(v) { return v && typeof v === 'object' && typeof v.endpoint === 'string' ? v.endpoint : ''; }

/** Build the form state from the effective configuration merged with saved Studio settings. */
function initialForm(ctx) {
  const config = ctx.config || {};
  const p = { ...DEFAULT_PRESENTATION, ...(config.presentation || {}) };
  const saved = loadStudioSettings() || {};
  const region = registry.profiles[config.profileId] ? config.profileId : (registry.profiles[saved.region] ? saved.region : registry.defaultProfileId);
  const profile = registry.profiles[region];
  const scenarios = registry.scenariosFor(region);
  const scenario = scenarios.some((s) => s.id === config.scenarioId) ? config.scenarioId : (scenarios.some((s) => s.id === saved.scenario) ? saved.scenario : (scenarios[0] ? scenarios[0].id : null));
  const langs = languagesFor(region, scenario);
  const lang = langs.includes(config.locale) ? config.locale : (langs.includes(saved.lang) ? saved.lang : (langs.includes(profile.defaultLocale) ? profile.defaultLocale : langs[0] || profile.defaultLocale));
  const presetId = PRESETS.some((x) => x.id === config.preset) ? config.preset : (PRESETS.some((x) => x.id === saved.preset) ? saved.preset : 'complete');
  const preset = PRESETS.find((x) => x.id === presetId);
  const modules = { ...preset.modules, ...(saved.modules || {}), ...(config.modules || {}) };
  const integrations = { ...(saved.integrations || {}), ...(p.integrations || {}) };
  return {
    region, lang, scenario, preset: presetId,
    modules: Object.fromEntries(OPTIONAL_MODULES.map((m) => [m, modules[m] !== false])),
    startSection: SECTION_IDS.includes(config.startSection) ? config.startSection : (SECTION_IDS.includes(saved.startSection) ? saved.startSection : preset.startSection),
    branding: { name: (p.branding && p.branding.name) || DEFAULT_PRESENTATION.branding.name, employerLabel: (p.branding && p.branding.employerLabel) || DEFAULT_PRESENTATION.branding.employerLabel, accent: p.branding && HEX.test(p.branding.accent || '') ? p.branding.accent : null },
    density: p.density || 'comfortable', theme: p.theme || 'system', emphasis: p.emphasis || preset.emphasis || 'balanced',
    animation: p.animation !== false, narration: p.narration || 'captions', lowData: Boolean(p.lowData), privacyMode: Boolean(p.privacyMode), accessGate: Boolean(p.accessGate),
    integrations: {
      assistant: endpointOf(integrations.assistant), queries: endpointOf(integrations.queries), identity: endpointOf(integrations.identity), verification: endpointOf(integrations.verification),
      wallet: Object.fromEntries(WALLETS.map((w) => [w, endpointOf(integrations.wallet && integrations.wallet[w])])),
    },
  };
}

/** Interface languages offered: the profile's locales ∩ bundled packs ∩ the record's approved languages. */
function languagesFor(region, scenarioId) {
  const profile = registry.profiles[region];
  if (!profile) return [];
  const record = registry.findRecord(region, scenarioId);
  const approved = record && Array.isArray(record.document.languages) ? record.document.languages : null;
  return profile.locales.filter((l) => registry.languages[l] && (!approved || approved.includes(l)));
}

/** Module locks for the selected record (mirrors resolveConfig) plus package locks from the running config. */
function locksFor(ctx, form) {
  const locks = {};
  const configured = (ctx.config && ctx.config.locked) || {};
  if (configured.region) locks.region = configured.region;
  if (configured.scenario) locks.scenario = configured.scenario;
  const record = registry.findRecord(form.region, form.scenario);
  if (record && (!record.time || !(record.time.entries || []).length) && !(record.time && record.time.leave)) locks.timeLeave = 'config.lock.no_time_data';
  if (record && !(record.history || []).length) locks.whatChanged = 'config.lock.no_history';
  const profileForLocks = registry.profiles[form.region];
  if (profileForLocks) Object.assign(locks, requiredModules(profileForLocks, record));
  return locks;
}

function effectiveModules(form, locks) {
  const out = { ...form.modules };
  // A lock either removes a module the record cannot support or keeps one that carries required particulars.
  for (const k of Object.keys(locks)) if (OPTIONAL_MODULES.includes(k)) out[k] = locks[k] === 'config.lock.required_section';
  return out;
}

/** The settings object persisted by Apply and exported/shared. */
function collectSettings(ctx, form) {
  const locks = locksFor(ctx, form);
  const modules = effectiveModules(form, locks);
  const ep = (v) => { const ok = safeEndpoint(v || ''); return ok ? { endpoint: ok } : null; };
  const wallet = {};
  for (const w of WALLETS) { const e = ep(form.integrations.wallet[w]); if (e) wallet[w] = e; }
  return {
    region: form.region, lang: form.lang, scenario: form.scenario, preset: form.preset,
    modules, startSection: form.startSection,
    branding: { name: form.branding.name.trim().slice(0, 40) || DEFAULT_PRESENTATION.branding.name, employerLabel: form.branding.employerLabel.trim().slice(0, 60) || DEFAULT_PRESENTATION.branding.employerLabel, accent: HEX.test(form.branding.accent || '') ? form.branding.accent : null },
    density: form.density, theme: form.theme, emphasis: form.emphasis, animation: form.animation, narration: form.narration,
    lowData: form.lowData, privacyMode: form.privacyMode, accessGate: form.accessGate,
    integrations: { assistant: ep(form.integrations.assistant), queries: ep(form.integrations.queries), identity: ep(form.integrations.identity), verification: ep(form.integrations.verification), wallet },
  };
}

function exportShape(settings) { return { kind: 'paylight-config', version: 1, ...settings }; }

/** Apply a validated (whitelisted) presentation object to the form. Returns extra notices for unknown data. */
function applyValidated(form, safe, notices) {
  if (safe.region) {
    if (registry.profiles[safe.region]) form.region = safe.region;
    else notices.push({ key: 'studio.import_unknown_region', params: { region: safe.region } });
  }
  const scenarios = registry.scenariosFor(form.region);
  if (safe.scenario) {
    if (scenarios.some((s) => s.id === safe.scenario)) form.scenario = safe.scenario;
    else notices.push({ key: 'studio.import_unknown_scenario', params: { scenario: safe.scenario, region: form.region } });
  }
  if (!scenarios.some((s) => s.id === form.scenario)) form.scenario = scenarios[0] ? scenarios[0].id : null;
  const langs = languagesFor(form.region, form.scenario);
  if (safe.lang) {
    if (langs.includes(safe.lang)) form.lang = safe.lang;
    else notices.push({ key: 'studio.import_unknown_language', params: { lang: safe.lang, region: form.region } });
  }
  if (!langs.includes(form.lang)) form.lang = langs.includes(registry.profiles[form.region].defaultLocale) ? registry.profiles[form.region].defaultLocale : (langs[0] || form.lang);
  if (safe.preset) { form.preset = safe.preset; const p = PRESETS.find((x) => x.id === safe.preset); if (p) { form.modules = { ...p.modules }; form.startSection = p.startSection; form.emphasis = p.emphasis; } }
  if (safe.modules) for (const m of OPTIONAL_MODULES) if (typeof safe.modules[m] === 'boolean') form.modules[m] = safe.modules[m];
  if (safe.startSection) form.startSection = safe.startSection;
  for (const k of ['density', 'theme', 'emphasis', 'narration']) if (safe[k]) form[k] = safe[k];
  for (const k of ['animation', 'lowData', 'privacyMode', 'accessGate']) if (typeof safe[k] === 'boolean') form[k] = safe[k];
  if (safe.branding) {
    if (typeof safe.branding.name === 'string') form.branding.name = safe.branding.name;
    if (typeof safe.branding.employerLabel === 'string') form.branding.employerLabel = safe.branding.employerLabel;
    if (typeof safe.branding.accent === 'string') form.branding.accent = safe.branding.accent;
  }
  if (safe.integrations) {
    for (const k of INTEGRATIONS) if (k in safe.integrations) form.integrations[k] = endpointOf(safe.integrations[k]);
    if (safe.integrations.wallet) for (const w of WALLETS) if (w in safe.integrations.wallet) form.integrations.wallet[w] = endpointOf(safe.integrations.wallet[w]);
  }
}

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && (window.isSecureContext || location.protocol === 'file:')) { await navigator.clipboard.writeText(text); return true; }
  } catch (err) { /* fall through to the visible fallback */ }
  return false;
}

function downloadJson(filename, text) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
    return true;
  } catch (err) { return false; }
}

function reconfigure(ctx, cfg) {
  if (ctx.actions && typeof ctx.actions.reconfigure === 'function') { ctx.actions.reconfigure(cfg); return; }
  // Minimal ctx (configuration-error screen): write the fragment ourselves and reboot.
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  for (const [k, v] of Object.entries(cfg)) { if (v === null || v === undefined || v === false || v === '') p.delete(k); else p.set(k, v === true ? '1' : String(v)); }
  history.replaceState(null, '', `#${p.toString()}`);
  if (ctx.actions && typeof ctx.actions.reboot === 'function') ctx.actions.reboot();
}

function chip(text, kind) {
  const cls = { local: 'pl-chip-info', connected: 'pl-chip-positive', unavailable: 'pl-chip-outline', awaiting: 'pl-chip-warn', pending: 'pl-chip-outline' }[kind] || '';
  return h('span', { class: ['pl-chip', cls], dataset: { state: kind } }, text);
}

function field(labelText, control, { hint = null, id = null, error = null } = {}) {
  const fid = id || uid('stf');
  control.id = fid;
  const hintEl = hint ? h('span', { class: 'pl-hint', id: `${fid}-hint` }, hint) : null;
  if (hintEl) control.setAttribute('aria-describedby', `${fid}-hint`);
  return h('div', { class: 'pl-field' }, h('label', { for: fid }, labelText), control, hintEl, error);
}

function switchRow({ label, checked, onChange, disabled = false, note = null, focusKey }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: checked ? true : null, disabled: disabled ? true : null, dataset: { focusKey }, on: { change: (e) => onChange(e.target.checked) } });
  return h('div', { class: ['pl-studio-switch', disabled && 'is-locked'] },
    h('label', { class: 'pl-switch' }, input, h('span', { class: 'track', aria: { hidden: 'true' } }), h('span', { class: 'pl-studio-switch-label' }, label)),
    note ? h('span', { class: 'pl-lock' }, disabled ? icon('lock', { size: 14 }) : null, note) : null,
  );
}

function seg(label, options, value, onChange, focusKey) {
  const group = h('div', { class: 'pl-seg pl-studio-seg', role: 'radiogroup', aria: { label } });
  options.forEach((o, i) => {
    group.appendChild(h('button', { type: 'button', role: 'radio', aria: { checked: String(o.value === value) }, tabindex: o.value === value ? '0' : '-1', dataset: { focusKey: `${focusKey}-${o.value}` }, on: {
      click: () => { onChange(o.value); group.querySelectorAll('button').forEach((b, j) => { b.setAttribute('aria-checked', String(j === i)); b.tabIndex = j === i ? 0 : -1; }); },
      keydown: (e) => { const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!dir) return; e.preventDefault(); const next = (i + dir + options.length) % options.length; group.children[next].click(); group.children[next].focus(); },
    } }, o.label));
  });
  return h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, label), group);
}

function section(title, ...children) {
  const id = uid('sts');
  return h('section', { class: 'pl-studio-sec', aria: { labelledby: id } }, h('h3', { class: 'pl-studio-sec-title', id }, title), ...children);
}

/* ----------------------------------------------------------------------------
 * Studio dialog
 * ------------------------------------------------------------------------- */

export function openStudio(ctx) {
  const t = ctx.t;
  const form = initialForm(ctx);
  const host = h('div', { class: 'pl-studio-body' });
  let dialog = null;
  let verifyResult = null;
  let importNotices = [];
  let importText = '';
  let fallbackBox = null; // visible fallback for clipboard-less environments

  function rerender() {
    const active = document.activeElement;
    const key = active && host.contains(active) ? (active.dataset.focusKey || active.id || null) : null;
    const body = host.closest('.pl-dialog-body');
    const top = body ? body.scrollTop : 0;
    clear(host);
    host.appendChild(renderBody());
    if (key) { const again = host.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) || host.querySelector(`#${CSS.escape(key)}`); if (again) again.focus({ preventScroll: true }); }
    if (body) body.scrollTop = top;
  }

  function renderBody() {
    const locks = locksFor(ctx, form);
    const profile = registry.profiles[form.region];
    const scenarios = registry.scenariosFor(form.region);
    const record = registry.findRecord(form.region, form.scenario);
    const langs = languagesFor(form.region, form.scenario);
    const modules = effectiveModules(form, locks);

    // --- Region --------------------------------------------------------------
    const groups = {};
    for (const p of Object.values(registry.profiles)) (groups[p.group || 'other'] = groups[p.group || 'other'] || []).push(p);
    const groupIds = [...GROUP_ORDER.filter((g) => groups[g]), ...Object.keys(groups).filter((g) => !GROUP_ORDER.includes(g))];
    const regionSelect = h('select', { class: 'pl-select', disabled: locks.region ? true : null, dataset: { focusKey: 'studio-region' }, on: { change: (e) => {
      form.region = e.target.value;
      const sc = registry.scenariosFor(form.region); form.scenario = sc[0] ? sc[0].id : null;
      const ls = languagesFor(form.region, form.scenario); const def = registry.profiles[form.region].defaultLocale; form.lang = ls.includes(def) ? def : (ls[0] || def);
      verifyResult = null; rerender();
    } } },
      groupIds.map((g) => h('optgroup', { label: GROUP_KEYS[g] ? t(GROUP_KEYS[g]) : g }, groups[g].map((p) => h('option', { value: p.id, selected: p.id === form.region ? true : null }, `${t(`region.${p.id}`)}${ctx.doc && ctx.config && p.id === ctx.config.profileId ? ` ${t('studio.current_marker')}` : ''}`)))),
    );
    const regionField = field(t('studio.region'), regionSelect, { hint: locks.region ? `${t('studio.region_locked')} ${t(locks.region)}` : t('studio.group_note') });

    // --- Language ------------------------------------------------------------
    const langControl = langs.length
      ? h('select', { class: 'pl-select', dataset: { focusKey: 'studio-lang' }, on: { change: (e) => { form.lang = e.target.value; } } }, langs.map((l) => h('option', { value: l, lang: l, selected: l === form.lang ? true : null }, `${LANGUAGE_NAMES[l] || l} (${l})`)))
      : h('select', { class: 'pl-select', disabled: true }, h('option', null, t('studio.no_languages')));
    const langField = field(t('studio.language'), langControl, { hint: t('studio.lang_locked_note') });

    // --- Scenario ------------------------------------------------------------
    const scenarioName = uid('sc');
    const scenarioList = scenarios.length
      ? h('div', { class: 'pl-studio-radios', role: 'radiogroup', aria: { label: t('studio.scenario') } }, scenarios.map((s) => {
        const id = uid('sco');
        return h('label', { class: ['pl-studio-radio', s.id === form.scenario && 'is-checked'], for: id },
          h('input', { type: 'radio', id, name: scenarioName, value: s.id, checked: s.id === form.scenario ? true : null, disabled: locks.scenario ? true : null, dataset: { focusKey: `studio-scenario-${s.id}` }, on: { change: () => { form.scenario = s.id; const ls = languagesFor(form.region, s.id); if (!ls.includes(form.lang)) form.lang = ls[0] || form.lang; verifyResult = null; rerender(); } } }),
          h('span', { class: 'pl-studio-radio-text' }, h('b', null, s.personaName), h('span', { class: 'muted small' }, s.summary), s.tags && s.tags.length ? h('span', { class: 'pl-studio-tags' }, s.tags.map((tag) => h('span', { class: 'pl-chip pl-chip-outline' }, tag))) : null),
        );
      }))
      : notice(ctx, t('studio.no_scenarios'), { kind: 'warn' });
    const scenarioField = h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, t('studio.scenario')), scenarioList, locks.scenario ? h('span', { class: 'pl-lock' }, icon('lock', { size: 14 }), t(locks.scenario)) : null);

    // --- Preset --------------------------------------------------------------
    const presetName = uid('pr');
    const presetList = h('div', { class: 'pl-studio-radios', role: 'radiogroup', aria: { label: t('studio.preset') } }, PRESETS.map((p) => {
      const id = uid('pro');
      return h('label', { class: ['pl-studio-radio', p.id === form.preset && 'is-checked'], for: id },
        h('input', { type: 'radio', id, name: presetName, value: p.id, checked: p.id === form.preset ? true : null, dataset: { focusKey: `studio-preset-${p.id}` }, on: { change: () => { form.preset = p.id; form.modules = { ...p.modules }; form.startSection = p.startSection; form.emphasis = p.emphasis; rerender(); } } }),
        h('span', { class: 'pl-studio-radio-text' }, h('b', null, t(p.nameKey)), h('span', { class: 'muted small' }, t(p.descriptionKey))),
      );
    }));
    const presetField = h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, t('studio.preset')), presetList);

    // --- Optional modules ----------------------------------------------------
    const moduleRows = OPTIONAL_MODULES.map((m) => {
      const lock = locks[m] || null;
      return switchRow({ label: t(`studio.module_${m}`), checked: modules[m], disabled: Boolean(lock), focusKey: `studio-module-${m}`, note: lock ? t('studio.locked_reason', { reason: t(lock) }) : null, onChange: (on) => { form.modules[m] = on; rerender(); } });
    });
    const modulesField = h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, t('studio.modules')), h('span', { class: 'pl-hint' }, t('studio.modules_note')), h('div', { class: 'pl-studio-switches' }, moduleRows));

    // --- Required fields and disclosures ------------------------------------
    const contentPack = (registry.contents[form.region] || {})[form.lang] || (registry.contents[form.region] || {})[profile.defaultLocale] || {};
    const disclosures = (contentPack && contentPack.disclosures) || {};
    const requiredList = h('ul', { class: 'pl-studio-required' },
      (profile.requiredFields || []).map((f) => h('li', null, icon('lock', { size: 14, label: t('studio.locked') }), h('span', null, h('span', null, t(f.reasonKey)), h('span', { class: 'pl-lock' }, t('config.lock.required_section'))))),
      (profile.requiredDisclosures || []).map((key) => {
        const text = typeof disclosures[key] === 'string' ? disclosures[key] : '';
        const words = text.split(/\s+/).filter(Boolean);
        const excerpt = words.length ? `${words.slice(0, 9).join(' ')}${words.length > 9 ? '…' : ''}` : t('studio.disclosure_excerpt', { key });
        return h('li', null, icon('lock', { size: 14, label: t('studio.locked') }), h('span', null, h('span', null, excerpt), h('span', { class: 'pl-lock' }, t('config.lock.required_disclosure'))));
      }),
    );
    const requiredField = h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, t('studio.required_fields')), h('span', { class: 'pl-hint' }, t('studio.required_fields_desc')), requiredList);

    // --- Starting section ----------------------------------------------------
    const enabledSections = orderSections(SECTION_IDS, modules);
    if (!enabledSections.includes(form.startSection)) form.startSection = enabledSections[0];
    const startSelect = h('select', { class: 'pl-select', dataset: { focusKey: 'studio-start' }, on: { change: (e) => { form.startSection = e.target.value; } } }, enabledSections.map((id) => h('option', { value: id, selected: id === form.startSection ? true : null }, t(NAV_KEYS[id]))));
    const startField = field(t('studio.start_section'), startSelect, { hint: t('studio.start_section_note') });

    // --- Branding ------------------------------------------------------------
    const nameInput = h('input', { class: 'pl-input', type: 'text', maxlength: '40', value: form.branding.name, autocomplete: 'off', dataset: { focusKey: 'studio-brand-name' }, on: { input: (e) => { form.branding.name = e.target.value; } } });
    const employerInput = h('input', { class: 'pl-input', type: 'text', maxlength: '60', value: form.branding.employerLabel, autocomplete: 'off', dataset: { focusKey: 'studio-brand-employer' }, on: { input: (e) => { form.branding.employerLabel = e.target.value; } } });
    const defaultAccent = (getComputedStyle(document.documentElement).getPropertyValue('--pl-accent') || '').trim();
    const accentError = h('span', { class: 'pl-error-text', hidden: true, id: uid('acc-err') }, t('studio.branding_accent_invalid'));
    const colorInput = h('input', { class: 'pl-studio-color', type: 'color', value: HEX.test(form.branding.accent || '') ? form.branding.accent : (HEX.test(defaultAccent) ? defaultAccent : '#000000'), dataset: { focusKey: 'studio-brand-color' }, aria: { label: t('studio.branding_accent') } });
    const hexInput = h('input', { class: 'pl-input', type: 'text', inputmode: 'text', maxlength: '7', placeholder: '#rrggbb', value: form.branding.accent || '', autocomplete: 'off', dataset: { focusKey: 'studio-brand-hex' }, aria: { label: t('studio.branding_accent_hex'), describedby: accentError.id } });
    const defaultBtn = h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: 'studio-brand-default' }, on: { click: () => { form.branding.accent = null; hexInput.value = ''; if (HEX.test(defaultAccent)) colorInput.value = defaultAccent; accentError.hidden = true; hexInput.removeAttribute('aria-invalid'); } } }, t('studio.branding_accent_default'));
    colorInput.addEventListener('input', (e) => { form.branding.accent = e.target.value; hexInput.value = e.target.value; accentError.hidden = true; hexInput.removeAttribute('aria-invalid'); });
    hexInput.addEventListener('input', (e) => { const v = e.target.value.trim(); if (v === '') { form.branding.accent = null; accentError.hidden = true; hexInput.removeAttribute('aria-invalid'); return; } if (HEX.test(v)) { form.branding.accent = v; colorInput.value = v; accentError.hidden = true; hexInput.removeAttribute('aria-invalid'); } else { accentError.hidden = false; hexInput.setAttribute('aria-invalid', 'true'); } });
    const brandingBlock = h('div', { class: 'pl-studio-grid2' },
      field(t('studio.branding_name'), nameInput),
      field(t('studio.branding_employer'), employerInput),
      h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, t('studio.branding_accent')), h('div', { class: 'pl-studio-accent' }, colorInput, hexInput, defaultBtn), accentError, h('span', { class: 'pl-hint' }, t('studio.branding_note'))),
    );

    // --- Appearance, density, emphasis, animation, narration -----------------
    const appearance = h('div', { class: 'pl-studio-grid2' },
      seg(t('studio.density'), [{ value: 'comfortable', label: t('mine.density_comfortable') }, { value: 'compact', label: t('mine.density_compact') }], form.density, (v) => { form.density = v; }, 'studio-density'),
      seg(t('studio.theme'), [{ value: 'light', label: t('theme.light') }, { value: 'dark', label: t('theme.dark') }, { value: 'system', label: t('theme.system') }], form.theme, (v) => { form.theme = v; }, 'studio-theme'),
      seg(t('studio.emphasis'), [{ value: 'table', label: t('mine.emphasis_table') }, { value: 'chart', label: t('mine.emphasis_chart') }, { value: 'balanced', label: t('mine.emphasis_balanced') }], form.emphasis, (v) => { form.emphasis = v; }, 'studio-emphasis'),
      seg(t('studio.narration'), [{ value: 'captions', label: t('studio.narration_captions') }, { value: 'audio-when-available', label: t('studio.narration_audio') }, { value: 'off', label: t('studio.narration_off') }], form.narration, (v) => { form.narration = v; }, 'studio-narration'),
      h('div', { class: 'pl-studio-switches' },
        switchRow({ label: t('studio.animation'), checked: form.animation, focusKey: 'studio-animation', onChange: (on) => { form.animation = on; } }),
        switchRow({ label: t('mine.low_data'), checked: form.lowData, focusKey: 'studio-lowdata', note: t('mine.low_data_desc'), onChange: (on) => { form.lowData = on; } }),
        switchRow({ label: t('mine.privacy_mode'), checked: form.privacyMode, focusKey: 'studio-privacy', note: t('mine.privacy_mode_desc'), onChange: (on) => { form.privacyMode = on; } }),
      ),
    );

    // --- Integrations --------------------------------------------------------
    const endpointField = (label, get, set, key) => {
      const err = h('span', { class: 'pl-error-text', hidden: true, id: uid('ep-err') }, t('studio.integration_invalid'));
      const input = h('input', { class: 'pl-input', type: 'url', placeholder: 'https://', value: get() || '', autocomplete: 'off', spellcheck: 'false', dataset: { focusKey: `studio-ep-${key}` }, aria: { describedby: err.id }, on: { input: (e) => { const v = e.target.value.trim(); set(v); const bad = v !== '' && !HTTPS.test(v); err.hidden = !bad; if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); } } });
      return field(`${label} — ${t('studio.integration_endpoint')}`, input, { error: err });
    };
    const integrationsBlock = h('div', { class: 'pl-studio-grid2' },
      INTEGRATIONS.map((k) => endpointField(t(`studio.integration_${k}`), () => form.integrations[k], (v) => { form.integrations[k] = v; }, k)),
      WALLETS.map((w) => endpointField(t('studio.integration_wallet_provider', { wallet: t(`wallet.${w}`) }), () => form.integrations.wallet[w], (v) => { form.integrations.wallet[w] = v; }, `wallet-${w}`)),
    );

    // --- Access gate ---------------------------------------------------------
    const gateRow = switchRow({ label: t('studio.access_gate'), checked: form.accessGate, focusKey: 'studio-gate', note: t('studio.access_gate_note'), onChange: (on) => { form.accessGate = on; } });

    // --- Readiness register --------------------------------------------------
    const readiness = readinessRows(ctx);
    const readinessTable = h('div', { class: 'pl-table-wrap' }, h('table', { class: 'pl-table pl-studio-readiness' },
      h('caption', null, t('studio.readiness_note')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('studio.readiness_capability')), h('th', { scope: 'col' }, t('studio.readiness_state')))),
      h('tbody', null, readiness.map((r) => h('tr', null, h('td', null, h('span', { class: 'cell-main' }, r.label), h('span', { class: 'cell-sub' }, r.detail)), h('td', null, chip(t(`studio.readiness_${r.state}`), r.state))))),
    ));

    // --- Record summary ------------------------------------------------------
    let recordBlock;
    if (record) {
      const period = record.document.period;
      const periodText = ctx.fmt && ctx.fmt.period ? ctx.fmt.period(period) : `${period.start} – ${period.end}`;
      const dl = h('dl', { class: 'pl-dl' },
        h('dt', null, t('studio.record_persona')), h('dd', null, record.employee.displayName),
        h('dt', null, t('studio.record_document')), h('dd', null, `${record.document.id} · v${record.document.version}`),
        h('dt', null, t('studio.record_period')), h('dd', null, periodText),
        h('dt', null, t('studio.record_currency')), h('dd', null, record.document.currency),
        h('dt', null, t('studio.record_lines')), h('dd', null, t('common.lines', { count: record.lines.length })),
      );
      const resultHost = h('div', { class: 'pl-studio-verify', aria: { live: 'polite' } });
      if (verifyResult && verifyResult.record === record) resultHost.appendChild(verifyNotice(ctx, verifyResult.result));
      const verifyBtn = h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'studio-verify' }, on: { click: () => {
        clear(resultHost); resultHost.appendChild(h('p', { class: 'muted small' }, t('studio.verify_running')));
        const result = verifyRecord(record, profile);
        verifyResult = { record, result };
        clear(resultHost); resultHost.appendChild(verifyNotice(ctx, result));
        announce(`${t('studio.verify_result_announce')} ${result.ok ? t('studio.verify_ok') : t('studio.verify_fail', { count: problemCount(result) })}`);
      } } }, icon('check', { size: 16 }), t('studio.verify'));
      recordBlock = h('div', { class: 'stack' }, dl, verifyBtn, resultHost);
    } else recordBlock = notice(ctx, t('studio.record_none'), { kind: 'warn' });

    // --- Configuration: export / import / share / command line ---------------
    const settings = collectSettings(ctx, form);
    const importArea = h('textarea', { class: 'pl-textarea pl-studio-import', rows: '5', spellcheck: 'false', dataset: { focusKey: 'studio-import' }, placeholder: '{ "kind": "paylight-config", "version": 1, … }', on: { input: (e) => { importText = e.target.value; } } }, importText);
    const importNoticesHost = h('div', { class: 'pl-studio-import-notices' });
    if (importNotices.length) importNoticesHost.appendChild(h('div', { class: 'pl-notice', dataset: { kind: 'warn' }, role: 'status' }, icon('info'), h('div', null, h('b', null, t('studio.import_notices')), h('ul', null, importNotices.map((n) => h('li', null, t(n.key, n.params)))))));
    const importBtn = h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'studio-import-apply' }, on: { click: () => {
      const text = importArea.value.trim();
      importNotices = [];
      if (!text) { importNotices.push({ key: 'studio.import_empty' }); rerender(); return; }
      let parsed;
      try { parsed = JSON.parse(text); } catch (err) { importNotices.push({ key: 'studio.import_invalid', params: { reason: err.message } }); rerender(); announce(t('studio.import_invalid', { reason: err.message })); return; }
      const validation = [];
      const safe = validatePresentation(parsed, validation);
      for (const n of validation) importNotices.push(n.key === 'config.import_field_ignored' ? { key: 'studio.import_ignored', params: n.params } : { key: n.key, params: n.params });
      applyValidated(form, safe, importNotices);
      verifyResult = null;
      importText = '';
      rerender();
      toast(t('studio.import_applied'));
      announce(t('studio.import_applied'));
    } } }, icon('download', { size: 16 }), t('studio.import_apply'));
    const importBlock = h('div', { class: 'stack' }, field(t('studio.import_label'), importArea), importBtn, importNoticesHost);

    const cli = `npm run present -- --region=${settings.region} --lang=${settings.lang} --preset=${settings.preset}${settings.scenario ? ` --scenario=${settings.scenario}` : ''}`;
    const fragment = `paylight.html#region=${settings.region}&lang=${settings.lang}&preset=${settings.preset}${settings.scenario ? `&scenario=${settings.scenario}` : ''}`;
    const buildCmd = `node bin/paylight.js build --region=${settings.region}${settings.scenario ? ` --scenario=${settings.scenario}` : ''} --employee`;
    const copyBtn = (label, text, doneKey, key) => h('button', { class: 'pl-btn pl-btn-sm', type: 'button', dataset: { focusKey: key }, on: { click: async () => { if (await copyText(text)) toast(t(doneKey)); else showFallback(t('studio.export_copy_failed'), text); } } }, icon('copy', { size: 14 }), label);
    const commandBlock = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, t('studio.shortcut')),
      h('div', { class: 'pl-studio-code' }, h('pre', { class: 'pl-code' }, `${cli}\n${cli} --studio   # ${t('studio.command_present')}`), copyBtn(t('studio.copy_command'), cli, 'studio.copied_command', 'studio-copy-cli')),
      h('div', { class: 'pl-studio-code' }, h('span', { class: 'pl-label' }, t('studio.fragment_equivalent')), h('pre', { class: 'pl-code' }, fragment), copyBtn(t('studio.copy_fragment'), fragment, 'common.copied', 'studio-copy-fragment')),
      h('div', { class: 'pl-studio-code' }, h('span', { class: 'pl-label' }, t('studio.employee_package')), h('p', { class: 'muted small' }, t('studio.employee_package_note', { region: settings.region, scenario: settings.scenario || '' })), h('pre', { class: 'pl-code' }, buildCmd), copyBtn(t('studio.copy_command'), buildCmd, 'studio.copied_command', 'studio-copy-build')),
    );

    fallbackBox = h('div', { class: 'pl-studio-fallback', hidden: true });

    return h('div', { class: 'pl-studio-form stack-lg' },
      h('div', { class: 'stack' },
        h('p', null, t('studio.intro')),
        h('p', { class: 'muted small' }, t('studio.hidden_note')),
        ctx.doc ? null : notice(ctx, t('studio.doc_missing_note'), { kind: 'warn' }),
      ),
      section(t('studio.section_setup'), h('div', { class: 'pl-studio-grid2' }, regionField, langField), scenarioField, presetField),
      section(t('studio.section_presentation'), modulesField, requiredField, startField, h('h4', null, t('studio.branding')), brandingBlock, appearance),
      section(t('studio.section_services'),
        h('h4', null, t('studio.integrations')), h('p', { class: 'muted small' }, t('studio.integration_note')), integrationsBlock, gateRow,
        h('h4', null, t('studio.readiness')), readinessTable,
        h('h4', null, t('studio.record_summary')), recordBlock,
      ),
      section(t('studio.section_configuration'),
        h('p', { class: 'muted small' }, t('studio.export_shape_note')),
        h('div', { class: 'pl-btn-group' },
          h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'studio-export' }, on: { click: doExport } }, icon('copy', { size: 16 }), t('studio.export')),
          h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'studio-download' }, on: { click: doDownload } }, icon('download', { size: 16 }), t('studio.export_download')),
          h('button', { class: 'pl-btn', type: 'button', dataset: { focusKey: 'studio-share' }, on: { click: doShare } }, icon('link', { size: 16 }), t('studio.share_link')),
        ),
        h('p', { class: 'muted small' }, t('studio.share_note')),
        fallbackBox,
        h('h4', null, t('studio.import')), importBlock,
        h('h4', null, t('studio.command_line')), commandBlock,
      ),
      h('p', { class: 'muted small' }, t('studio.apply_note')),
    );
  }

  function showFallback(message, text) {
    if (!fallbackBox) return;
    clear(fallbackBox);
    fallbackBox.hidden = false;
    const ta = h('textarea', { class: 'pl-textarea', readonly: true, rows: '4', aria: { label: message } }, text);
    fallbackBox.append(h('p', { class: 'small' }, message), ta);
    ta.focus(); ta.select();
  }

  async function doExport() {
    const text = JSON.stringify(exportShape(collectSettings(ctx, form)), null, 2);
    if (await copyText(text)) { toast(t('studio.exported')); announce(t('studio.exported')); }
    else showFallback(t('studio.export_copy_failed'), text);
  }
  function doDownload() {
    const settings = collectSettings(ctx, form);
    const text = JSON.stringify(exportShape(settings), null, 2);
    if (downloadJson(`paylight-config-${settings.region}-${settings.preset}.json`, text)) toast(t('studio.export_downloaded'));
    else showFallback(t('studio.export_copy_failed'), text);
  }
  async function doShare() {
    const settings = collectSettings(ctx, form);
    const base = location.href.split('#')[0];
    const link = `${base}#config=${encodeShared(settings)}&region=${encodeURIComponent(settings.region)}&lang=${encodeURIComponent(settings.lang)}${settings.scenario ? `&scenario=${encodeURIComponent(settings.scenario)}` : ''}`;
    if (await copyText(link)) { toast(t('studio.link_copied')); announce(t('studio.link_copied')); }
    else showFallback(t('studio.share_fallback'), link);
  }

  function doApply() {
    const settings = collectSettings(ctx, form);
    saveStudioSettings(settings);
    const switched = !ctx.config || settings.region !== ctx.config.profileId || settings.scenario !== ctx.config.scenarioId;
    if (switched) { clearAllSessions(); }
    if (dialog) dialog.close('apply');
    reconfigure(ctx, { region: settings.region, lang: settings.lang, scenario: settings.scenario, preset: settings.preset, studio: null });
    if (switched) toast(t('studio.scenario_switched'), { duration: 8000 });
    else toast(t('studio.applied'));
  }

  async function doReset() {
    const ok = await confirmDialog({ title: t('studio.reset'), body: t('studio.reset_confirm'), confirmLabel: t('studio.reset'), cancelLabel: t('common.cancel'), danger: true });
    if (!ok) return;
    saveStudioSettings(null);
    clearAllSessions();
    if (dialog) dialog.close('reset');
    reconfigure(ctx, { region: null, lang: null, scenario: null, preset: null, studio: null });
    toast(t('studio.reset_done'));
  }

  host.appendChild(renderBody());
  dialog = openDialog({
    title: t('studio.title'),
    closeLabel: t('studio.close'),
    size: 'lg',
    className: 'pl-studio-dialog',
    body: host,
    actions: [
      h('button', { class: 'pl-btn pl-btn-quiet pl-btn-danger', type: 'button', on: { click: doReset } }, icon('reset', { size: 16 }), t('studio.reset')),
      h('button', { class: 'pl-btn pl-btn-primary', type: 'button', on: { click: doApply } }, icon('check', { size: 16 }), t('studio.apply')),
    ],
  });
  return dialog;
}

/* ----------------------------------------------------------------------------
 * Readiness and verification
 * ------------------------------------------------------------------------- */

function readinessRows(ctx) {
  const t = ctx.t;
  const services = ctx.services || null;
  const integrations = (ctx.config && ctx.config.presentation && ctx.config.presentation.integrations) || {};
  const rows = [];
  const local = (key, detailKey = 'studio.cap_detail_local') => rows.push({ label: t(key), state: 'local', detail: t(detailKey) });
  local('studio.cap_record'); local('studio.cap_explanations'); local('studio.cap_exports'); local('studio.cap_print');

  // Lumi: local engine or a connected governed assistant service.
  const assistantCaps = services && services.assistant && typeof services.assistant.capabilities === 'function' ? services.assistant.capabilities() : null;
  const assistantConnected = assistantCaps ? assistantCaps.connected : Boolean(integrations.assistant && integrations.assistant.endpoint);
  rows.push({ label: t('studio.cap_lumi'), state: assistantConnected ? 'connected' : 'local', detail: assistantConnected ? t('studio.cap_detail_connected', { service: (assistantCaps && assistantCaps.service) || hostOf(integrations.assistant) }) : t('studio.cap_detail_lumi_local') });

  const queries = services ? services.queries : null;
  const queriesConnected = queries ? Boolean(queries.connected) : Boolean(integrations.queries && integrations.queries.endpoint);
  rows.push({ label: t('studio.cap_queries'), state: queriesConnected ? 'connected' : 'unavailable', detail: queriesConnected ? t('studio.cap_detail_connected', { service: (queries && queries.name) || hostOf(integrations.queries) }) : t('studio.cap_detail_no_endpoint') });

  for (const w of WALLETS) {
    const provider = services && Array.isArray(services.wallets) ? services.wallets.find((p) => p.id === w) : null;
    let state; let detail;
    if (provider && typeof provider.availability === 'function') {
      const a = provider.availability();
      // 'awaiting' only when a service is configured and provider approval is the sole outstanding reason.
      state = a.state === 'ready' ? 'connected' : (provider.endpoint && a.reasons.length && a.reasons.every((r) => r === 'wallet.reason_approval') ? 'awaiting' : 'unavailable');
      detail = a.state === 'ready' ? t('studio.cap_detail_connected', { service: hostOf({ endpoint: provider.endpoint }) }) : a.reasons.map((r) => t(r)).join(' ');
    } else {
      const ep = integrations.wallet && integrations.wallet[w] && integrations.wallet[w].endpoint;
      state = ep ? 'connected' : 'unavailable';
      detail = ep ? t('studio.cap_detail_connected', { service: hostOf(integrations.wallet[w]) }) : t('wallet.reason_no_service');
    }
    rows.push({ label: t('studio.cap_wallet', { wallet: t(`wallet.${w}`) }), state, detail });
  }

  const verification = services ? services.verification : null;
  const verConnected = verification ? Boolean(verification.connected) : Boolean(integrations.verification && integrations.verification.endpoint);
  rows.push({ label: t('studio.cap_verification'), state: verConnected ? 'connected' : 'unavailable', detail: verConnected ? t('studio.cap_detail_connected', { service: (verification && verification.name) || hostOf(integrations.verification) }) : t('record.integrity_unavailable') });

  const identity = services ? services.identity : null;
  const idConnected = identity ? Boolean(identity.connected) : Boolean(integrations.identity && integrations.identity.endpoint);
  rows.push({ label: t('studio.cap_identity'), state: idConnected ? 'connected' : 'unavailable', detail: idConnected ? t('studio.cap_detail_connected', { service: (identity && identity.name) || hostOf(integrations.identity) }) : t('studio.cap_detail_no_endpoint') });

  const uwFailed = Boolean(window.__paylightUserWayFailed);
  const uwLoaded = !uwFailed && (typeof window.UserWay !== 'undefined' || typeof window.UserWayWidgetApp !== 'undefined' || document.querySelector('.uwy, #userwayAccessibilityIcon') !== null);
  rows.push({ label: t('studio.cap_userway'), state: uwFailed ? 'unavailable' : (uwLoaded ? 'connected' : 'pending'), detail: uwFailed ? t('studio.cap_detail_userway_failed') : (uwLoaded ? t('studio.cap_detail_userway_loaded') : t('studio.cap_detail_userway_pending')) });
  return rows;
}

function hostOf(integration) {
  try { return integration && integration.endpoint ? new URL(integration.endpoint).host : ''; } catch (err) { return ''; }
}

function problemCount(result) {
  return (result.totals && result.totals.ok ? 0 : 1) + (result.lineProblems || []).length + (result.ytd && result.ytd.ok ? 0 : 1) + (result.time && result.time.ok ? 0 : 1) + (result.leave && result.leave.ok ? 0 : 1) + (result.bridges || []).length + (result.paymentOk ? 0 : 1);
}

function verifyNotice(ctx, result) {
  if (result.ok) return notice(ctx, ctx.t('studio.verify_ok'), { kind: 'success' });
  return notice(ctx, ctx.t('studio.verify_fail', { count: problemCount(result) }), { kind: 'error' });
}
