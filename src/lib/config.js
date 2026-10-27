/**
 * Runtime configuration, in one place. VITE_* values are inlined at BUILD time, so a production
 * build without them is simply wrong; failing loudly names the reason instead of leaving forty
 * failed requests to be reverse-engineered. The localhost defaults are for development only.
 */
const configuredApiUrl = import.meta.env.VITE_API_URL;

if (!configuredApiUrl && import.meta.env.PROD) {
  const message = 'VITE_API_URL is not set. This build cannot reach the CRM service. Set it (with the /api/v1 path, no trailing slash) and rebuild.';
  console.error(`[config] ${message}`);
  throw new Error(message);
}

export const API_BASE_URL = configuredApiUrl || 'http://localhost:4008/api/v1';

/** Where somebody who is not signed in goes: Inventory's sign-in sets the cookie both apps read. */
export const INVENTORY_URL = import.meta.env.VITE_INVENTORY_URL || 'http://localhost:5173';
