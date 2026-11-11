const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { before, test } = require("node:test");

const libPath = path.resolve(__dirname, "../lib/stream-diagnostics.js");
const srcPath = path.resolve(__dirname, "../src/stream-diagnostics.js");
const prefix = "Anti Gravity stream failure: ";
let streamFailure;

before(async () => {
	({ streamFailure } = await import(pathToFileURL(libPath).href));
});

function candidate(finishReason, parts = []) {
	return { response: { candidates: [{ finishReason, content: { parts } }] } };
}

function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

test("lib and src are byte-identical dependency-free ESM modules", async () => {
	assert.deepEqual(readFileSync(libPath), readFileSync(srcPath));
	const lib = await import(pathToFileURL(libPath).href);
	const src = await import(pathToFileURL(srcPath).href);
	assert.deepEqual(Object.keys(lib), ["streamFailure"]);
	assert.deepEqual(Object.keys(src), ["streamFailure"]);
	assert.equal(src.streamFailure(candidate("SAFETY")), streamFailure(candidate("SAFETY")));
	assert.doesNotMatch(readFileSync(libPath, "utf8"), /\b(?:import|require)\s*\(?/);
});

test("absent diagnostics and malformed/empty payloads are harmless", () => {
	for (const chunk of [undefined, null, false, 0, "", "payload", [], {}, { response: null }, { response: {} }]) {
		assert.equal(streamFailure(chunk), undefined);
	}
});

test("ordinary streaming text and usage do not constitute a failure", () => {
	assert.equal(streamFailure({ response: {
		candidates: [{ content: { parts: [{ text: "synthetic response" }] } }],
		usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 3 }
	} }), undefined);
});

test("STOP and MAX_TOKENS remain successful with empty text or tools", () => {
	for (const reason of ["STOP", "MAX_TOKENS"]) {
		for (const parts of [[], [{ text: "" }], [{ functionCall: { name: "fixture_tool", args: {} } }]]) {
			assert.equal(streamFailure(candidate(reason, parts)), undefined);
		}
	}
});

test("all allowlisted non-success finishes survive even without text", () => {
	for (const reason of [
		"FINISH_REASON_UNSPECIFIED", "SAFETY", "RECITATION", "LANGUAGE", "OTHER",
		"BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL",
		"IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_OTHER", "NO_IMAGE",
		"IMAGE_RECITATION", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "MODEL_ARMOR"
	]) {
		assert.equal(streamFailure(candidate(reason)), `${prefix}finishReason=${reason}`);
	}
});

test("tool calls cannot hide a concurrent finish failure or nested error", () => {
	const parts = [{ functionCall: { name: "fixture_tool", args: { synthetic: true } }, thoughtSignature: "FAKE_SIGNATURE" }];
	assert.equal(streamFailure(candidate("MALFORMED_FUNCTION_CALL", parts)), `${prefix}finishReason=MALFORMED_FUNCTION_CALL`);
	const chunk = candidate("STOP", parts);
	chunk.response.error = { status: "INTERNAL", code: 13 };
	assert.equal(streamFailure(chunk), `${prefix}response.error status=INTERNAL code=13`);
});

test("earlier tool output does not suppress a later failure", () => {
	assert.equal(streamFailure(candidate(undefined, [{ functionCall: { name: "fixture_tool", args: {} } }])), undefined);
	assert.equal(streamFailure(candidate("SAFETY")), `${prefix}finishReason=SAFETY`);
});

test("top-level errors work without a response envelope", () => {
	assert.equal(streamFailure({ error: { status: "RESOURCE_EXHAUSTED", code: 429, message: "PRIVATE_MESSAGE" } }),
		`${prefix}error status=RESOURCE_EXHAUSTED code=429`);
});

test("nested errors work with a normal finish and never return raw messages", () => {
	const chunk = candidate("MAX_TOKENS");
	chunk.response.error = { status: "PERMISSION_DENIED", code: 403, message: "PRIVATE_MESSAGE" };
	assert.equal(streamFailure(chunk), `${prefix}response.error status=PERMISSION_DENIED code=403`);
});

test("empty, primitive and malformed explicit error envelopes still fail", () => {
	for (const error of [{}, "PRIVATE_MESSAGE", false, 0, [], { message: "PRIVATE_MESSAGE" }]) {
		assert.equal(streamFailure({ error }), `${prefix}error status=UNKNOWN_STATUS`);
		assert.equal(streamFailure({ response: { error } }), `${prefix}response.error status=UNKNOWN_STATUS`);
	}
});

test("all known promptFeedback block reasons are reported without candidates", () => {
	for (const blockReason of ["BLOCK_REASON_UNSPECIFIED", "SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY", "MODEL_ARMOR"]) {
		assert.equal(streamFailure({ response: { promptFeedback: { blockReason } } }), `${prefix}blockReason=${blockReason}`);
	}
	assert.equal(streamFailure({ response: { promptFeedback: { safetyRatings: [] } } }), undefined);
});

test("multiple failure signals retain all safe diagnostics in stable order", () => {
	const chunk = candidate("RECITATION");
	chunk.error = { status: "UNAVAILABLE", code: 503 };
	chunk.response.error = { status: "ABORTED", code: 409 };
	chunk.response.promptFeedback = { blockReason: "SAFETY" };
	assert.equal(streamFailure(chunk, "error"), `${prefix}SSE error; error status=UNAVAILABLE code=503; response.error status=ABORTED code=409; blockReason=SAFETY; finishReason=RECITATION`);
});

test("SSE error labels fail even for absent, empty or DONE payloads", () => {
	for (const chunk of [undefined, null, {}, "", "[DONE]", candidate("STOP")]) {
		assert.equal(streamFailure(chunk, "error"), `${prefix}SSE error`);
	}
});

