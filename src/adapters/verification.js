/**
 * Record verification adapter. "Verified" is only shown after a real successful check by a
 * service whose keys live outside this package.
 *
 * Status contract:
 *   verified    — the service checked the record and confirmed it (2xx, verified === true)
 *   failed      — the service checked the record and did NOT confirm it (2xx, verified !== true)
 *   unavailable — no check happened: no service, offline, no signed-in session, transport error or non-2xx
 * A transport or server error is never reported as a failed integrity check.
 */
export function createVerification({ integration, tokenProvider = null, fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null) }) {
  if (!(integration && integration.endpoint)) return { connected: false, name: null, async verify() { return { status: 'unavailable', reason: 'no_service' }; } };
  const name = new URL(integration.endpoint).host;
  return {
    connected: true,
    name,
    async verify(record) {
      if (!fetchImpl) return { status: 'unavailable', reason: 'no_fetch' };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'unavailable', reason: 'offline' };
      const token = tokenProvider ? await tokenProvider() : null;
      if (!token) return { status: 'unavailable', reason: 'no_token' };
      let res;
      try {
        res = await fetchImpl(integration.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ documentRef: record.document.id, version: record.document.version, lines: record.lines.map((l) => [l.id, l.amountMinor]), totals: record.suppliedTotals }) });
      } catch (err) { return { status: 'unavailable', reason: 'network' }; }
      if (!res.ok) return { status: 'unavailable', reason: `http_${res.status}` };
      let data;
      try { data = await res.json(); } catch (err) { return { status: 'unavailable', reason: 'bad_response' }; }
      if (data && data.verified === true) return { status: 'verified', service: name, at: typeof data.verifiedAt === 'string' && data.verifiedAt ? data.verifiedAt : null };
      return { status: 'failed', reason: typeof (data && data.reason) === 'string' ? data.reason.slice(0, 64) : 'not_confirmed' };
    },
  };
}
