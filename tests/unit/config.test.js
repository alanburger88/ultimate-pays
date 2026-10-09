import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, validatePresentation, encodeShared, orderSections } from '../../src/app/config.js';
import * as registry from '../../src/data/index.js';

globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));

test('precedence: launch overrides prefs which override defaults', () => {
  const c = resolveConfig({ launch: { region: 'CA-ON', lang: 'fr-CA', preset: 'core' }, prefs: { presentation: { lang: 'en-CA', theme: 'dark' } }, studioSettings: null, registry });
  assert.equal(c.ok, true);
  assert.equal(c.locale, 'fr-CA');
  assert.equal(c.preset, 'core');
  assert.equal(c.presentation.theme, 'dark');
  assert.equal(c.modules.story, false);
});

test('an explicit unsupported language is a visible error, a saved preference falls back with a notice', () => {
  const explicit = resolveConfig({ launch: { region: 'CA-ON', lang: 'zu-ZA' }, prefs: {}, studioSettings: null, registry });
  assert.equal(explicit.ok, false);
  assert.equal(explicit.errors[0].key, 'config.unsupported_language');
  const saved = resolveConfig({ launch: { region: 'CA-ON' }, prefs: { presentation: { lang: 'zu-ZA' } }, studioSettings: null, registry });
  assert.equal(saved.ok, true);
  assert.equal(saved.locale, 'en-CA');
  assert.equal(saved.notices[0].key, 'config.language_pref_not_available');
});

test('unknown region and preset are rejected, never silently substituted', () => {
  const c = resolveConfig({ launch: { region: 'UK', preset: 'everything' }, prefs: {}, studioSettings: null, registry });
  assert.equal(c.ok, false);
  assert.deepEqual(c.errors.map((e) => e.key).sort(), ['config.unknown_preset', 'config.unknown_region']);
});

test('employee packages lock the region to the issued record', () => {
  const employeeRegistry = { ...registry, packageKind: 'employee', defaultProfileId: 'CA-ON' };
  const c = resolveConfig({ launch: { region: 'ZA' }, prefs: {}, studioSettings: null, registry: employeeRegistry });
  assert.equal(c.profileId, 'CA-ON');
  assert.equal(c.locked.region, 'config.lock.employee_package');
  assert.equal(c.studio, false);
});

test('presentation import is whitelisted and never carries code or credentials', () => {
  const notices = [];
  const out = validatePresentation({ theme: 'dark', density: 'huge', modules: { story: false, evil: true }, integrations: { assistant: { endpoint: 'http://insecure', token: 'x' } }, __proto__x: 1, onload: 'alert(1)' }, notices);
  assert.equal(out.theme, 'dark');
  assert.equal(out.density, undefined);
  assert.deepEqual(out.modules, { story: false });
  assert.equal(out.integrations.assistant, undefined);
  assert.ok(notices.length >= 3);
  const shared = encodeShared({ theme: 'dark', integrations: { assistant: { endpoint: 'https://x.example/a' } } });
  const decoded = JSON.parse(Buffer.from(shared.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.equal(decoded.integrations, undefined);
});

test('required sections survive any order and module choice', () => {
  const ordered = orderSections(['total-reward'], { whatChanged: false, timeLeave: false, totalReward: false });
  assert.deepEqual(ordered, ['my-pay', 'pay-details', 'record-actions']);
});

test('endpoints must be plain HTTPS without embedded credentials', async () => {
  const { safeEndpoint } = await import('../../src/app/config.js');
  assert.equal(safeEndpoint('https://payroll.example/queries'), 'https://payroll.example/queries');
  assert.equal(safeEndpoint('http://payroll.example/queries'), null);
  assert.equal(safeEndpoint('https://user:pw@payroll.example/'), null);
  assert.equal(safeEndpoint('https://payroll.example/q?api_key=1'), null);
  assert.equal(safeEndpoint('https://payroll.example/q?access_token=1'), null);
  assert.equal(safeEndpoint('javascript:alert(1)'), null);
});

test('a shared link can never set service endpoints; an employee link can only change appearance', () => {
  const shared = { theme: 'dark', branding: { name: 'Evil' }, modules: { story: false }, accessGate: true, integrations: { queries: { endpoint: 'https://attacker.example/collect' } } };
  const launch = { shared: validatePresentation(shared, []) };
  delete launch.shared.integrations; // readLaunch strips them; resolveConfig must not re-admit them either
  const employeeRegistry = { ...registry, packageKind: 'employee', defaultProfileId: 'CA-ON' };
  const emp = resolveConfig({ launch: { ...launch, shared: { ...launch.shared, integrations: shared.integrations } }, prefs: {}, studioSettings: null, registry: employeeRegistry });
  assert.equal(emp.presentation.integrations.queries, null);
  assert.equal(emp.presentation.theme, 'dark');
  assert.notEqual(emp.presentation.branding.name, 'Evil');
  assert.equal(emp.presentation.accessGate, false);
  assert.equal(emp.modules.story !== false, true);
  const pres = resolveConfig({ launch: { shared: { integrations: shared.integrations } }, prefs: {}, studioSettings: null, registry });
  assert.equal(pres.presentation.integrations.queries, null);
  const built = resolveConfig({ launch: { integrations: { queries: { endpoint: 'https://payroll.example/q' } } }, prefs: {}, studioSettings: null, registry });
  assert.deepEqual(built.presentation.integrations.queries, { endpoint: 'https://payroll.example/q' });
});

test('required time particulars keep Time & leave on in every preset', () => {
  const c = resolveConfig({ launch: { region: 'ZA', preset: 'core' }, prefs: {}, studioSettings: null, registry });
  assert.equal(c.modules.timeLeave, true);
  assert.equal(c.locked.timeLeave, 'config.lock.required_section');
  const on = resolveConfig({ launch: { region: 'CA-ON', preset: 'core' }, prefs: {}, studioSettings: null, registry });
  assert.equal(on.modules.timeLeave, false);
});

test('wallet emulation can be switched off by deployment configuration', async () => {
  const { validatePresentation } = await import('../../src/app/config.js');
  const on = validatePresentation({ integrations: { wallet: {} } });
  assert.equal(on.integrations.wallet.emulate, undefined, 'default leaves emulation on');
  const off = validatePresentation({ integrations: { wallet: { emulate: false } } });
  assert.equal(off.integrations.wallet.emulate, false);
});
