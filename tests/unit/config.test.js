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
