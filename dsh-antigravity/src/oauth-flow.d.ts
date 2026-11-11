import type { OAuthAuth } from '@earendil-works/pi-ai'
import type { AntiGravityOAuthClientConfig } from './client-config-runtime.js'

export function antiGravityHeaders(access: string): Record<string, string>
export function createAntiGravityOAuth(
  resolveClientConfig: () => Promise<AntiGravityOAuthClientConfig>,
  options?: { fetch?: typeof globalThis.fetch; timeoutMs?: number },
): OAuthAuth
