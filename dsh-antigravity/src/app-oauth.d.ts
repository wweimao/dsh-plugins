/** Public OAuth application configuration, never a user access or refresh token. */
export interface OfficialAppOAuthClientConfig {
  clientId: string
  clientSecret: string
}

/** Parse the reviewed App binary layout; this pure function does not verify authenticity. */
export declare function extractOfficialAppOAuthConfig(value: Uint8Array): OfficialAppOAuthClientConfig

/** macOS: Google signature + sealed Mach-O. Windows: explicitly approved, hash-pinned local PE build. */
export declare function importOfficialAppOAuthConfig(applicationPath?: string, options?: { sha256?: string }): Promise<OfficialAppOAuthClientConfig>
