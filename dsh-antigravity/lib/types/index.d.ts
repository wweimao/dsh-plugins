/** Independent Google Anti Gravity provider route and OAuth settings service. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { createAntiGravityOAuth } from './auth.ts';
export { DEFAULT_OAUTH_CLIENT_CONFIG_REF, extractOAuthClientConfig, importInstalledOAuthClientConfig, parseOAuthClientConfig, resolveOAuthClientConfig, } from './client-config.ts';
export type { AntiGravityOAuthClientConfig } from './client-config.ts';
export { AntiGravityCredentialManager, parseAntiGravityCredential, } from './credential.ts';
export { fetchAvailableModels, fetchAvailableModelsForCredential, maintainedModels, parseAvailableModels, PROVIDER, } from './models.ts';
export { AntiGravityAuthRemote } from './remote-service.ts';
export type { AntiGravityAuthSnapshot, AntiGravityLoginId, AntiGravityLoginStart, AntiGravityLoginStatus, } from './types.ts';
export declare const name = "llm-pi-ai-antigravity";
export declare const inject: string[];
/** Deployment configuration contains references and paths, never OAuth values. */
export interface Config {
    /** Profile-scoped model enable overrides, including explicit false. */
    modelEnabled?: Record<string, boolean>;
    /** Credential reference containing the OAuth token JSON document. */
    oauthCredentialEnv?: string;
    /** Credential reference containing the private OAuth client JSON document. */
    oauthClientConfigRef?: string;
    /** Optional official Antigravity App path; strict Google signature verification is required. */
    macosApplicationPath?: string;
    /** Windows Antigravity App directory, not the older IDE directory. */
    windowsApplicationPath?: string;
    /** Explicitly approved supported unsigned language-server SHA-256. */
    windowsApplicationSha256?: string;
    /** Provider label shown in model selectors. */
    displayName?: string;
    /** Maximum provider idle time while one stream read is outstanding. */
    streamIdleTimeoutMs?: number;
    /**
     * Base64 image payload bound for one request. Older images become text
     * placeholders once a session's accumulated images exceed it, so a long
     * session keeps completing requests instead of being refused for size.
     */
    maxRequestImageBytes?: number;
    /** Total-pixel budget for each deterministic inline request version. */
    requestImagePixelBudget?: number;
    /** Raw encoded-byte cap for each deterministic inline request version. */
    requestImageMaxBytes?: number;
}
/** Schemastery validator for the independent Anti Gravity route. */
export declare const Config: z<Config>;
/**
 * Register Anti Gravity inference, OAuth Remote methods, and the maintained/live catalog.
 * @param ctx - Cordis context providing LLM, credential, and optional attachment services.
 * @param rawConfig - validated plugin configuration.
 */
export declare function apply(ctx: Context, rawConfig: Config): void;
//# sourceMappingURL=index.d.ts.map