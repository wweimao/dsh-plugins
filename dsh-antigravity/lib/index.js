import { InMemoryCredentialStore, calculateCost, createAssistantMessageEventStream, createProvider, defaultProviderAuthContext } from "@earendil-works/pi-ai";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LlmError, assertUsableApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { convertMessages, convertTools, isThinkingPart, mapStopReasonString, retainThoughtSignature } from "@earendil-works/pi-ai/api/google-shared";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { importOfficialAppOAuthConfig, extractOfficialAppOAuthConfig } from "./app-oauth.js";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { toLegacyContext } from "./transcript-compat.js";
import { streamFailure } from "./stream-diagnostics.js";
//#region lib/types/auth.js
/** Google Anti Gravity OAuth implementation adapted to pi-ai's provider auth contract. */
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_APP_VERSION = "2.29.0";
const SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs",
	"https://www.googleapis.com/auth/aicode"
];
function base64Url(input) {
	return input.toString("base64url");
}
async function discoverProject(access, signal) {
	for (const endpoint of ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"]) try {
		const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
			method: "POST",
			headers: antiGravityHeaders(access),
			body: JSON.stringify({ metadata: {
				ideName: "antigravity",
				ideType: "ANTIGRAVITY",
				ideVersion: DEFAULT_APP_VERSION
			} }),
			...signal === void 0 ? {} : { signal }
		});
		if (!response.ok) continue;
		const body = await response.json();
		if (typeof body.cloudaicompanionProject === "string" && body.cloudaicompanionProject.length > 0) return body.cloudaicompanionProject;
		if (typeof body.cloudaicompanionProject === "object" && body.cloudaicompanionProject !== null && typeof body.cloudaicompanionProject.id === "string") return body.cloudaicompanionProject.id;
	} catch (error) {
		if (signal?.aborted) throw error;
	}
	throw new Error("Anti Gravity OAuth succeeded, but Cloud Code Assist returned no companion project");
}
/**
* Headers shared by Anti Gravity's Cloud Code Assist endpoints.
* @param access - current OAuth access token.
* @returns request headers for an authenticated JSON call.
*/
function antiGravityHeaders(access) {
	return {
		authorization: `Bearer ${access}`,
		"content-type": "application/json",
		"user-agent": `antigravity/${DEFAULT_APP_VERSION} darwin/arm64`
	};
}
async function exchange(params, signal) {
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: params,
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw new Error(`Anti Gravity token exchange failed with HTTP ${response.status}`);
	return response.json();
}
async function login(interaction, clientConfig) {
	interaction.signal?.throwIfAborted();
	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	const state = base64Url(randomBytes(24));
	const callback = new Promise((resolve, reject) => {
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? "/", REDIRECT_URI);
			if (url.pathname !== "/oauth-callback") {
				response.writeHead(404).end();
				return;
			}
			const code = url.searchParams.get("code");
			if (url.searchParams.get("state") !== state || code === null) {
				response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Anti Gravity OAuth callback is invalid.");
				server.close();
				reject(/* @__PURE__ */ new Error("Anti Gravity OAuth state or code is invalid"));
				return;
			}
			response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Anti Gravity login completed. You may close this page.");
			server.close();
			resolve(code);
		});
		server.on("error", reject);
		server.listen(51121, "127.0.0.1");
		interaction.signal?.addEventListener("abort", () => {
			server.close();
			reject(/* @__PURE__ */ new Error("Anti Gravity OAuth was cancelled"));
		}, { once: true });
	});
	const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	auth.search = new URLSearchParams({
		client_id: clientConfig.clientId,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: SCOPES.join(" "),
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
		access_type: "offline",
		prompt: "consent"
	}).toString();
	interaction.notify({
		type: "auth_url",
		url: auth.toString(),
		instructions: "在浏览器完成 Google Anti Gravity 授权。"
	});
	const code = await callback;
	const tokens = await exchange(new URLSearchParams({
		client_id: clientConfig.clientId,
		client_secret: clientConfig.clientSecret,
		code,
		grant_type: "authorization_code",
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier
	}), interaction.signal);
	if (tokens.refresh_token === void 0) throw new Error("Anti Gravity OAuth returned no refresh token");
	const projectId = await discoverProject(tokens.access_token, interaction.signal);
	return {
		type: "oauth",
		access: tokens.access_token,
		refresh: tokens.refresh_token,
		expires: Date.now() + tokens.expires_in * 1e3 - 3e5,
		projectId
	};
}
/**
* Build the OAuth method around a host-owned, per-operation client-config resolver.
* @param resolveClientConfig - Resolve the private OAuth client pair for each login or refresh.
* @returns Provider-native OAuth operations for login, refresh, and request authentication.
*/
function createAntiGravityOAuth(resolveClientConfig) {
	return {
		name: "Google Anti Gravity",
		loginLabel: "使用 Google 账号登录 Anti Gravity",
		login: async (interaction) => {
			interaction.signal?.throwIfAborted();
			const clientConfig = await resolveClientConfig();
			interaction.signal?.throwIfAborted();
			return login(interaction, clientConfig);
		},
		async refresh(credential, signal) {
			const current = credential;
			if (typeof current.projectId !== "string" || current.projectId.length === 0) throw new Error("Anti Gravity credential has no Cloud Code Assist project id");
			const clientConfig = await resolveClientConfig();
			const tokens = await exchange(new URLSearchParams({
				client_id: clientConfig.clientId,
				client_secret: clientConfig.clientSecret,
				refresh_token: credential.refresh,
				grant_type: "refresh_token"
			}), signal);
			return {
				...credential,
				access: tokens.access_token,
				refresh: tokens.refresh_token ?? credential.refresh,
				expires: Date.now() + tokens.expires_in * 1e3 - 3e5
			};
		},
		toAuth: (credential) => {
			const current = credential;
			if (typeof current.projectId !== "string" || current.projectId.length === 0) throw new Error("Anti Gravity credential has no Cloud Code Assist project id");
			return Promise.resolve({ apiKey: JSON.stringify({
				token: credential.access,
				projectId: current.projectId
			}) });
		}
	};
}
//#endregion
//#region lib/types/models.js
/** Maintained and live-reconciled Anti Gravity model descriptors. */
/** Stable route and provider identity registered with the generic adapter. */
const PROVIDER = "google-antigravity";
/** Cloud Code Assist endpoints in provider-preferred fallback order. */
const ENDPOINTS = ["https://daily-cloudcode-pa.googleapis.com", "https://cloudcode-pa.googleapis.com"];
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
function descriptor(id, name, family, level) {
	const contextWindow = family === "gemini" ? 1048576 : family === "claude" ? 2e5 : 131072;
	return {
		id,
		name,
		api: "google-antigravity",
		provider: PROVIDER,
		baseUrl: ENDPOINTS[0],
		reasoning: true,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: level === "low" ? "low" : null,
			medium: level === "medium" ? "medium" : null,
			high: level === "high" ? "high" : null,
			xhigh: null,
			max: null
		},
		input: ["text", "image"],
		cost: NO_COST,
		contextWindow,
		maxTokens: 65536
	};
}
/** Reviewed descriptors; the account-visible catalog is always reconciled online before display. */
const maintainedModels = [
	descriptor("gemini-3.7-flash-high", "Gemini 3.7 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.7-flash-medium", "Gemini 3.7 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.7-flash-low", "Gemini 3.7 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.6-flash-high", "Gemini 3.6 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.6-flash-medium", "Gemini 3.6 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.6-flash-low", "Gemini 3.6 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.5-flash-high", "Gemini 3.5 Flash (High)", "gemini", "high"),
	descriptor("gemini-3.5-flash-medium", "Gemini 3.5 Flash (Medium)", "gemini", "medium"),
	descriptor("gemini-3.5-flash-low", "Gemini 3.5 Flash (Low)", "gemini", "low"),
	descriptor("gemini-3.1-pro-high", "Gemini 3.1 Pro (High)", "gemini", "high"),
	descriptor("gemini-3.1-pro-low", "Gemini 3.1 Pro (Low)", "gemini", "low"),
	descriptor("claude-sonnet-4-6", "Claude Sonnet 4.6 (Thinking)", "claude", "high"),
	descriptor("claude-opus-4-6-thinking", "Claude Opus 4.6 (Thinking)", "claude", "high"),
	descriptor("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)", "gpt", "medium")
];
/**
* Reconcile the maintained descriptors with one official `fetchAvailableModels` response.
* @param payload - decoded Cloud Code Assist response body.
* @returns reviewed descriptors that also appear in the response.
*/
function parseAvailableModels(payload) {
	if (typeof payload !== "object" || payload === null || typeof payload.models !== "object" || payload.models === null || Array.isArray(payload.models)) throw new Error("Anti Gravity model response must contain a models object");
	return Object.entries(payload.models).flatMap(([id, entry]) => {
		if (typeof entry !== "object" || entry === null || entry.isInternal === true || id.length > 128) return [];
		const family = /^gemini-[a-z0-9.-]+$/.test(id) ? "gemini" : /^claude-(opus|sonnet|haiku)-[a-z0-9.-]+$/.test(id) ? "claude" : /^gpt-oss-[a-z0-9.-]+$/.test(id) ? "gpt" : void 0;
		// Only conversational models that this text/tool adapter can represent.
		if (family === void 0 || /(?:image|embedding|audio)/.test(id)) return [];
		const known = maintainedModels.find((model) => model.id === id);
		const label = typeof entry.displayName === "string" ? entry.displayName.trim().slice(0, 160) : known?.name;
		// Hidden tiered/internal aliases have no displayName; do not invent user-facing routes.
		if (!label) return [];
		const fixed = /-(low|medium|high)$/.exec(id)?.[1];
		const level = fixed ?? ({ 1: "low", 2: "medium", 3: "high" }[entry.thinkingLevel]) ?? "high";
		const result = descriptor(id, label, family, level);
		result.reasoning = entry.supportsThinking === true;
		result.input = entry.supportsImages === true ? ["text", "image"] : ["text"];
		if (!result.reasoning) delete result.thinkingLevelMap;
		if (Number.isSafeInteger(entry.maxTokens) && entry.maxTokens > 0 && entry.maxTokens <= 1e8) result.contextWindow = entry.maxTokens;
		if (Number.isSafeInteger(entry.maxOutputTokens) && entry.maxOutputTokens > 0 && entry.maxOutputTokens <= 1e7) result.maxTokens = entry.maxOutputTokens;
		return [result];
	}).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
/**
* Fetch the account-authorized model list, retaining no quota or account fields.
* @param context - pi-ai refresh context containing the OAuth credential and cancellation signal.
* @returns reviewed account-visible Anti Gravity descriptors.
*/
async function fetchAvailableModels(context) {
	const credential = context.credential;
	return fetchAvailableModelsForCredential(credential, context.signal);
}
/**
* Fetch the account-authorized model list from an explicitly resolved OAuth credential.
* @param credential - current credential resolved by this plugin.
* @param signal - optional cancellation signal.
* @returns reviewed account-visible Anti Gravity descriptors.
*/
async function fetchGoogleAccountJson(method, credential, body, signal) {
	if (credential?.type !== "oauth" || typeof credential.projectId !== "string" || credential.projectId.length === 0) throw new Error("Anti Gravity account query requires an OAuth credential with a project id");
	let lastStatus;
	for (const endpoint of ENDPOINTS) {
		const timeout = AbortSignal.timeout(15000);
		const requestSignal = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
		try {
			const response = await fetch(`${endpoint}/v1internal:${method}`, {
				method: "POST", headers: antiGravityHeaders(credential.access),
				body: JSON.stringify(body), signal: requestSignal
			});
			if (response.ok) return await response.json();
			lastStatus = response.status;
			await response.body?.cancel();
			if (![403, 404, 429, 500, 502, 503, 504].includes(response.status)) break;
		} catch (error) {
			if (signal?.aborted) throw error;
		}
	}
	throw new Error(`Anti Gravity ${method} failed (${lastStatus === void 0 ? "network or timeout" : `HTTP ${lastStatus}`})`);
}
async function fetchAvailableModelsForCredential(credential, signal) {
	const payload = await fetchGoogleAccountJson("fetchAvailableModels", credential, { project: credential.projectId }, signal);
	return parseAvailableModels(payload);
}
/** User-requested defaults; explicit per-ID choices override them, including false. */
function defaultModelEnabled(model) {
	return /^(?:claude-(?:opus|sonnet)-5-5(?:-|$)|gemini-4(?:[.-]|$)|gemini-3\.8-flash(?:-|$))/.test(model.id)
		|| /^(?:Claude (?:Opus|Sonnet) 5\.5(?:\s|$)|Gemini 4(?:[.\s(]|$)|Gemini 3\.8 Flash(?:\s|$))/i.test(model.name);
}
function isModelEnabled(model, overrides) {
	if (Object.prototype.hasOwnProperty.call(overrides, model.id) && typeof overrides[model.id] === "boolean") return overrides[model.id];
	if (model.antigravityVariants) return model.antigravityVariants.some((variant) => isModelEnabled(variant, overrides));
	return defaultModelEnabled(model);
}
/** One public model, with only the thinking routes actually present in Google's catalog. */
function groupAvailableModels(models) {
	const ids = new Set(models.map((model) => model.id));
	const groups = new Map();
	const result = [];
	for (const model of models) {
		const match = /^(.*)-(low|medium|high)$/.exec(model.id);
		// An independently advertised base route is ambiguous; do not silently replace it.
		if (!match || !model.reasoning || ids.has(match[1])) { result.push(model); continue; }
		const variants = groups.get(match[1]) ?? [];
		variants.push(model);
		groups.set(match[1], variants);
	}
	for (const [id, variants] of groups) {
		const first = variants[0];
		const routes = Object.fromEntries(variants.map((variant) => [variant.id.slice(id.length + 1), variant.id]));
		const thinkingLevelMap = Object.fromEntries(["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((level) => [level, Object.hasOwn(routes, level) ? level : null]));
		result.push({ ...first, id, name: first.name.replace(/\s+\((?:low|medium|high)\)\s*$/i, ""),
			contextWindow: Math.min(...variants.map((variant) => variant.contextWindow)),
			maxTokens: Math.min(...variants.map((variant) => variant.maxTokens)),
			input: first.input.filter((input) => variants.every((variant) => variant.input.includes(input))),
			thinkingLevelMap, antigravityRoutes: routes, antigravityVariants: variants });
	}
	return result.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
/** Old per-variant switches remain respected until the user explicitly enables the base model. */
function selectModelRoutes(model, overrides) {
	if (!model.antigravityVariants) return model;
	const explicit = Object.prototype.hasOwnProperty.call(overrides, model.id) && typeof overrides[model.id] === "boolean";
	const variants = model.antigravityVariants.filter((variant) => explicit ? overrides[model.id] : isModelEnabled(variant, overrides));
	const routes = Object.fromEntries(variants.map((variant) => [variant.id.slice(model.id.length + 1), variant.id]));
	return { ...model, antigravityRoutes: routes, thinkingLevelMap: Object.fromEntries(Object.keys(model.thinkingLevelMap).map((level) => [level, Object.hasOwn(routes, level) ? level : null])) };
}
function groupedQuotaModels(quota, models, overrides) {
	const byId = new Map(quota.models.map((model) => [model.id, model]));
	return models.map((model) => {
		const variants = model.antigravityVariants ?? [model];
		const rows = variants.map((variant) => byId.get(variant.id));
		const common = (key) => { const value = rows[0]?.[key] ?? null; return rows.every((row) => (row?.[key] ?? null) === value) ? value : null; };
		// Never sum quotas or manufacture one value when different routes disagree.
		return { id: model.id, name: model.name, family: model.id.startsWith("gemini-") ? "gemini" : model.id.startsWith("claude-") ? "claude" : "gpt", remainingFraction: common("remainingFraction"), resetTime: common("resetTime"), enabled: isModelEnabled(model, overrides) };
	});
}
function quotaFraction(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
function quotaReset(value) {
	return typeof value === "string" && value.length < 80 && Number.isFinite(Date.parse(value)) ? value : null;
}
function parseAccountQuota(summary, catalog) {
	const models = parseAvailableModels(catalog).map((model) => {
		const quota = catalog.models[model.id]?.quotaInfo;
		return { id: model.id, name: model.name, family: model.id.startsWith("gemini-") ? "gemini" : model.id.startsWith("claude-") ? "claude" : "gpt", remainingFraction: quotaFraction(quota?.remainingFraction), resetTime: quotaReset(quota?.resetTime) };
	});
	const groups = (Array.isArray(summary?.groups) ? summary.groups : []).slice(0, 20).flatMap((group, index) => {
		if (typeof group !== "object" || group === null || typeof group.displayName !== "string") return [];
		const buckets = (Array.isArray(group.buckets) ? group.buckets : []).slice(0, 20).flatMap((bucket, position) => {
			if (typeof bucket !== "object" || bucket === null) return [];
			return [{ id: typeof bucket.bucketId === "string" ? bucket.bucketId.slice(0, 100) : `bucket-${position}`, label: typeof bucket.displayName === "string" ? bucket.displayName.slice(0, 160) : "Quota", window: typeof bucket.window === "string" ? bucket.window.slice(0, 40) : "unknown", remainingFraction: quotaFraction(bucket.remainingFraction), resetTime: quotaReset(bucket.resetTime) }];
		});
		return [{ id: `quota-${index}`, label: group.displayName.slice(0, 160), buckets }];
	});
	return { fetchedAt: Date.now(), groups, models };
}
async function fetchAccountSnapshot(credential, signal) {
	const [catalog, quotaResult] = await Promise.all([
		fetchGoogleAccountJson("fetchAvailableModels", credential, { project: credential.projectId }, signal),
		fetchGoogleAccountJson("retrieveUserQuotaSummary", credential, {}, signal).then((value) => ({ value }), () => ({ error: "Quota summary is temporarily unavailable; model quota is shown when available." }))
	]);
	const quota = parseAccountQuota(quotaResult.value, catalog);
	if (quotaResult.error) quota.error = quotaResult.error;
	return { models: parseAvailableModels(catalog), quota };
}
//#endregion
//#region lib/types/api.js
/** Cloud Code Assist streaming implementation for Google Anti Gravity. */
function parseAuth(value) {
	if (value === void 0) throw new Error("Anti Gravity requires OAuth authentication");
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error("Anti Gravity OAuth request credential is invalid");
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.token !== "string" || typeof parsed.projectId !== "string") throw new Error("Anti Gravity OAuth request credential is incomplete");
	return parsed;
}
function wireModelId(model, options) {
	if (!model.antigravityRoutes) return model.id;
	const routes = model.antigravityRoutes;
	const level = options.reasoning ?? ["medium", "low", "high"].find((candidate) => Object.hasOwn(routes, candidate));
	if (typeof level !== "string" || !Object.hasOwn(routes, level) || typeof routes[level] !== "string") throw new Error("Anti Gravity thinking level is not available for this model");
	return routes[level];
}
function requestBody(model, context, options, projectId) {
	context = toLegacyContext(context);
	const wireId = wireModelId(model, options);
	const wireModel = { ...model, id: wireId };
	// Keep public/replay identity stable, but compare signatures against the actual previous route.
	const wireContext = { ...context, messages: context.messages.map((message) => message.role === "assistant" && message.provider === model.provider && message.api === model.api ? { ...message, model: message.responseModel ?? message.model } : message) };
	const request = {
		contents: convertMessages(wireModel, wireContext),
		...options.sessionId === void 0 ? {} : { sessionId: options.sessionId }
	};
	if (context.systemPrompt !== void 0) request.systemInstruction = {
		role: "user",
		parts: [{ text: context.systemPrompt }]
	};
	const generationConfig = {};
	if (options.temperature !== void 0) generationConfig.temperature = options.temperature;
	if (options.maxTokens !== void 0) generationConfig.maxOutputTokens = options.maxTokens;
	if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig;
	if (context.tools !== void 0 && context.tools.length > 0) request.tools = convertTools(context.tools, model.id.startsWith("claude-"));
	return {
		project: projectId,
		model: wireId,
		request,
		requestType: "agent",
		userAgent: "antigravity",
		requestId: `agent-${crypto.randomUUID()}`
	};
}
async function openResponse(model, context, options, auth) {
	let payload = requestBody(model, context, options, auth.projectId);
	const replacement = await options.onPayload?.(payload, model);
	if (replacement !== void 0) payload = replacement;
	const body = JSON.stringify(payload);
	let lastStatus;
	for (const endpoint of ENDPOINTS) {
		const headers = {
			...Object.fromEntries(Object.entries(options.headers ?? {}).filter((entry) => entry[1] !== null)),
			...antiGravityHeaders(auth.token),
			accept: "text/event-stream",
			...model.id.startsWith("claude-") ? { "anthropic-beta": "interleaved-thinking-2025-05-14" } : {}
		};
		const response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
			method: "POST",
			headers,
			body,
			...options.signal === void 0 ? {} : { signal: options.signal }
		});
		await options.onResponse?.({
			status: response.status,
			headers: Object.fromEntries(response.headers)
		}, model);
		if (response.ok) return response;
		lastStatus = response.status;
		if (![
			403,
			404,
			429,
			500,
			502,
			503,
			504
		].includes(response.status)) break;
	}
	throw new Error(`Anti Gravity inference failed with HTTP ${lastStatus ?? "unknown"}`);
}
/**
* Native provider stream used by the registered pi-ai provider.
* @param model - selected Anti Gravity model descriptor.
* @param context - system prompt, history, and tools for this request.
* @param options - pi-ai transport, credential, and cancellation options.
* @returns assistant event stream backed by Cloud Code Assist SSE.
*/
function streamAntiGravity(model, context, options = {}) {
	const stream = createAssistantMessageEventStream();
	const output = {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0
			}
		},
		stopReason: "stop",
		timestamp: Date.now()
	};
	(async () => {
		try {
			output.responseModel = wireModelId(model, options);
			const response = await openResponse(model, context, options, parseAuth(options.apiKey));
			if (response.body === null) throw new Error("Anti Gravity returned no response stream");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let started = false;
			let finished = false;
			let current;
			const ensureStarted = () => {
				if (started) return;
				started = true;
				stream.push({
					type: "start",
					partial: output
				});
			};
			const closeCurrent = () => {
				if (current === void 0) return;
				const index = output.content.length - 1;
				if (current.type === "text") stream.push({
					type: "text_end",
					contentIndex: index,
					content: current.text,
					partial: output
				});
				else stream.push({
					type: "thinking_end",
					contentIndex: index,
					content: current.thinking,
					partial: output
				});
				current = void 0;
			};
			const consume = (chunk, eventName = "") => {
				const data = chunk?.response;
				if (output.responseId === void 0 && data?.responseId !== void 0) output.responseId = data.responseId;
				// Retain accounting on failures, but never emit a tool call from a failed frame.
				const usage = data?.usageMetadata;
				if (usage && typeof usage === "object") {
					const cacheRead = usage.cachedContentTokenCount ?? 0;
					output.usage = {
						input: Math.max(0, (usage.promptTokenCount ?? 0) - cacheRead),
						output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
						reasoning: usage.thoughtsTokenCount ?? 0, cacheRead, cacheWrite: 0,
						totalTokens: usage.totalTokenCount ?? 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
					};
					calculateCost(model, output.usage);
				}
				const failure = streamFailure(chunk, eventName);
				if (failure) throw new Error(failure);
				if (data == null) return;
				const candidate = data.candidates?.[0];
				for (const part of candidate?.content?.parts ?? []) {
					if (part.text !== void 0) {
						const thinking = isThinkingPart(part);
						let active = current;
						if (current === void 0 || thinking && current.type !== "thinking" || !thinking && current.type !== "text") {
							closeCurrent();
							const created = thinking ? {
								type: "thinking",
								thinking: "",
								...part.thoughtSignature === void 0 ? {} : { thinkingSignature: part.thoughtSignature }
							} : {
								type: "text",
								text: ""
							};
							current = created;
							active = created;
							output.content.push(created);
							ensureStarted();
							const index = output.content.length - 1;
							stream.push(thinking ? {
								type: "thinking_start",
								contentIndex: index,
								partial: output
							} : {
								type: "text_start",
								contentIndex: index,
								partial: output
							});
						}
						const index = output.content.length - 1;
						if (active === void 0) throw new Error("Anti Gravity stream block was not initialized");
						if (active.type === "thinking") {
							active.thinking += part.text;
							const signature = retainThoughtSignature(active.thinkingSignature, part.thoughtSignature);
							if (signature !== void 0) active.thinkingSignature = signature;
							stream.push({
								type: "thinking_delta",
								contentIndex: index,
								delta: part.text,
								partial: output
							});
						} else {
							active.text += part.text;
							const signature = retainThoughtSignature(active.textSignature, part.thoughtSignature);
							if (signature !== void 0) active.textSignature = signature;
							stream.push({
								type: "text_delta",
								contentIndex: index,
								delta: part.text,
								partial: output
							});
						}
					}
					if (part.functionCall !== void 0) {
						closeCurrent();
						const toolCall = {
							type: "toolCall",
							id: part.functionCall.id ?? `${part.functionCall.name ?? "tool"}_${crypto.randomUUID()}`,
							name: part.functionCall.name ?? "",
							arguments: part.functionCall.args ?? {},
							...part.thoughtSignature === void 0 ? {} : { thoughtSignature: part.thoughtSignature }
						};
						output.content.push(toolCall);
						ensureStarted();
						const index = output.content.length - 1;
						stream.push({
							type: "toolcall_start",
							contentIndex: index,
							partial: output
						});
						stream.push({
							type: "toolcall_delta",
							contentIndex: index,
							delta: JSON.stringify(toolCall.arguments),
							partial: output
						});
						stream.push({
							type: "toolcall_end",
							contentIndex: index,
							toolCall,
							partial: output
						});
					}
				}
				if (candidate?.finishReason != null) {
					finished = true;
					output.stopReason = mapStopReasonString(candidate.finishReason);
				}
				if (output.content.some((block) => block.type === "toolCall")) output.stopReason = "toolUse";

			};
			let eventData = [];
			let eventName = "";
			const flushEvent = () => {
				const text = eventData.join("\n").trim(), name = eventName;
				eventData = []; eventName = "";
				if (text.length === 0 || text === "[DONE]") { consume(undefined, name); return; }
				let chunk;
				try { chunk = JSON.parse(text); }
				catch { throw new Error(name === "error" ? "Anti Gravity SSE error (malformed data)" : "Anti Gravity returned malformed SSE data"); }
				consume(chunk, name);
			};
			const consumeLine = (raw) => {
				const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
				if (line.length === 0) flushEvent();
				else if (line.startsWith("event:")) eventName = line.slice(6).replace(/^ /, "");
				else if (line.startsWith("data:")) eventData.push(line.slice(5).replace(/^ /, ""));
			};
			try {
				while (true) {
					options.signal?.throwIfAborted();
					const { done, value } = await reader.read();
					options.signal?.throwIfAborted();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) consumeLine(line);
				}
				buffer += decoder.decode();
				if (buffer.length > 0) consumeLine(buffer);
				flushEvent();
			} finally {
				try { await reader.cancel(); } catch {}
				reader.releaseLock();
			}
			closeCurrent();
			if (output.stopReason === "error") throw new Error("Anti Gravity upstream ended in an error state");
			if (output.content.length === 0) throw new Error("Anti Gravity returned an empty response");
			if (!finished) throw new Error("Anti Gravity response ended before a finish reason was received");
			const reason = output.stopReason === "toolUse" || output.stopReason === "length" ? output.stopReason : "stop";
			stream.push({
				type: "done",
				reason,
				message: output
			});
			stream.end();
		} catch (error) {
			output.stopReason = options.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({
				type: "error",
				reason: output.stopReason,
				error: output
			});
			stream.end();
		}
	})();
	return stream;
}
const streamSimple = (model, context, options) => streamAntiGravity(model, context, options);
/** Provider stream pair supplied to `createProvider`. */
const antiGravityApi = {
	stream: (model, context, options) => streamAntiGravity(model, context, options),
	streamSimple: (model, context, options) => streamSimple(model, context, options)
};
//#endregion
//#region lib/types/client-config.js
/** Resolve Anti Gravity's OAuth application identity without shipping it in source. */
const CLIENT_ID_PATTERN = /^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]+$/;
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** App-only cache; the old IDE-derived client configuration is never read. */
const DEFAULT_OAUTH_CLIENT_CONFIG_REF = "GOOGLE_ANTIGRAVITY_APP_OAUTH_CLIENT_CONFIG";
function validateClientConfig(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Anti Gravity OAuth client configuration must be a JSON object");
	const { clientId, clientSecret } = value;
	if (typeof clientId !== "string" || !CLIENT_ID_PATTERN.test(clientId)) throw new Error("Anti Gravity OAuth client configuration has an invalid clientId");
	if (typeof clientSecret !== "string" || !CLIENT_SECRET_PATTERN.test(clientSecret)) throw new Error("Anti Gravity OAuth client configuration has an invalid clientSecret");
	return {
		clientId,
		clientSecret
	};
}
/**
* Parse one credential-store value without exposing either field in diagnostics.
* @param value - Serialized OAuth client configuration from the credential store.
* @returns Validated client id and client secret.
*/
function parseOAuthClientConfig(value) {
	try {
		return validateClientConfig(JSON.parse(value));
	} catch (error) {
		if (error instanceof SyntaxError) throw new Error("Anti Gravity OAuth client configuration is not valid JSON");
		throw error;
	}
}
/** Extract only the reviewed consumer configuration from the official App binary. */
function extractOAuthClientConfig(source) {
	return validateClientConfig(extractOfficialAppOAuthConfig(source));
}
/** No IDE fallback: signature verification and sealed binary parsing are App-owned. */
async function importInstalledOAuthClientConfig(applicationPath) {
	return validateClientConfig(await importOfficialAppOAuthConfig(applicationPath));
}
/**
* Resolve the private client config, importing and persisting it once when absent.
* @param credentials - Credential store that owns the private client pair.
* @param refValue - Credential reference used for the serialized client pair.
* @param applicationPath - Optional explicit application bundle path for first import.
* @param importer - Import operation used when the credential reference is absent.
* @returns Validated client configuration for the next OAuth operation.
*/
async function resolveOAuthClientConfig(credentials, refValue = DEFAULT_OAUTH_CLIENT_CONFIG_REF, applicationPath, importer = importInstalledOAuthClientConfig) {
	if (!CREDENTIAL_REF_PATTERN.test(refValue)) throw new Error("Anti Gravity OAuth client credential reference must be a POSIX identifier");
	const ref = refValue === "GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG" ? DEFAULT_OAUTH_CLIENT_CONFIG_REF : refValue;
	const existing = await credentials.resolve(ref);
	if (existing !== void 0) {
		let cached;
		try { cached = JSON.parse(existing.value); } catch { throw new Error("Anti Gravity App client configuration is not valid JSON"); }
		if (cached?.source === "official-app") return validateClientConfig(cached);
	}
	const imported = validateClientConfig(await importer(applicationPath));
	await credentials.set(ref, JSON.stringify({ ...imported, source: "official-app" }));
	return imported;
}
//#endregion
//#region lib/types/credential.js
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Parse one opaque Anti Gravity OAuth credential without exposing secret fields.
* @param raw - JSON value resolved through the Harness credential service.
* @param ref - safe credential reference used in diagnostics.
* @returns canonical pi-ai OAuth credential with a Cloud Code Assist project id.
*/
function parseAntiGravityCredential(raw, ref) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new LlmError(`llm-pi-ai-antigravity: OAuth credential ${ref} is not valid JSON`, "AUTH");
	}
	if (!isRecord(parsed) || parsed.type !== "oauth" || typeof parsed.access !== "string" || parsed.access.length === 0 || typeof parsed.refresh !== "string" || parsed.refresh.length === 0 || typeof parsed.expires !== "number" || !Number.isFinite(parsed.expires) || parsed.expires <= 0 || typeof parsed.projectId !== "string" || parsed.projectId.length === 0) throw new LlmError(`llm-pi-ai-antigravity: OAuth credential ${ref} must contain type "oauth", non-empty access and refresh tokens, a positive finite expires timestamp, and a non-empty projectId`, "AUTH");
	return parsed;
}
/** Resolve, refresh, persist, and derive request auth for Anti Gravity OAuth. */
var AntiGravityCredentialManager = class {
	credentials;
	ref;
	oauth;
	refreshing;
	revision = 0;
	mutations = Promise.resolve();
	invalidate() { this.revision++; }
	mutate(operation) {
		const result = this.mutations.then(operation);
		this.mutations = result.then(() => void 0, () => void 0);
		return result;
	}
	setCredential(value) {
		this.invalidate();
		return this.mutate(() => this.credentials.set(this.ref, value));
	}
	clearCredential() {
		this.invalidate();
		return this.mutate(() => this.credentials.unset(this.ref));
	}
	/**
	* @param credentials - Harness credential service.
	* @param ref - opaque JSON credential reference.
	* @param oauth - provider-native Anti Gravity OAuth handler.
	*/
	constructor(credentials, ref, oauth) {
		this.credentials = credentials;
		this.ref = ref;
		this.oauth = oauth;
	}
	/**
	* Resolve a valid canonical credential, refreshing it once across concurrent callers.
	* @returns current or newly persisted OAuth credential.
	*/
	async resolveCredential() {
		let credential = await this.read();
		if (Date.now() >= credential.expires) {
			this.refreshing ??= this.refreshExpired().finally(() => {
				this.refreshing = void 0;
			});
			credential = await this.refreshing;
		}
		return credential;
	}
	/**
	* Derive pi-ai's request-level API-key override from the provider OAuth handler.
	* @returns JSON request credential consumed by the Anti Gravity protocol.
	*/
	async resolveApiKey() {
		const credential = await this.resolveCredential();
		try {
			const auth = await this.oauth.toAuth(credential);
			if (auth.apiKey === void 0) throw new Error("Anti Gravity OAuth handler returned no request API key");
			return assertUsableApiKey(auth.apiKey, "llm-pi-ai-antigravity", this.ref);
		} catch (error) {
			if (error instanceof LlmError) throw error;
			throw new LlmError("llm-pi-ai-antigravity: OAuth auth derivation failed", "AUTH", { cause: error });
		}
	}
	async read() {
		const hit = await this.credentials.resolve(this.ref);
		if (hit === void 0) throw new LlmError(`llm-pi-ai-antigravity: no OAuth credential at ${this.ref}`, "MISSING_CREDENTIAL");
		return parseAntiGravityCredential(hit.value, this.ref);
	}
	async refreshExpired() {
		const current = await this.read();
		if (Date.now() < current.expires) return current;
		const revision = this.revision;
		let refreshed;
		try {
			refreshed = await this.oauth.refresh(current, AbortSignal.timeout(30000));
		} catch (error) {
			throw new LlmError("llm-pi-ai-antigravity: OAuth refresh failed", "AUTH", { cause: error });
		}
		const checked = parseAntiGravityCredential(JSON.stringify(refreshed), this.ref);
		return this.mutate(async () => {
			if (revision !== this.revision) throw new LlmError("Anti Gravity credential changed during refresh", "AUTH");
			const latest = await this.read();
			if (revision !== this.revision || JSON.stringify(latest) !== JSON.stringify(current)) throw new LlmError("Anti Gravity credential changed during refresh", "AUTH");
			await this.credentials.set(this.ref, JSON.stringify(checked));
			return checked;
		});
	}
};
//#endregion
//#region lib/types/remote-service.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
function loginId() {
	return randomUUID();
}
function failureMessage(error) {
	return error instanceof Error && error.message.length > 0 ? error.message : "Anti Gravity OAuth failed";
}
/** Remote-only owner of Anti Gravity login, polling, status, and logout. */
let AntiGravityAuthRemote = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _describe_decorators;
	let _start_decorators;
	let _poll_decorators;
	let _logout_decorators;
	let _setModelEnabled_decorators;
	return class AntiGravityAuthRemote extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_describe_decorators = [Remote("describe")];
			_start_decorators = [Remote("start")];
			_poll_decorators = [Remote("poll")];
			_logout_decorators = [Remote("logout")];
			_setModelEnabled_decorators = [Remote("setModelEnabled")];
			__esDecorate(this, null, _setModelEnabled_decorators, {
				kind: "method", name: "setModelEnabled", static: false, private: false,
				access: { has: (obj) => "setModelEnabled" in obj, get: (obj) => obj.setModelEnabled }, metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _describe_decorators, {
				kind: "method",
				name: "describe",
				static: false,
				private: false,
				access: {
					has: (obj) => "describe" in obj,
					get: (obj) => obj.describe
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _start_decorators, {
				kind: "method",
				name: "start",
				static: false,
				private: false,
				access: {
					has: (obj) => "start" in obj,
					get: (obj) => obj.start
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _poll_decorators, {
				kind: "method",
				name: "poll",
				static: false,
				private: false,
				access: {
					has: (obj) => "poll" in obj,
					get: (obj) => obj.poll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _logout_decorators, {
				kind: "method",
				name: "logout",
				static: false,
				private: false,
				access: {
					has: (obj) => "logout" in obj,
					get: (obj) => obj.logout
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		credentials = __runInitializers(this, _instanceExtraInitializers);
		ref;
		oauth;
		loadAccount;
		credentialManager;
		updateModelEnabled;
		attempt;
		/**
		* @param ctx - Host context carrying the credential service.
		* @param credentials - credential storage used for login and logout.
		* @param ref - OAuth JSON credential reference.
		* @param oauth - provider-native login handler.
		*/
		constructor(ctx, credentials, ref, oauth, loadAccount, credentialManager, updateModelEnabled) {
			super(ctx, "antiGravityAuth");
			this.credentials = credentials;
			this.ref = ref;
			this.oauth = oauth;
			this.loadAccount = loadAccount;
			this.credentialManager = credentialManager;
			this.updateModelEnabled = updateModelEnabled;
			ctx.effect(() => () => {
				this.attempt?.controller.abort("Anti Gravity auth service disposed");
				this.attempt = void 0;
			}, "llm-pi-ai-antigravity: cancel login");
		}
		/**
		* Read credential metadata without exposing credential values.
		* @returns credential metadata safe for browser display.
		*/
		async describe() {
			const info = await this.credentials.describe(this.ref);
			const snapshot = { configured: info.configured, ...info.source === void 0 ? {} : { source: info.source } };
			if (info.configured && this.loadAccount !== void 0) {
				try { snapshot.quota = await this.loadAccount(); }
				catch { snapshot.quota = { fetchedAt: Date.now(), groups: [], models: [], error: "Unable to refresh model and quota information. Try again or sign in again." }; }
			}
			return snapshot;
		}
		/** Persist one validated model choice through this profile's settings namespace. */
		async setModelEnabled(modelId, enabled) {
			if (typeof modelId !== "string" || modelId.length > 128 || typeof enabled !== "boolean") throw new Error("Invalid model selection");
			if (!this.updateModelEnabled) throw new Error("Model selection settings are unavailable");
			await this.updateModelEnabled(modelId, enabled);
		}
		/**
		* Start one provider-native OAuth flow and return its browser URL.
		* @returns opaque login id and authorization URL.
		*/
		async start() {
			this.attempt?.controller.abort("A newer Anti Gravity login started");
			const attempt = {
				id: loginId(),
				controller: new AbortController(),
				status: { kind: "pending" }
			};
			this.attempt = attempt;
			const url = Promise.withResolvers();
			const notify = (event) => {
				if (event.type === "auth_url") url.resolve(event.url);
			};
			const prompt = (_prompt) => Promise.reject(/* @__PURE__ */ new Error("Anti Gravity OAuth does not support interactive text prompts"));
			this.oauth.login({
				signal: attempt.controller.signal,
				notify,
				prompt
			}).then(async (credential) => {
				if (this.attempt !== attempt || attempt.controller.signal.aborted) return;
				if (this.credentialManager) await this.credentialManager.setCredential(JSON.stringify(credential));
				else await this.credentials.set(this.ref, JSON.stringify(credential));
				attempt.status = { kind: "succeeded" };
			}).catch((error) => {
				if (attempt.controller.signal.aborted) {
					attempt.status = { kind: "cancelled" };
					url.reject(/* @__PURE__ */ new Error("Anti Gravity OAuth was cancelled"));
					return;
				}
				const message = failureMessage(error);
				attempt.status = {
					kind: "failed",
					message
				};
				url.reject(new Error(message));
			});
			return {
				loginId: attempt.id,
				authorizationUrl: await url.promise
			};
		}
		/**
		* Read one login attempt without exposing OAuth secrets.
		* @param id - opaque id returned by {@link start}.
		* @returns current terminal or pending status.
		*/
		poll(id) {
			if (this.attempt?.id !== id) return {
				kind: "failed",
				message: "Anti Gravity login attempt is no longer active"
			};
			return this.attempt.status;
		}
		/** Remove the stored OAuth credential and cancel any active login. */
		async logout() {
			this.attempt?.controller.abort("Anti Gravity logout");
			this.attempt = void 0;
			if (this.credentialManager) await this.credentialManager.clearCredential();
			else await this.credentials.unset(this.ref);
		}
	};
})();
//#endregion
//#region lib/types/index.js
/** Independent Google Anti Gravity provider route and OAuth settings service. */
const name = "llm-pi-ai-antigravity";
const inject = ["llm", "credentials", "settings"];
const DEFAULT_OAUTH_CREDENTIAL_REF = "GOOGLE_ANTIGRAVITY_OAUTH_CREDENTIAL";
const DEFAULT_DISPLAY_NAME = "Google Anti Gravity";
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
/** Schemastery validator for the independent Anti Gravity route. */
const Config = z.object({
	modelEnabled: z.dict(z.boolean()).default({}).volatile(),
	oauthCredentialEnv: z.string().role("credential-ref").default(DEFAULT_OAUTH_CREDENTIAL_REF),
	oauthClientConfigRef: z.string().role("credential-ref").default(DEFAULT_OAUTH_CLIENT_CONFIG_REF),
	macosApplicationPath: z.string(),
	displayName: z.string().default(DEFAULT_DISPLAY_NAME),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	maxRequestImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_REQUEST_IMAGE_BYTES),
	requestImagePixelBudget: z.number().step(1).min(1).default(DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET),
	requestImageMaxBytes: z.number().step(1).min(1).default(DEFAULT_REQUEST_IMAGE_MAX_BYTES)
});
function resolveConfig(config) {
	const displayName = config.displayName ?? DEFAULT_DISPLAY_NAME;
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
	const maxRequestImageBytes = config.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES;
	const requestImagePixelBudget = config.requestImagePixelBudget ?? DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET;
	const requestImageMaxBytes = config.requestImageMaxBytes ?? DEFAULT_REQUEST_IMAGE_MAX_BYTES;
	if (displayName.length === 0) throw new Error("llm-pi-ai-antigravity: displayName must not be empty");
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-pi-ai-antigravity: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (!Number.isInteger(maxRequestImageBytes) || maxRequestImageBytes <= 0) throw new Error("llm-pi-ai-antigravity: maxRequestImageBytes must be a positive integer");
	if (!Number.isSafeInteger(requestImagePixelBudget) || requestImagePixelBudget <= 0) throw new Error("llm-pi-ai-antigravity: requestImagePixelBudget must be a positive safe integer");
	if (!Number.isSafeInteger(requestImageMaxBytes) || requestImageMaxBytes <= 0) throw new Error("llm-pi-ai-antigravity: requestImageMaxBytes must be a positive safe integer");
	return {
		oauthCredentialEnv: credentialRef(config.oauthCredentialEnv ?? DEFAULT_OAUTH_CREDENTIAL_REF),
		oauthClientConfigRef: config.oauthClientConfigRef === void 0 || config.oauthClientConfigRef === "GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG" ? DEFAULT_OAUTH_CLIENT_CONFIG_REF : config.oauthClientConfigRef,
		// Old default IDE-path overrides do not keep the retired importer alive.
		...config.macosApplicationPath === void 0 || /(?:^|\/)Antigravity IDE\.app\/?$/.test(config.macosApplicationPath) ? {} : { macosApplicationPath: config.macosApplicationPath },
		displayName,
		streamIdleTimeoutMs,
		maxRequestImageBytes,
		requestImagePixelBudget,
		requestImageMaxBytes
	};
}
/** Auth handler that accepts only a request-level OAuth-derived override. */
const requestOverrideAuth = {
	name: "Google Anti Gravity OAuth request override",
	resolve: ({ credential }) => Promise.resolve(credential?.key === void 0 || credential.key.length === 0 ? void 0 : {
		auth: { apiKey: credential.key },
		source: "OAuth"
	})
};
function providerFor(config, models, oauth) {
	const resolvedModels = models.map((model) => ({
		...model,
		provider: PROVIDER,
		baseUrl: ENDPOINTS[0]
	}));
	return createProvider({
		id: PROVIDER,
		name: config.displayName,
		baseUrl: ENDPOINTS[0],
		auth: {
			apiKey: requestOverrideAuth,
			oauth
		},
		models: resolvedModels,
		api: antiGravityApi
	});
}
function profileFor(config, models, oauth) {
	return new Map([[PROVIDER, {
		provider: PROVIDER,
		displayName: config.displayName,
		streamIdleTimeoutMs: config.streamIdleTimeoutMs,
		maxRequestImageBytes: config.maxRequestImageBytes,
		requestImagePixelBudget: config.requestImagePixelBudget,
		requestImageMaxBytes: config.requestImageMaxBytes,
		retryPolicy: resolveRetryPolicy(void 0, "llm-pi-ai-antigravity: retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		modelErrors: /* @__PURE__ */ new Map(),
		piProvider: providerFor(config, models, oauth)
	}]]);
}
/**
* Register Anti Gravity inference, OAuth Remote methods, and the maintained/live catalog.
* @param ctx - Cordis context providing LLM, credential, and optional attachment services.
* @param rawConfig - validated plugin configuration.
*/
function apply(ctx, rawConfig) {
	const config = resolveConfig(rawConfig);
	const settingsNs = ctx.fiber?.entry?.options.id;
	ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
	const emptyOverrides = {};
	const modelOverrides = () => typeof rawConfig.modelEnabled?.get === "function" ? rawConfig.modelEnabled.get() : rawConfig.modelEnabled ?? emptyOverrides;
	const oauth = createAntiGravityOAuth(() => resolveOAuthClientConfig(ctx.credentials, config.oauthClientConfigRef, config.macosApplicationPath));
	const credentials = new AntiGravityCredentialManager(ctx.credentials, config.oauthCredentialEnv, oauth);
	// Do not advertise obsolete static models before the account catalog is known.
	let liveModels = [];
	let lastOverrides;
	let profiles = profileFor(config, [], oauth);
	const adapter = new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: () => credentials.resolveApiKey(),
		auth: {
			credentials: new InMemoryCredentialStore(),
			authContext: defaultProviderAuthContext()
		},
		resolveAttachments: () => ctx.get("attachments")
	});
	const registration = ctx.llm.registerAdapter([PROVIDER], adapter);
	const publishModels = () => {
		const overrides = modelOverrides();
		profiles = profileFor(config, liveModels.filter((model) => isModelEnabled(model, overrides)).map((model) => selectModelRoutes(model, overrides)), oauth);
		lastOverrides = overrides;
		registration.replace([PROVIDER]);
	};
	const withModelSelection = (quota) => {
		const overrides = modelOverrides();
		return { ...quota, models: groupedQuotaModels(quota, liveModels, overrides) };
	};
	ctx.on("loader/volatile-update", () => { if (modelOverrides() !== lastOverrides) publishModels(); });
	const controller = new AbortController();
	const setModelEnabled = async (modelId, enabled) => {
		if (controller.signal.aborted) throw new Error("Anti Gravity model settings are no longer active");
		if (typeof modelId !== "string" || typeof enabled !== "boolean" || !liveModels.some((model) => model.id === modelId)) throw new Error("Model is not in the current account catalog; refresh and try again");
		if (!settingsNs) throw new Error("A profile settings namespace is required to save model selection");
		try {
			const view = ctx.settings.describe({ redactSecrets: true }).find((entry) => entry.ns === settingsNs);
			if (!view) throw new Error("Missing settings namespace");
			await ctx.settings.mutate(settingsNs, [{ op: "set", path: ["modelEnabled", modelId], value: enabled }], view.revision);
		} catch {
			throw new Error("Unable to save model selection. Refresh and try again.");
		}
		if (!controller.signal.aborted) publishModels();
	};
	let generation = 0;
	let accountCache;
	let pending;
	let retryTimer;
	let retryAttempt = 0;
	const retryDelays = [2000, 5000, 15000, 60000, 300000];
	const loadAccount = () => {
		if (accountCache !== void 0 && Date.now() - accountCache.fetchedAt < 5000) return Promise.resolve(withModelSelection(accountCache));
		if (pending !== void 0 && pending.generation === generation) return pending.promise.then(withModelSelection);
		const owner = { generation, promise: void 0 };
		owner.promise = (async () => {
			const credential = await credentials.resolveCredential();
			const result = await fetchAccountSnapshot(credential, controller.signal);
			if (owner.generation !== generation || controller.signal.aborted) throw new Error("Anti Gravity account changed during refresh");
			liveModels = groupAvailableModels(result.models);
			publishModels();
			accountCache = result.quota;
			clearTimeout(retryTimer);
			retryTimer = void 0;
			retryAttempt = 0;
			return accountCache;
		})().finally(() => { if (pending === owner) pending = void 0; });
		pending = owner;
		return owner.promise.then(withModelSelection);
	};
	new AntiGravityAuthRemote(ctx, ctx.credentials, config.oauthCredentialEnv, oauth, loadAccount, credentials, setModelEnabled);
	const refresh = () => {
		const ownerGeneration = generation;
		void loadAccount().catch((error) => {
			if (controller.signal.aborted || ownerGeneration !== generation) return;
			ctx.logger.info("llm-pi-ai-antigravity: live model/quota refresh unavailable; no unverified models were added");
			if (error?.code !== "MISSING_CREDENTIAL" && retryTimer === void 0 && retryAttempt < retryDelays.length) {
				retryTimer = setTimeout(() => {
					retryTimer = void 0;
					if (!controller.signal.aborted && ownerGeneration === generation) refresh();
				}, retryDelays[retryAttempt++]);
			}
		});
	};
	ctx.effect(() => {
		const timers = [setTimeout(refresh, 0), setTimeout(refresh, 250)];
		return () => {
			for (const timer of timers) clearTimeout(timer);
			clearTimeout(retryTimer);
			controller.abort();
		};
	}, "llm-pi-ai-antigravity: live refresh");
	ctx.on("credentials/reference-updated", (ref) => {
		if (ref !== config.oauthCredentialEnv) return;
		generation++;
		credentials.invalidate();
		clearTimeout(retryTimer);
		retryTimer = void 0;
		retryAttempt = 0;
		accountCache = void 0;
		liveModels = [];
		publishModels();
		refresh();
	});
}
//#endregion
export { AntiGravityAuthRemote, AntiGravityCredentialManager, Config, DEFAULT_OAUTH_CLIENT_CONFIG_REF, PROVIDER, apply, createAntiGravityOAuth, extractOAuthClientConfig, fetchAvailableModels, fetchAvailableModelsForCredential, importInstalledOAuthClientConfig, inject, maintainedModels, name, parseAntiGravityCredential, parseAvailableModels, parseOAuthClientConfig, resolveOAuthClientConfig };
