import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_REVIEW_LIMITS,
	parseReviewMaxTurns,
	parseReviewTimeoutMs,
	truncationReason,
} from "../lib/limits.ts";
import { memoryByteSpan } from "../summarize.ts";

// The two defaults this release exists for. If either moves, the run history in
// log.jsonl stops being comparable with the history before it.
test("reviewer limits default to 180 s / 48 turns", () => {
	assert.equal(DEFAULT_REVIEW_LIMITS.timeoutMs, 180_000);
	assert.equal(DEFAULT_REVIEW_LIMITS.maxTurns, 48);
});

test("in-range values are honoured", () => {
	assert.equal(parseReviewTimeoutMs(45_000), 45_000);
	assert.equal(parseReviewMaxTurns(8), 8);
	assert.equal(parseReviewTimeoutMs(600_000), 600_000);
	assert.equal(parseReviewMaxTurns(200), 200);
});

test("out-of-range and malformed values fall back to the default", () => {
	// A typo must not mean "never abort" or "abort immediately".
	for (const bad of [1, 4_999, 600_001, 99_999_999, 1.5, Number.NaN, "180000", null, undefined, {}]) {
		assert.equal(parseReviewTimeoutMs(bad), DEFAULT_REVIEW_LIMITS.timeoutMs, `timeout: ${String(bad)}`);
	}
	for (const bad of [0, -1, 201, 2.5, "48", null, undefined, []]) {
		assert.equal(parseReviewMaxTurns(bad), DEFAULT_REVIEW_LIMITS.maxTurns, `turns: ${String(bad)}`);
	}
});

test("truncation is attributed to the limit that fired", () => {
	assert.equal(truncationReason({ aborted: false, turns: 5, maxTurns: 48 }), null);
	assert.equal(truncationReason({ aborted: true, turns: 5, maxTurns: 48 }), "timeout");
	assert.equal(truncationReason({ aborted: false, turns: 48, maxTurns: 48 }), "turns");
	assert.equal(truncationReason({ aborted: true, turns: 48, maxTurns: 48 }), "both");
});

test("memory byte span spans the run, not one call", () => {
	assert.equal(memoryByteSpan([]), null);
	assert.equal(memoryByteSpan([{ toolCallId: "a", toolName: "skill_manage", details: {} }]), null);

	const edits = [
		{ toolCallId: "a", toolName: "memory", details: { bytesBefore: 2708, bytesAfter: 2894 } },
		{ toolCallId: "b", toolName: "skill_manage", details: { action: "write", skill: "x" } },
		{ toolCallId: "c", toolName: "memory", details: { bytesBefore: 2894, bytesAfter: 2850 } },
	];
	assert.deepEqual(memoryByteSpan(edits), { from: 2708, to: 2850 });

	// A retried tool call id is one call, not two.
	assert.deepEqual(memoryByteSpan([edits[0], edits[0], edits[2]]), { from: 2708, to: 2850 });

	// Details without numbers (older records, or a tool that changed shape) are
	// skipped rather than reported as a zero-byte file.
	assert.equal(memoryByteSpan([{ toolCallId: "a", toolName: "memory", details: {} }]), null);
});
