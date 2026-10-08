/**
 * Assistant adapter contract (Lumi). Two implementations:
 *  - LocalAssistant: deterministic document search + authored explanations. No model.
 *  - HttpAssistant: a connected governed service. Requires an HTTPS endpoint from
 *    configuration and a bearer token supplied at runtime (never embedded).
 * The adapter never computes money; it returns references the UI resolves via calc.js.
 */
export function createAssistant({ integration, tokenProvider = null, fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null) }) {
  if (integration && integration.endpoint) return new HttpAssistant({ endpoint: integration.endpoint, tokenProvider, fetchImpl });
  return new LocalAssistant();
}

export class LocalAssistant {
  constructor() { this.kind = 'local'; this.name = 'local'; }
  capabilities() { return { kind: 'local', connected: false, generative: false, canSubmitQueries: false }; }
  /** The local assistant answers nothing itself; the UI's local engine (ui/lumi-local.js) handles questions. */
  async ask() { return { status: 'local', text: null, sources: [] }; }
}

export class HttpAssistant {
  constructor({ endpoint, tokenProvider, fetchImpl }) {
    this.kind = 'connected'; this.name = new URL(endpoint).host; this.endpoint = endpoint; this.tokenProvider = tokenProvider; this.fetchImpl = fetchImpl;
  }
  capabilities() { return { kind: 'connected', connected: true, generative: true, canSubmitQueries: false, service: this.name }; }
  /**
   * @param {object} payload { question, documentRef, lineIds, sectionId, locale }
   * Response contract: { answer: string, sources: [{type:'line'|'policy'|'glossary'|'explanation', id}], suggestions?: string[] }
   * Any numeric claim in `answer` is displayed as text; the UI re-derives figures from calc.js for the cited lines.
   */
  async ask(payload, { signal } = {}) {
    if (!this.fetchImpl) return { status: 'unavailable', reason: 'no_fetch' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (!token) return { status: 'unavailable', reason: 'no_token' };
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: String(payload.question).slice(0, 2000), documentRef: payload.documentRef, lineIds: payload.lineIds || [], sectionId: payload.sectionId || null, locale: payload.locale }),
      });
      if (!res.ok) return { status: 'error', reason: `http_${res.status}` };
      const data = await res.json();
      if (typeof data.answer !== 'string') return { status: 'error', reason: 'bad_response' };
      return { status: 'ok', text: data.answer, sources: Array.isArray(data.sources) ? data.sources.filter((s) => s && typeof s.id === 'string' && typeof s.type === 'string') : [], suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter((s) => typeof s === 'string').slice(0, 4) : [] };
    } catch (err) {
      return { status: 'error', reason: err && err.name === 'AbortError' ? 'aborted' : 'network' };
    }
  }
}
