/**
 * Payroll query submission adapter.
 *  - NullQueryService: nothing is connected. submit() rejects with code 'no_service'; drafts stay local.
 *  - HttpQueryService: POSTs the reviewed payload with an idempotency key; resolves only on a
 *    service acknowledgement carrying a case reference. No reference is ever invented client-side.
 */
export function createQueryService({ integration, tokenProvider = null, fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null) }) {
  if (integration && integration.endpoint) return new HttpQueryService({ endpoint: integration.endpoint, tokenProvider, fetchImpl });
  return new NullQueryService();
}

export class NullQueryService {
  constructor() { this.connected = false; this.name = null; }
  async submit() { const err = new Error('No payroll query service is connected'); err.code = 'no_service'; throw err; }
}

export class HttpQueryService {
  constructor({ endpoint, tokenProvider, fetchImpl }) { this.connected = true; this.endpoint = endpoint; this.name = new URL(endpoint).host; this.tokenProvider = tokenProvider; this.fetchImpl = fetchImpl; }
  /**
   * @param payload { documentRef:{id,version}, lineIds, amounts:{lineId:minor}, currency, entryIds, entries:[{id,date}], tag, tags:{lineId:tagId}, notes:{lineId:text}, subject, message, locale, idempotencyKey }
   * @param options { idempotencyKey }
   * @returns {Promise<{caseReference:string, acknowledgedAt:string|null, nextStep?:string}>}  (acknowledgedAt only as stated by the service)
   */
  async submit(payload, { idempotencyKey, signal } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { const e = new Error('offline'); e.code = 'offline'; throw e; }
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (!token) { const e = new Error('No credential available'); e.code = 'no_token'; throw e; }
    let res;
    try {
      res = await this.fetchImpl(this.endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) });
    } catch (err) { const e = new Error('Network failure'); e.code = 'network'; throw e; }
    if (res.status === 409) { const e = new Error('Duplicate submission'); e.code = 'duplicate'; try { e.caseReference = (await res.json()).caseReference; } catch (x) { /* ignore */ } throw e; }
    if (!res.ok) { const e = new Error(`Service responded ${res.status}`); e.code = `http_${res.status}`; throw e; }
    const data = await res.json();
    if (!data || typeof data.caseReference !== 'string' || !data.caseReference) { const e = new Error('No case reference in acknowledgement'); e.code = 'no_ack'; throw e; }
    return { caseReference: data.caseReference, acknowledgedAt: typeof data.acknowledgedAt === 'string' ? data.acknowledgedAt : null, nextStep: typeof data.nextStep === 'string' ? data.nextStep : null };
  }
}
