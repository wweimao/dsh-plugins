# DSH Plugin: LLM Provider - Anti Gravity

[中文](README.zh.md) | English

Allows connecting to the **Google Anti Gravity** Coding Plan as an LLM Provider, enabling [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) to directly use all top-tier AI models under your account (including Gemini 3.7/3.6/3.5 Flash, Gemini 3.1 Pro, Claude 3.7 / Opus 4.6, GPT-OSS, etc.) for seamless web-based chat and coding.

## Target Audience and Use Cases

Designed for developers with Google Anti Gravity IDE installed or active Cloud Code Assist entitlements who want to access these high-performance models within the unified DeepSeek Harness workspace for coding, reasoning, and tool execution.

## Key Features

- **Lightweight Native Direct Connection**: Directly connects over HTTPS to Cloud Code Assist without spawning background `agy` subprocesses or IDE instances.
- **One-Click macOS Authorization**: Automatically validates and imports signed macOS Anti Gravity client configurations, opening the standard browser OAuth flow without manual Client ID/Secret copying.
- **Dynamic Model Discovery**: Queries the live `fetchAvailableModels` endpoint to surface reviewed Gemini, Claude, and GPT-OSS model variants.
- **Independent Provider Route**: The plugin registers its own `google-antigravity` adapter, owns its catalog, and resolves OAuth. It reuses the exported `PiAiAdapter` only for Harness message and stream conversion.
- **Built-in Login Page**: A package-owned Typert Remote provides login start, status polling, and logout; the browser half registers a dedicated Anti Gravity settings page.
- **Clean Native Experience**: Preserves thinking signatures, streaming output, and tool invocation contracts without injected provider system prompts, synthetic messages, or custom headers.

## Installation and Quick Start

Install a reviewed revision into a DeepSeek Harness profile. The repository provides a `dsh.bundle` patch and prebuilt runtime artifacts so no local build steps are required:

```sh
git clone https://github.com/wweimao/dsh-plugins.git
dsh plugin --profile <profile> add ./dsh-plugins/dsh-antigravity
```

This is a multi-plugin repository: install the individual subdirectory, not the repository root. Without the CLI, the DSH plugin manager can install that subdirectory as a local package.

The installed bundle contributes the following Cordis configuration:

```yaml
- id: llm-pi-ai-antigravity
  name: '@deepseek-ai/dsh-llm-pi-ai-antigravity'
  config:
    displayName: Google Anti Gravity
```

Both `oauthCredentialEnv` and `oauthClientConfigRef` name credential references. The bundled local provider stores documents in `$DSH_HOME/.credentials.yaml`; deployments may use another credential backend.

## Windows support (0.1.0-rc.5.quota.1.windows.1)

This revision supports the reviewed **Antigravity App 2.30.0, Windows x64** build, not the older IDE. It locates `%LOCALAPPDATA%\Programs\antigravity` by default; use `windowsApplicationPath` for another installation directory.

- The supported Windows build has no verifiable Authenticode signature. Each installer must independently verify its provenance and compute `resources/bin/language_server.exe` SHA-256. This revision supports only `d82033662f9a803a8d51805e1bef3520d77fe7948b4a5fd142b5f55a0053637b`; after deciding to trust it, explicitly set `windowsApplicationSha256` to that value in the plugin configuration. **The public bundle does not set this option; Windows import refuses to run without it.** A hash match is not Google signature verification or another user's approval.
- The importer bounds file size, rejects nonregular files and symlink/junction/path escapes, checks read stability, validates the entire binary hash, and then follows the reviewed PE/Go function/type data flow. It never executes the application, reads user tokens/databases/IDE state, or guesses a pair from binary-wide OAuth strings.
- Windows application identity and account tokens use isolated `GOOGLE_ANTIGRAVITY_WINDOWS_APP_OAUTH_CLIENT_CONFIG` and `GOOGLE_ANTIGRAVITY_WINDOWS_APP_OAUTH_CREDENTIAL` references. The identity cache says `windows-app-pinned`, never `official-app`. No older IDE/other-client tokens are migrated.
- Fresh import supports only this exact hash. A new build requires code review and renewed user approval, not merely changing a configuration hash. An existing credential-service application cache retains its original approved pin; an application update does not silently import new program data.
- Browser OAuth keeps PKCE, random state and the full `aicode` scope. IPv4 and available IPv6 listeners bind **only loopback**; occupied port 51121 fails before an authorization URL is returned. Cancellation and a five-minute deadline close the listener. Real platform/architecture headers replace the old hard-coded macOS header.

After installation, refresh DSH, open **Settings → Google Anti Gravity**, click Google sign-in, and complete authorization in a browser on the DSH computer. A blocked popup can be opened through the displayed authorization link. Service entitlement, catalog and quota still depend on Google's responses; offline regression coverage is not real-account authorization/inference validation.

This revision retains the existing prebuilt inference/model/UI code and shares OAuth/identity JS between source and runtime. The original full `bundle` script references missing build configuration; do not use it to overwrite the supplied runtime.

## Security and Credentials

- macOS defaults to `GOOGLE_ANTIGRAVITY_APP_OAUTH_CLIENT_CONFIG` for application identity and `GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL` for account tokens. Windows uses the isolated `WINDOWS_APP` references above. Deployment configuration contains reference names and an installer-approved public binary hash, never the application pair or user tokens.
- Credentials remain inside the Harness host credential service and never leak into settings, model catalogs, logs, or frontend responses.
- For inference, the plugin calls the OAuth handler's `toAuth()` and passes the resulting JSON auth value to pi-ai as a per-request override; pi-ai's model collection holds no CredentialStore.

## Contributing

Issues and scoped pull requests are welcome. Please describe observed provider responses, omit secrets and account identifiers, update both README languages, and run package tests in a matching DeepSeek Harness workspace.

## License and Disclaimer

MIT License. This independent integration is not affiliated with or endorsed by Google, DeepMind, DeepSeek, or pi-ai maintainers. Google Anti Gravity and related model names are trademarks of their respective owners.

## Model Experience

### Anti Gravity Inference

#### What the model sees

The selected model receives the Harness system prompt as `systemInstruction`, along with normalized conversation messages and tool definitions. The plugin adds no vendor prompts or instructions. The transport retains native Cloud Code Assist envelopes: sending authorized JSON/SSE headers and official fields (`project`, `model`, `request`, `requestType`, `userAgent`, and `requestId`) without compatibility headers, identity messages, or synthetic turns.

#### Token effect

No additional model-visible tokens are added beyond the system prompt, history, and tools in the request. Cloud Code Assist reports prompt, candidate, thinking, and cached token counts; the adapter maps these fields directly without estimation.

#### KV Cache effect

Logical message order is preserved. Thinking signatures and tool call IDs persist across subsequent turns. Upstream cache reuse remains governed by Cloud Code Assist and may reset when earlier turns or models change.

## Known Limitations and Deferred Work

- Google delivers this subscription path over internal `v1internal` Cloud Code Assist endpoints rather than public Gemini APIs; endpoint changes may affect this plugin independently of public Gemini services.
- OAuth starts from the plugin-owned Anti Gravity settings page, and the account must hold active service entitlements.
- macOS automatic import supports Google-signed `Antigravity.app` via `macosApplicationPath`. Windows supports only the explicitly approved App 2.30.0 binary described above; the older IDE, Linux, and arbitrary Windows versions are not supported.
- Catalog items describe provider capabilities and do not guarantee remaining quota. Depleted quotas return as provider errors during inference.
