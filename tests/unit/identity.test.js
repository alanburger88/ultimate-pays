import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../../src/adapters/identity.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('without an endpoint there is no token and no claim of connection', async () => {
  const id = createIdentity({ integration: null });
  assert.equal(id.connected, false);
  assert.equal(await id.token(), null);
});

test('fetches a credentialed, document-scoped token and caches it until near expiry', async () => {
  const calls = [];
  let t = 1_000_000;
  const id = createIdentity({
    integration: { endpoint: 'https://bff.example/token' },
    documentRef: { id: 'DOC-1', version: 2 },
    now: () => t,
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return ok({ access_token: `tok-${calls.length}`, expires_in: 120 }); },
  });
  assert.equal(await id.token(), 'tok-1');
  assert.equal(calls[0].opts.credentials, 'include');
  assert.match(calls[0].url, /document=DOC-1&version=2/);
  t += 60_000;
  assert.equal(await id.token(), 'tok-1');
  t += 40_000; // within 30 s of expiry → refresh
  assert.equal(await id.token(), 'tok-2');
  assert.equal(id.status().state, 'signed_in');
});

test('concurrent callers share one request', async () => {
  let n = 0;
  const id = createIdentity({ integration: { endpoint: 'https://bff.example/token' }, fetchImpl: async () => { n++; await new Promise((r) => setTimeout(r, 10)); return ok({ access_token: 'x', expires_in: 300 }); } });
  const [a, b] = await Promise.all([id.token(), id.token()]);
  assert.equal(a, 'x'); assert.equal(b, 'x'); assert.equal(n, 1);
});

test('signed-out, server errors, bad bodies and network failures yield null with a truthful status', async () => {
  const cases = [
    [async () => ({ ok: false, status: 401, json: async () => ({}) }), 'signed_out'],
    [async () => ({ ok: false, status: 500, json: async () => ({}) }), 'error'],
    [async () => ok({ token: 'wrong-field' }), 'error'],
    [async () => { throw new Error('down'); }, 'error'],
  ];
  for (const [fetchImpl, state] of cases) {
    const id = createIdentity({ integration: { endpoint: 'https://bff.example/token' }, fetchImpl });
    assert.equal(await id.token(), null);
    assert.equal(id.status().state, state);
  }
});
