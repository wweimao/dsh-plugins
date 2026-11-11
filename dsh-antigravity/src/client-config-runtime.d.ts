import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'

export interface AntiGravityOAuthClientConfig { clientId: string; clientSecret: string }
export interface AppImportOptions { sha256?: string }
export interface ClientConfigOptions extends AppImportOptions { platform?: string }
export const DEFAULT_OAUTH_CLIENT_CONFIG_REF: string
export function parseOAuthClientConfig(value: string): AntiGravityOAuthClientConfig
export function extractOAuthClientConfig(source: Uint8Array): AntiGravityOAuthClientConfig
export function importInstalledOAuthClientConfig(applicationPath?: string, options?: AppImportOptions): Promise<AntiGravityOAuthClientConfig>
export function resolveOAuthClientConfig(
  credentials: Pick<CredentialProvider, 'resolve' | 'set'>,
  refValue?: string,
  applicationPath?: string,
  importer?: (applicationPath?: string, options?: AppImportOptions) => Promise<AntiGravityOAuthClientConfig>,
  options?: ClientConfigOptions,
): Promise<AntiGravityOAuthClientConfig>
