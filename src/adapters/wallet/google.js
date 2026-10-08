import { WalletProvider } from './base.js';
/** Google Wallet: generic private pass requires explicit approval for sensitive-data use. */
export class GoogleWallet extends WalletProvider {
  constructor(opts) { super({ ...opts, id: 'google' }); }
  deviceSupported() { if (typeof navigator === 'undefined') return false; return /Android|Chrome/.test(navigator.userAgent); }
  extraReasons() { return this.endpoint ? [] : ['wallet.reason_approval']; }
}
