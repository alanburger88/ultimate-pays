/**
 * Launch configuration parsing and validation, shared by the CLI and the build.
 * Validation is performed against the bundled data registry so that a
 * region/language combination the application cannot honour is rejected
 * before anything is served or built.
 */
export function parseArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}". Flags take the form --name=value.`);
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      flags[body] = true;
    } else {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return flags;
}

export const PRESETS = ['core', 'complete', 'hourly', 'total-reward'];

async function loadRegistry() {
  const mod = await import('../src/data/index.js');
  return mod;
}

export async function listProfiles() {
  const { profiles, scenariosFor } = await loadRegistry();
  const lines = [];
  for (const profile of Object.values(profiles)) {
    lines.push(`${profile.id}  ${profile.currency}  languages: ${profile.locales.join(', ')}`);
    for (const s of scenariosFor(profile.id)) lines.push(`    scenario ${s.id}: ${s.personaName} — ${s.summary}`);
  }
  return lines;
}

/**
 * @returns {{ok:boolean, errors:string[], warnings:string[], launch:object}}
 */
export async function validateLaunch(flags, { allowEmpty = false } = {}) {
  const { profiles, scenariosFor } = await loadRegistry();
  const errors = [];
  const warnings = [];
  const launch = {};
  const known = ['region', 'lang', 'preset', 'scenario', 'studio', 'employee', 'out', 'port', 'host', 'open', 'all', 'help', 'endpoints', 'narration'];
  for (const key of Object.keys(flags)) {
    if (!known.includes(key)) errors.push(`Unknown flag --${key}.`);
  }
  const region = flags.region;
  const lang = flags.lang;
  const preset = flags.preset;
  const scenario = flags.scenario;

  if (region !== undefined) {
    if (typeof region !== 'string' || !profiles[region]) {
      errors.push(`Unknown region "${region}". Available profiles: ${Object.keys(profiles).join(', ')}.`);
    } else {
      launch.region = region;
    }
  }
  if (lang !== undefined) {
    if (typeof lang !== 'string') {
      errors.push('--lang requires a value, e.g. --lang=fr-CA.');
    } else if (launch.region) {
      const profile = profiles[launch.region];
      if (!profile.locales.includes(lang)) {
        errors.push(`Language "${lang}" is not available for profile ${launch.region}. Available: ${profile.locales.join(', ')}.`);
      } else {
        launch.lang = lang;
      }
    } else {
      const supportedAnywhere = Object.values(profiles).some((p) => p.locales.includes(lang));
      if (!supportedAnywhere) errors.push(`Language "${lang}" is not available in any bundled profile.`);
      else {
        launch.lang = lang;
        warnings.push(`--lang=${lang} was given without --region; the language is only applied where the selected profile supports it.`);
      }
    }
  }
  if (preset !== undefined) {
    if (!PRESETS.includes(preset)) errors.push(`Unknown preset "${preset}". Available presets: ${PRESETS.join(', ')}.`);
    else launch.preset = preset;
  }
  if (scenario !== undefined) {
    if (!launch.region) errors.push('--scenario requires --region.');
    else {
      const list = scenariosFor(launch.region);
      if (!list.some((s) => s.id === scenario)) {
        errors.push(`Unknown scenario "${scenario}" for ${launch.region}. Available: ${list.map((s) => s.id).join(', ')}.`);
      } else launch.scenario = scenario;
    }
  }
  if (flags.narration !== undefined && !['on', 'off'].includes(flags.narration)) errors.push('--narration takes on or off.');
  if (flags.endpoints !== undefined) {
    // Deployment endpoints for connected services, embedded in the build (never taken from a link).
    try {
      const fs = await import('node:fs');
      const { validatePresentation } = await import('../src/app/config.js');
      const raw = JSON.parse(fs.readFileSync(String(flags.endpoints), 'utf8'));
      const notices = [];
      const v = validatePresentation({ integrations: raw.integrations || raw }, notices);
      for (const n of notices) errors.push(`--endpoints: invalid value for ${n.params && n.params.field}. Endpoints must be plain https:// URLs with no user name, password, key or token in them. Nothing was built.`);
      if (v.integrations) launch.integrations = v.integrations;
    } catch (err) {
      errors.push(`--endpoints: could not read ${flags.endpoints}: ${err.message}`);
    }
  }
  if (flags.studio) launch.studio = true;
  if (flags.employee) {
    if (!launch.region) errors.push('--employee requires --region (an employee package contains exactly one recipient).');
    launch.employee = true;
  }
  if (!allowEmpty && !launch.region) {
    warnings.push('No --region given; the presenter bundle opens on its default profile (CA-ON).');
  }
  return { ok: errors.length === 0, errors, warnings, launch };
}

export function formatValidation(result) {
  const lines = [];
  for (const e of result.errors) lines.push(`error: ${e}`);
  for (const w of result.warnings) lines.push(`warning: ${w}`);
  if (result.errors.length) lines.push('Run `paylight list` to see available profiles, languages, and scenarios.');
  return lines.join('\n');
}
