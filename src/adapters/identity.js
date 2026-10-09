/**
 * Identity adapter.
 *
 * Without a configured endpoint there is no authentication. The optional local
 * access screen is presentation only and says so.
 *
 * With an endpoint, the adapter expects a backend-for-frontend token endpoint
 * that sits behind the organisation's approved sign-in. The browser already
 * holds that sign-in as an HttpOnly session cookie, so the adapter sends a
 * credentialed GET and receives a short-lived bearer token for the payroll
 * services:
 *
 *   GET <endpoint>?document=<id>&version=<n>   (credentials: 'include')
 *   200 { "access_token": "…", "expires_in": 300, "subject": "opaque-id" }
 *   401/403 → not signed in or not authorised for this document
 *
 * The token is held in memory only, scoped to this document, refreshed shortly
 * before expiry, and never written to storage, the URL or the HTML.
 */
export function createIdentity({ integration, documentRef = null, fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null), now = () => Date.now() }) {
  if (!(integration && integration.endpoint)) {
    return { connected: false, name: null, status: () => ({ state: 'unavailable' }), async token() { return null; } };
  }
  const endpoint = integration.endpoint;
  let cached = null; // { value, expiresAt }
  let inflight = null;
  let last = { state: 'idle' };

  async function fetchToken() {
    if (!fetchImpl) { last = { state: 'unavailable', reason: 'no_fetch' }; return null; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { last = { state: 'offline' }; return null; }
    const url = new URL(endpoint);
    if (documentRef) { url.searchParams.set('document', documentRef.id); url.searchParams.set('version', String(documentRef.version)); }
    let res;
    try {
      res = await fetchImpl(url.toString(), { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
    } catch (err) { last = { state: 'error', reason: 'network' }; return null; }
    if (res.status === 401 || res.status === 403) { last = { state: 'signed_out', reason: `http_${res.status}` }; return null; }
    if (!res.ok) { last = { state: 'error', reason: `http_${res.status}` }; return null; }
    let data;
    try { data = await res.json(); } catch (err) { last = { state: 'error', reason: 'bad_response' }; return null; }
    if (!data || typeof data.access_token !== 'string' || !data.access_token) { last = { state: 'error', reason: 'bad_response' }; return null; }
    const ttl = Number.isFinite(data.expires_in) && data.expires_in > 0 ? Math.min(data.expires_in, 3600) : 300;
    cached = { value: data.access_token, expiresAt: now() + ttl * 1000 };
    last = { state: 'signed_in' };
    return cached.value;
  }

  return {
    connected: true,
    name: new URL(endpoint).host,
    status: () => ({ ...last }),
    /** Resolves a bearer token, or null when there is no authorised session. Never throws. */
    async token() {
      if (cached && cached.expiresAt - now() > 30000) return cached.value;
      if (!inflight) inflight = fetchToken().finally(() => { inflight = null; });
      return inflight;
    },
    /** Drop the in-memory token (scenario switch, sign-out). */
    clear() { cached = null; last = { state: 'idle' }; },
  };
}