test("SSE event matching is exact and never reflects an arbitrary label", () => {
	for (const eventName of [undefined, null, "", "message", "Error", "error\nPRIVATE_EVENT", { toString() { throw new Error("must not coerce"); } }]) {
		assert.equal(streamFailure({}, eventName), undefined);
	}
});

test("unknown or malicious enum strings become explicit UNKNOWN labels", () => {
	for (const value of ["", "FUTURE_REASON", "safety", "SAFETY\nPRIVATE_TOKEN", "STOP PRIVATE_PROMPT", "INTERNAL;PRIVATE_SIGNATURE", "__proto__", "constructor"]) {
		const chunk = candidate(value);
		chunk.error = { status: value };
		chunk.response.promptFeedback = { blockReason: value };
		assert.equal(streamFailure(chunk), `${prefix}error status=UNKNOWN_STATUS; blockReason=UNKNOWN_BLOCK_REASON; finishReason=UNKNOWN_FINISH_REASON`);
	}
});

test("non-string enum values are never coerced or serialized", () => {
	const hostile = { toString() { throw new Error("must not stringify"); }, toJSON() { throw new Error("must not serialize"); } };
	for (const value of [false, 12, [], {}, hostile, Symbol("PRIVATE_SYMBOL"), 2n]) {
		const chunk = candidate(value);
		chunk.error = { status: value };
		chunk.response.promptFeedback = { blockReason: value };
		assert.equal(streamFailure(chunk), `${prefix}error status=UNKNOWN_STATUS; blockReason=UNKNOWN_BLOCK_REASON; finishReason=UNKNOWN_FINISH_REASON`);
	}
});

test("raw message, finishMessage, details, headers, token, prompt and signatures are never read", () => {
	const chunk = candidate("SAFETY", [{ text: "PRIVATE_TEXT", thoughtSignature: "PRIVATE_SIGNATURE" }]);
	chunk.error = { status: "INTERNAL", code: 500 };
	chunk.response.error = { status: "UNKNOWN" };
	chunk.response.promptFeedback = { blockReason: "SAFETY" };
	for (const node of [chunk, chunk.error, chunk.response, chunk.response.error, chunk.response.promptFeedback, chunk.response.candidates[0]]) {
		for (const key of ["message", "finishMessage", "details", "headers", "token", "prompt", "signature", "thoughtSignature"]) {
			Object.defineProperty(node, key, { get() { throw new Error(`forbidden field read: ${key}`); } });
		}
	}
	assert.equal(streamFailure(chunk), `${prefix}error status=INTERNAL code=500; response.error status=UNKNOWN; blockReason=SAFETY; finishReason=SAFETY`);
});

test("only canonical Google RPC status enum names are retained", () => {
	for (const status of [
		"OK", "CANCELLED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "NOT_FOUND",
		"ALREADY_EXISTS", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION",
		"ABORTED", "OUT_OF_RANGE", "UNIMPLEMENTED", "INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED"
	]) {
		assert.equal(streamFailure({ error: { status } }), `${prefix}error status=${status}`);
	}
});

test("safe integer error codes are preserved including signed bounds", () => {
	for (const code of [0, -1, 13, 429, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
		assert.equal(streamFailure({ error: { code } }), `${prefix}error status=UNKNOWN_STATUS code=${code}`);
	}
});

test("unsafe, fractional, string and object codes never enter the diagnostic", () => {
	for (const code of [null, "429", "PRIVATE_CODE", 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1n, { toString() { throw new Error("must not coerce code"); } }]) {
		assert.equal(streamFailure({ error: { code } }), `${prefix}error status=UNKNOWN_STATUS code=UNKNOWN_CODE`);
	}
});

test("nullish optional error, finish and block fields mean absent", () => {
	for (const value of [null, undefined]) {
		const chunk = candidate(value);
		chunk.error = value;
		chunk.response.error = value;
		chunk.response.promptFeedback = { blockReason: value };
		assert.equal(streamFailure(chunk), undefined);
	}
});

test("input remains unchanged and deeply frozen fixtures are supported", () => {
	const chunk = candidate("OTHER", [{ functionCall: { name: "fixture_tool", args: { nested: [1, 2] } } }]);
	chunk.error = { status: "INTERNAL", code: 500, details: { synthetic: true } };
	chunk.response.promptFeedback = { blockReason: "OTHER" };
	const before = structuredClone(chunk);
	deepFreeze(chunk);
	assert.equal(streamFailure(chunk), `${prefix}error status=INTERNAL code=500; blockReason=OTHER; finishReason=OTHER`);
	assert.deepEqual(chunk, before);
});

test("diagnostics are deterministic and bounded for very large untrusted strings", () => {
	const secret = "SYNTHETIC_PRIVATE_VALUE".repeat(10000);
	const chunk = candidate(secret);
	chunk.error = { status: secret, message: secret, code: secret, details: secret };
	chunk.response.promptFeedback = { blockReason: secret };
	const result = streamFailure(chunk, "error");
	assert.equal(result, `${prefix}SSE error; error status=UNKNOWN_STATUS code=UNKNOWN_CODE; blockReason=UNKNOWN_BLOCK_REASON; finishReason=UNKNOWN_FINISH_REASON`);
	assert.equal(streamFailure(chunk, "error"), result);
	assert.ok(result.length < 256);
});

test("inherited fields and accessors cannot inject diagnostics or execute code", () => {
	assert.equal(streamFailure(Object.create({ error: { status: "INTERNAL" } })), undefined);
	const chunk = { response: { candidates: [Object.create({ finishReason: "SAFETY" })] } };
	Object.defineProperty(chunk, "error", { get() { throw new Error("must not invoke getter"); } });
	assert.equal(streamFailure(chunk), undefined);
});
