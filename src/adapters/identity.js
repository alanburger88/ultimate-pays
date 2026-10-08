/** Identity adapter. Without a connected service there is no authentication; a local gate is presentation only. */
export function createIdentity({ integration }) {
  if (integration && integration.endpoint) return { connected: true, name: new URL(integration.endpoint).host, async token() { return null; } };
  return { connected: false, name: null, async token() { return null; } };
}
