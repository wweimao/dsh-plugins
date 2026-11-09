/** Public OAuth application configuration, never a user access or refresh token. */
export interface OfficialAppOAuthClientConfig {
  clientId: string
  clientSecret: string
}

/** Parse the reviewed App binary layout; this pure function does not verify authenticity. */
export declare function extractOfficialAppOAuthConfig(value: Uint8Array): OfficialAppOAuthClientConfig

/** Verify the installed Google-signed App and return its normal public OAuth application pair. */
export declare function importOfficialAppOAuthConfig(applicationPath?: string): Promise<OfficialAppOAuthClientConfig>
