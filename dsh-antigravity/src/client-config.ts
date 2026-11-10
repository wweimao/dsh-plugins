/** Source/runtime share one application-identity resolver; no OAuth values are embedded here. */
export {
  DEFAULT_OAUTH_CLIENT_CONFIG_REF,
  extractOAuthClientConfig,
  importInstalledOAuthClientConfig,
  parseOAuthClientConfig,
  resolveOAuthClientConfig,
} from './client-config-runtime.js'
export type { AntiGravityOAuthClientConfig } from './client-config-runtime.js'
