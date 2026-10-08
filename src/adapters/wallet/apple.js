import { WalletProvider } from './base.js';
/** Apple Wallet: needs a pass type identifier and signing certificate on the issuing server (never in the browser). */
export class AppleWallet extends WalletProvider {
  constructor(opts) { super({ ...opts, id: 'apple' }); }
  deviceSupported() { if (typeof navigator === 'undefined') return false; return /iPhone|iPad|Macintosh/.test(navigator.userAgent); }
  extraReasons() { return this.endpoint ? [] : ['wallet.reason_credentials']; }
}
