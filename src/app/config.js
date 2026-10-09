/**
 * Launch configuration and precedence.
 *   issued-record constraints  >  launch configuration (embedded JSON or URL fragment)
 *                              >  saved presentation preferences  >  bundled defaults
 * Nothing here can change a record's values; it only chooses which coherent
 * record/profile/language is shown and how it is presented.
 */
import { PRESETS } from './presets.js';

export const SECTION_IDS = ['my-pay', 'pay-details', 'what-changed', 'time-leave', 'total-reward', 'record-actions'];
export const REQUIRED_SECTIONS = ['my-pay', 'pay-details', 'record-actions'];
export const OPTIONAL_MODULES = ['story', 'lumi', 'whatChanged', 'timeLeave', 'totalReward', 'wallet', 'calendar', 'queries', 'personalise'];

export const DEFAULT_PRESENTATION = {
  preset: 'complete',
  theme: 'system',           // light | dark | system
  density: 'comfortable',    // comfortable | compact
  emphasis: 'balanced',      // table | chart | balanced
  lowData: false,
  privacyMode: false,
  animation: true,
  narration: 'captions',     // captions | audio-when-available | off
  branding: { name: 'Paylight', employerLabel: 'Avenlo Group', accent: null },
  integrations: { assistant: null, queries: null, wallet: {}, identity: null, verification: null },
  accessGate: false,
};

