import { opaqueRef } from '../../app/persist.js';
/** Shared behaviour for wallet providers. */
export class WalletProvider {
  constructor({ id, endpoint, record, profile, tokenProvider, emulate = true }) { this.id = id; this.endpoint = endpoint || null; this.record = record; this.profile = profile; this.tokenProvider = tokenProvider; this.state = 'idle'; this.emulated = !this.endpoint && emulate !== false; }
  /** @returns {{state:'unavailable'|'preview'|'ready', reasons:string[]}} reasons are i18n keys */
  availability() {
    // No issuing service connected: the add flow is emulated on screen (presenter builds and demos).
    if (this.emulated) return { state: this.state === 'added' ? 'added' : 'ready', reasons: [], emulated: true };
    const reasons = [];
    if (!this.endpoint) reasons.push('wallet.reason_no_service');
    if (!this.deviceSupported()) reasons.push('wallet.reason_device');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) reasons.push('wallet.reason_offline');
    reasons.push(...this.extraReasons());
    return { state: reasons.length ? (this.endpoint ? 'unavailable' : 'preview') : 'ready', reasons };
  }
  deviceSupported() { return true; }
  extraReasons() { return []; }
  requirementKey() { return `wallet.req_${this.id}`; }
  /**
   * Opens an add request with the issuing service. Resolves { state: 'requested'|'issued'|'added', url? }.
   * 'added' is only returned when the provider confirms; otherwise the honest state is 'requested'.
   */
  async request() {
    if (this.emulated) { this.state = 'added'; return { state: 'added', emulated: true }; }
    const a = this.availability();
    if (a.state !== 'ready') { const e = new Error('unavailable'); e.code = 'unavailable'; e.reasons = a.reasons; throw e; }
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (!token) { const e = new Error('no credential'); e.code = 'no_token'; throw e; }
    const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ provider: this.id, documentRef: opaqueRef(this.record) }) });
    if (!res.ok) { const e = new Error(`http ${res.status}`); e.code = `http_${res.status}`; throw e; }
    const data = await res.json();
    if (!data || typeof data.url !== 'string') { const e = new Error('bad response'); e.code = 'bad_response'; throw e; }
    this.state = data.state === 'added' ? 'added' : data.state === 'issued' ? 'issued' : 'requested';
    return { state: this.state, url: data.url };
  }
}
