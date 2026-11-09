// Deliberately finite allowlists: upstream text must never enter diagnostics.
const FINISH_REASONS = new Set([
	"FINISH_REASON_UNSPECIFIED",
	"STOP",
	"MAX_TOKENS",
	"SAFETY",
	"RECITATION",
	"LANGUAGE",
	"OTHER",
	"BLOCKLIST",
	"PROHIBITED_CONTENT",
	"SPII",
	"MALFORMED_FUNCTION_CALL",
	"IMAGE_SAFETY",
	"IMAGE_PROHIBITED_CONTENT",
	"IMAGE_OTHER",
	"NO_IMAGE",
	"IMAGE_RECITATION",
	"UNEXPECTED_TOOL_CALL",
	"TOO_MANY_TOOL_CALLS",
	"MODEL_ARMOR"
]);
const BLOCK_REASONS = new Set([
	"BLOCK_REASON_UNSPECIFIED",
	"SAFETY",
	"OTHER",
	"BLOCKLIST",
	"PROHIBITED_CONTENT",
	"IMAGE_SAFETY",
	"MODEL_ARMOR"
]);
const STATUSES = new Set([
	"OK",
	"CANCELLED",
	"UNKNOWN",
	"INVALID_ARGUMENT",
	"DEADLINE_EXCEEDED",
	"NOT_FOUND",
	"ALREADY_EXISTS",
	"PERMISSION_DENIED",
	"RESOURCE_EXHAUSTED",
	"FAILED_PRECONDITION",
	"ABORTED",
	"OUT_OF_RANGE",
	"UNIMPLEMENTED",
	"INTERNAL",
	"UNAVAILABLE",
	"DATA_LOSS",
	"UNAUTHENTICATED"
]);

// JSON fields only; do not consult inherited properties or invoke accessors.
function field(value, key) {
	if (value === null || typeof value !== "object") return undefined;
	return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function safeEnum(value, allowed, unknown) {
	return typeof value === "string" && allowed.has(value) ? value : unknown;
}

function errorDiagnostic(source, error) {
	const status = safeEnum(field(error, "status"), STATUSES, "UNKNOWN_STATUS");
	const code = field(error, "code");
	return `${source} status=${status}${code === undefined ? "" : ` code=${Number.isSafeInteger(code) ? code : "UNKNOWN_CODE"}`}`;
}

/**
 * Inspect a decoded Anti Gravity SSE chunk before consuming content/tool calls.
 * Returns a bounded, redacted failure description, or undefined without a failure.
 * Nullish fields mean absent; STOP/MAX_TOKENS are the only successful finishes.
 * Any other supplied finish/block reason fails, including unknown enum values.
 * An explicit error envelope fails even without status/code; an SSE error event
 * fails even without a payload. No raw text, payload serialization, or mutation.
 * @param {unknown} chunk - Decoded JSON payload (possibly absent for SSE errors).
 * @param {string} [eventName=""] - SSE event name, matched exactly to "error".
 * @returns {string | undefined}
 */
export function streamFailure(chunk, eventName = "") {
	const reasons = [];
	if (eventName === "error") reasons.push("SSE error");
	const response = field(chunk, "response");
	const topError = field(chunk, "error");
	const nestedError = field(response, "error");
	if (topError !== undefined && topError !== null) reasons.push(errorDiagnostic("error", topError));
	if (nestedError !== undefined && nestedError !== null) reasons.push(errorDiagnostic("response.error", nestedError));

	const blockReason = field(field(response, "promptFeedback"), "blockReason");
	if (blockReason !== undefined && blockReason !== null) {
		reasons.push(`blockReason=${safeEnum(blockReason, BLOCK_REASONS, "UNKNOWN_BLOCK_REASON")}`);
	}
	const finishReason = field(field(field(response, "candidates"), "0"), "finishReason");
	if (finishReason !== undefined && finishReason !== null && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
		reasons.push(`finishReason=${safeEnum(finishReason, FINISH_REASONS, "UNKNOWN_FINISH_REASON")}`);
	}
	return reasons.length === 0 ? undefined : `Anti Gravity stream failure: ${reasons.join("; ")}`;
}