/** Read embedded launch JSON (single-file build) and the URL fragment. The fragment wins. */
export function readLaunch(win = window) {
  const launch = {};
  const notices = [];
  const el = win.document && win.document.getElementById('paylight-launch');
  if (el && el.textContent.trim()) {
    try {
      const embedded = JSON.parse(el.textContent);
      Object.assign(launch, sanitizeLaunch(embedded, notices, 'embedded'));
    } catch (err) {
      notices.push({ level: 'error', key: 'config.embedded_invalid' });
    }
  }
  const hash = (win.location && win.location.hash) ? win.location.hash.replace(/^#/, '') : '';
  const params = new URLSearchParams(hash);
  const fromFragment = {};
  for (const key of ['region', 'lang', 'preset', 'scenario', 'studio', 'section', 'line', 'theme', 'density', 'config']) {
    if (params.has(key)) fromFragment[key] = params.get(key);
  }
  Object.assign(launch, sanitizeLaunch(fromFragment, notices, 'fragment'));
  return { launch, notices };
}

function sanitizeLaunch(obj, notices, source) {
  const out = {};
  if (typeof obj.region === 'string') out.region = obj.region.trim();
  if (typeof obj.lang === 'string') out.lang = obj.lang.trim();
  if (typeof obj.preset === 'string') out.preset = obj.preset.trim().toLowerCase();
  if (typeof obj.scenario === 'string') out.scenario = obj.scenario.trim();
  if (obj.studio === true || obj.studio === '1' || obj.studio === 'true') out.studio = true;
  if (typeof obj.section === 'string') out.section = obj.section;
  if (typeof obj.line === 'string') out.line = obj.line;
  if (typeof obj.theme === 'string' && ['light', 'dark', 'system'].includes(obj.theme)) out.theme = obj.theme;
  if (typeof obj.density === 'string' && ['comfortable', 'compact'].includes(obj.density)) out.density = obj.density;
  if (typeof obj.package === 'string') out.package = obj.package;
  if (typeof obj.config === 'string') {
    // Shareable preset link: base64url JSON of presentation settings only. Validated, never executed.
    try {
      const json = JSON.parse(decodeURIComponent(escape(atob(obj.config.replace(/-/g, '+').replace(/_/g, '/')))));
      out.shared = validatePresentation(json, notices);
    } catch (err) {
      notices.push({ level: 'warning', key: 'config.shared_invalid', source });
    }
  }
  return out;
}

/** Whitelist-validate a presentation settings object (Studio import / shared link). Returns only known, well-typed fields. */
export function validatePresentation(input, notices = []) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) { notices.push({ level: 'error', key: 'config.import_not_object' }); return out; }
  const str = (k, allowed) => { if (typeof input[k] === 'string' && (!allowed || allowed.includes(input[k]))) out[k] = input[k]; else if (input[k] !== undefined) notices.push({ level: 'warning', key: 'config.import_field_ignored', params: { field: k } }); };
  const bool = (k) => { if (typeof input[k] === 'boolean') out[k] = input[k]; else if (input[k] !== undefined) notices.push({ level: 'warning', key: 'config.import_field_ignored', params: { field: k } }); };
  str('region'); str('lang'); str('scenario');
  str('preset', PRESETS.map((p) => p.id));
  str('theme', ['light', 'dark', 'system']);
  str('density', ['comfortable', 'compact']);
  str('emphasis', ['table', 'chart', 'balanced']);
  str('narration', ['captions', 'audio-when-available', 'off']);
  str('startSection', SECTION_IDS);
  bool('lowData'); bool('privacyMode'); bool('animation'); bool('accessGate'); bool('studio');
  if (input.modules && typeof input.modules === 'object' && !Array.isArray(input.modules)) {
    out.modules = {};
    for (const m of OPTIONAL_MODULES) if (typeof input.modules[m] === 'boolean') out.modules[m] = input.modules[m];
  }
  if (Array.isArray(input.sectionOrder) && input.sectionOrder.every((s) => SECTION_IDS.includes(s))) out.sectionOrder = Array.from(new Set(input.sectionOrder));
  if (Array.isArray(input.pins) && input.pins.every((s) => typeof s === 'string' && s.length < 64)) out.pins = input.pins.slice(0, 12);
  if (input.branding && typeof input.branding === 'object') {
    out.branding = {};
    if (typeof input.branding.name === 'string') out.branding.name = input.branding.name.slice(0, 40);
    if (typeof input.branding.employerLabel === 'string') out.branding.employerLabel = input.branding.employerLabel.slice(0, 60);
    if (typeof input.branding.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.branding.accent)) out.branding.accent = input.branding.accent;
  }
  if (input.integrations && typeof input.integrations === 'object') {
    out.integrations = {};
    for (const k of ['assistant', 'queries', 'identity', 'verification']) {
      const v = input.integrations[k];
      if (v === null) out.integrations[k] = null;
      else if (v && typeof v === 'object' && typeof v.endpoint === 'string' && /^https:\/\//.test(v.endpoint)) out.integrations[k] = { endpoint: v.endpoint };
      else if (v !== undefined) notices.push({ level: 'warning', key: 'config.import_field_ignored', params: { field: `integrations.${k}` } });
    }
    if (input.integrations.wallet && typeof input.integrations.wallet === 'object') {
      out.integrations.wallet = {};
      for (const p of ['apple', 'google', 'samsung']) {
        const v = input.integrations.wallet[p];
        if (v && typeof v === 'object' && typeof v.endpoint === 'string' && /^https:\/\//.test(v.endpoint)) out.integrations.wallet[p] = { endpoint: v.endpoint };
      }
    }
  }
  for (const k of Object.keys(input)) {
    if (['region', 'lang', 'scenario', 'preset', 'theme', 'density', 'emphasis', 'narration', 'startSection', 'lowData', 'privacyMode', 'animation', 'accessGate', 'studio', 'modules', 'sectionOrder', 'pins', 'branding', 'integrations', 'version', 'kind'].includes(k)) continue;
    notices.push({ level: 'warning', key: 'config.import_field_ignored', params: { field: k } });
  }
  return out;
}

/**
 * Resolve the effective configuration.
 * @param registry  the data registry (profiles, languages, records, packageKind, defaultProfileId)
 */
export function resolveConfig({ launch, prefs, studioSettings, registry }) {
  const errors = [];
  const notices = [];
  const locked = {};
  const presentation = { ...DEFAULT_PRESENTATION, ...(prefs.presentation || {}), ...(studioSettings || {}), ...(launch.shared || {}) };
  if (launch.theme) presentation.theme = launch.theme;
  if (launch.density) presentation.density = launch.density;

  // --- Profile (jurisdiction) -------------------------------------------------
  let profileId = registry.defaultProfileId;
  const requested = launch.region || (studioSettings && studioSettings.region) || (launch.shared && launch.shared.region);
  if (registry.packageKind === 'employee') {
    // Issued-record constraint: an employee package is bound to one record. A URL parameter cannot change it.
    if (requested && requested !== registry.defaultProfileId) notices.push({ level: 'info', key: 'config.region_locked_employee', params: { region: registry.defaultProfileId } });
    locked.region = 'config.lock.employee_package';
  } else if (requested) {
    if (registry.profiles[requested]) profileId = requested;
    else errors.push({ key: 'config.unknown_region', params: { region: requested, available: Object.keys(registry.profiles).join(', ') } });
  }
  const profile = registry.profiles[profileId];

  // --- Scenario (record) ------------------------------------------------------
  let scenarioId = launch.scenario || (studioSettings && studioSettings.scenario) || null;
  const scenarios = registry.scenariosFor(profileId);
  if (registry.packageKind === 'employee') { scenarioId = scenarios[0] ? scenarios[0].id : null; locked.scenario = 'config.lock.employee_package'; }
  else if (scenarioId && !scenarios.some((s) => s.id === scenarioId)) {
    errors.push({ key: 'config.unknown_scenario', params: { scenario: scenarioId, region: profileId, available: scenarios.map((s) => s.id).join(', ') } });
    scenarioId = null;
  }
  if (!scenarioId) scenarioId = scenarios[0] ? scenarios[0].id : null;
  const record = registry.findRecord(profileId, scenarioId);

  // --- Language ---------------------------------------------------------------
  // Only languages the issued record approves are offered (record constraint), within the profile's list.
  const approved = record && Array.isArray(record.document.languages) ? profile.locales.filter((l) => record.document.languages.includes(l)) : profile.locales;
  let locale = profile.defaultLocale;
  const wantedLang = launch.lang || (studioSettings && studioSettings.lang) || (prefs.presentation && prefs.presentation.lang) || null;
  const langSource = launch.lang ? 'launch' : (studioSettings && studioSettings.lang) ? 'studio' : (prefs.presentation && prefs.presentation.lang) ? 'prefs' : null;
  if (wantedLang) {
    if (approved.includes(wantedLang) && registry.languages[wantedLang]) locale = wantedLang;
    else if (registry.packageKind === 'employee') {
      // Issued-record constraint: an employee package only offers the record's approved languages; disclose the fallback.
      notices.push({ level: 'info', key: 'config.fallback_disclosed', params: { lang: profile.defaultLocale, wanted: wantedLang } });
    } else if (langSource === 'launch' || langSource === 'studio') {
      // Explicit request for an unsupported combination: a visible error, with disclosed fallback option.
      errors.push({ key: 'config.unsupported_language', params: { lang: wantedLang, region: profileId, available: approved.join(', '), fallback: profile.defaultLocale } });
    } else {
      notices.push({ level: 'info', key: 'config.language_pref_not_available', params: { lang: wantedLang, fallback: profile.defaultLocale } });
    }
  }
  if (!registry.languages[locale]) errors.push({ key: 'config.language_pack_missing', params: { lang: locale } });

  // --- Preset and modules -----------------------------------------------------
  let presetId = launch.preset || presentation.preset || 'complete';
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) { errors.push({ key: 'config.unknown_preset', params: { preset: presetId, available: PRESETS.map((p) => p.id).join(', ') } }); presetId = 'complete'; }
  const presetDef = PRESETS.find((p) => p.id === presetId);
  const modules = { ...presetDef.modules, ...((studioSettings && studioSettings.modules) || {}), ...((launch.shared && launch.shared.modules) || {}) };
  // Modules the profile or record cannot support are disabled with a visible reason.
  if (record && (!record.time || !(record.time.entries || []).length) && !(record.time && record.time.leave)) { modules.timeLeave = false; locked.timeLeave = 'config.lock.no_time_data'; }
  if (record && !(record.history || []).length) { modules.whatChanged = false; locked.whatChanged = 'config.lock.no_history'; }

  const sectionOrder = (studioSettings && studioSettings.sectionOrder) || (prefs.presentation && prefs.presentation.sectionOrder) || presetDef.sectionOrder || SECTION_IDS;
  const startSection = launch.section || (studioSettings && studioSettings.startSection) || (prefs.presentation && prefs.presentation.startSection) || presetDef.startSection || 'my-pay';

  return {
    ok: errors.length === 0,
    errors,
    notices,
    locked,
    profileId,
    scenarioId,
    locale,
    approvedLocales: approved,
    preset: presetId,
    modules,
    sectionOrder: orderSections(sectionOrder, modules),
    startSection,
    presentation: { ...presentation, preset: presetId, emphasis: presentation.emphasis || presetDef.emphasis || 'balanced' },
    studio: Boolean(launch.studio) && registry.packageKind !== 'employee',
    packageKind: registry.packageKind,
    initialLine: launch.line || null,
  };
}

export function orderSections(order, modules) {
  const enabled = SECTION_IDS.filter((id) => {
    if (id === 'what-changed') return modules.whatChanged !== false;
    if (id === 'time-leave') return modules.timeLeave !== false;
    if (id === 'total-reward') return modules.totalReward !== false;
    return true;
  });
  const ordered = order.filter((id) => enabled.includes(id));
  for (const id of enabled) if (!ordered.includes(id)) ordered.push(id);
  // Required sections can be reordered but never removed; the record section stays last unless moved explicitly.
  return ordered;
}

/** Encode presentation settings as a shareable fragment value (configuration only, never personal data). */
export function encodeShared(settings) {
  const safe = validatePresentation(settings, []);
  delete safe.integrations; // endpoints are deployment configuration, not share-link content
  const json = JSON.stringify(safe);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
