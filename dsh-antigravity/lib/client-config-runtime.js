/** Application identity resolution; user OAuth tokens are owned by the separate credential manager. */
import { importOfficialAppOAuthConfig, extractOfficialAppOAuthConfig } from './app-oauth.js';

const CLIENT_ID_PATTERN = /^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]+$/;
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAC_REF = 'GOOGLE_ANTIGRAVITY_APP_OAUTH_CLIENT_CONFIG';
const WINDOWS_REF = 'GOOGLE_ANTIGRAVITY_WINDOWS_APP_OAUTH_CLIENT_CONFIG';
export const DEFAULT_OAUTH_CLIENT_CONFIG_REF = process.platform === 'win32' ? WINDOWS_REF : MAC_REF;

function validateClientConfig(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Anti Gravity OAuth client configuration must be a JSON object');
  }
  const { clientId, clientSecret } = value;
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientId');
  }
  if (typeof clientSecret !== 'string' || !CLIENT_SECRET_PATTERN.test(clientSecret)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientSecret');
  }
  return { clientId, clientSecret };
}

export function parseOAuthClientConfig(value) {
  try { return validateClientConfig(JSON.parse(value)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('Anti Gravity OAuth client configuration is not valid JSON');
    throw error;
  }
}

export function extractOAuthClientConfig(source) {
  return validateClientConfig(extractOfficialAppOAuthConfig(source));
}

export async function importInstalledOAuthClientConfig(applicationPath, options = {}) {
  return validateClientConfig(await importOfficialAppOAuthConfig(applicationPath, options));
}

/** A pinned Windows import is not an Apple/Google signature attestation. Never relabel its cache. */
export async function resolveOAuthClientConfig(
  credentials, refValue = DEFAULT_OAUTH_CLIENT_CONFIG_REF, applicationPath,
  importer = importInstalledOAuthClientConfig, options = {},
) {
  if (typeof refValue !== 'string' || !CREDENTIAL_REF_PATTERN.test(refValue)) {
    throw new Error('Anti Gravity OAuth client credential reference must be a POSIX identifier');
  }
  const platform = options.platform ?? process.platform;
  const windows = platform === 'win32';
  if (!windows && platform !== 'darwin') {
    throw new Error('Anti Gravity application import supports macOS and the approved Windows build only');
  }
  const sha256 = options.sha256;
  if (windows && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))) {
    throw new Error('Windows Anti Gravity import requires an explicitly approved windowsApplicationSha256');
  }
  const defaultRef = windows ? WINDOWS_REF : MAC_REF;
  const ref = ['GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG', MAC_REF, WINDOWS_REF].includes(refValue) ? defaultRef : refValue;
  const expectedSource = windows ? 'windows-app-pinned' : 'official-app';
  const existing = await credentials.resolve(ref);
  if (existing !== undefined) {
    let cached;
    try { cached = JSON.parse(existing.value); }
    catch { throw new Error('Anti Gravity App client configuration is not valid JSON'); }
    if (cached?.source === expectedSource && (!windows || cached.binarySha256 === sha256)) {
      return validateClientConfig(cached);
    }
  }
  const imported = validateClientConfig(await importer(applicationPath, windows ? { sha256 } : {}));
  await credentials.set(ref, JSON.stringify({
    ...imported, source: expectedSource, ...(windows ? { binarySha256: sha256 } : {}),
  }));
  return imported;
}
