/**
 * Record verification adapter. "Verified" is only shown after a real successful check by a
 * service whose keys live outside this package. Without a service the status is 'unavailable'.
 */
export function createVerification({ integration, tokenProvider = null }) {
  if (!(integration && integration.endpoint)) return { connected: false, async verify() { return { status: 'unavailable' }; } };
  return {
    connected: true,
    name: new URL(integration.endpoint).host,
    async verify(record) {
      const token = tokenProvider ? await tokenProvider() : null;
      if (!token) return { status: 'unavailable', reason: 'no_token' };
      try {
        const res = await fetch(integration.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ documentRef: record.document.id, version: record.document.version, lines: record.lines.map((l) => [l.id, l.amountMinor]), totals: record.suppliedTotals }) });
        if (!res.ok) return { status: 'failed', reason: `http_${res.status}` };
        const data = await res.json();
        return data && data.verified === true ? { status: 'verified', service: this.name, at: data.verifiedAt || new Date().toISOString() } : { status: 'failed', reason: 'mismatch' };
      } catch (err) { return { status: 'failed', reason: 'network' }; }
    },
  };
}
