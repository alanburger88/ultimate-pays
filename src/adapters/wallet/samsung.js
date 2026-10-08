import { WalletProvider } from './base.js';
/** Samsung Wallet: partner onboarding and credentials required. */
export class SamsungWallet extends WalletProvider {
  constructor(opts) { super({ ...opts, id: 'samsung' }); }
  deviceSupported() { if (typeof navigator === 'undefined') return false; return /Android/.test(navigator.userAgent); }
  extraReasons() { return this.endpoint ? [] : ['wallet.reason_credentials']; }
}
