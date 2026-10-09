/**
 * Wallet provider adapters. Availability is determined per provider from
 * device, configured issuing service, country and provider response.
 * A standalone HTML file cannot sign passes; issuance always needs a server.
 */
import { AppleWallet } from './apple.js';
import { GoogleWallet } from './google.js';
import { SamsungWallet } from './samsung.js';
import { opaqueRef } from '../../app/persist.js';

export function walletProviders({ integration = {}, record, profile, tokenProvider = null }) {
  const common = { record, profile, tokenProvider, emulate: integration.emulate !== false };
  return [
    new AppleWallet({ ...common, endpoint: integration.apple ? integration.apple.endpoint : null }),
    new GoogleWallet({ ...common, endpoint: integration.google ? integration.google.endpoint : null }),
    new SamsungWallet({ ...common, endpoint: integration.samsung ? integration.samsung.endpoint : null }),
  ];
}

/**
 * Minimal pass content: brand, neutral label and an opaque reference. No amounts, period, identifiers,
 * employee numbers or bank details (the document id can embed employee-number digits, so it is not used).
 */
export function passPreview(record, { brand = 'Paylight', label = 'Pay statement' } = {}) {
  return { brand, label, reference: opaqueRef(record) };
}
