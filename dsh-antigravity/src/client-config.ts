/** Resolve Anti Gravity's OAuth application identity without shipping it in source. */

import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { importOfficialAppOAuthConfig, extractOfficialAppOAuthConfig } from './app-oauth.js'

const CLIENT_ID_PATTERN = /^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/
const CLIENT_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]+$/
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** App-only cache; the old IDE-derived client configuration is never read. */
export const DEFAULT_OAUTH_CLIENT_CONFIG_REF = 'GOOGLE_ANTIGRAVITY_APP_OAUTH_CLIENT_CONFIG'

/** OAuth application identity imported from an official installed client. */
export interface AntiGravityOAuthClientConfig {
  clientId: string
  clientSecret: string
}

type CredentialStore = Pick<CredentialProvider, 'resolve' | 'set'>

function validateClientConfig(value: unknown): AntiGravityOAuthClientConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Anti Gravity OAuth client configuration must be a JSON object')
  }
  const { clientId, clientSecret } = value as Record<string, unknown>
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientId')
  }
  if (typeof clientSecret !== 'string' || !CLIENT_SECRET_PATTERN.test(clientSecret)) {
    throw new Error('Anti Gravity OAuth client configuration has an invalid clientSecret')
  }
  return { clientId, clientSecret }
}

/**
 * Parse one credential-store value without exposing either field in diagnostics.
 * @param value - Serialized OAuth client configuration from the credential store.
 * @returns Validated client id and client secret.
 */
export function parseOAuthClientConfig(value: string): AntiGravityOAuthClientConfig {
  try {
    return validateClientConfig(JSON.parse(value))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Anti Gravity OAuth client configuration is not valid JSON')
    }
    throw error
  }
}

/** Extract only the reviewed consumer configuration from the official App binary. */
export function extractOAuthClientConfig(source: Uint8Array): AntiGravityOAuthClientConfig {
  return validateClientConfig(extractOfficialAppOAuthConfig(source))
}

/** No IDE fallback: signature verification and sealed binary parsing are App-owned. */
export async function importInstalledOAuthClientConfig(applicationPath?: string): Promise<AntiGravityOAuthClientConfig> {
  return validateClientConfig(await importOfficialAppOAuthConfig(applicationPath))
}

/**
 * Resolve the private client config, importing and persisting it once when absent.
 * @param credentials - Credential store that owns the private client pair.
 * @param refValue - Credential reference used for the serialized client pair.
 * @param applicationPath - Optional explicit application bundle path for first import.
 * @param importer - Import operation used when the credential reference is absent.
 * @returns Validated client configuration for the next OAuth operation.
 */
export async function resolveOAuthClientConfig(
  credentials: CredentialStore,
  refValue = DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  applicationPath?: string,
  importer: (applicationPath?: string) => Promise<AntiGravityOAuthClientConfig> = importInstalledOAuthClientConfig,
): Promise<AntiGravityOAuthClientConfig> {
  if (!CREDENTIAL_REF_PATTERN.test(refValue)) {
    throw new Error('Anti Gravity OAuth client credential reference must be a POSIX identifier')
  }
  const ref = (refValue === 'GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG'
    ? DEFAULT_OAUTH_CLIENT_CONFIG_REF : refValue) as CredentialRef
  const existing = await credentials.resolve(ref)
  if (existing !== undefined) {
    let cached: unknown
    try {
      cached = JSON.parse(existing.value)
    } catch {
      throw new Error('Anti Gravity App client configuration is not valid JSON')
    }
    if (typeof cached === 'object' && cached !== null && 'source' in cached && cached.source === 'official-app') {
      return validateClientConfig(cached)
    }
  }
  const imported = validateClientConfig(await importer(applicationPath))
  await credentials.set(ref, JSON.stringify({ ...imported, source: 'official-app' }))
  return imported
}
