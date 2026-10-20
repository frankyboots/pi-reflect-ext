/**
 * Reviewer resource limits and truncation attribution.
 *
 * Pure module: no I/O, no pi imports, so both halves are testable without
 * booting the host.
 *
 * Why these are settings and not constants: `background-review.ts` used to
 * hard-code a 60 s wall and 16 turns. Audited against real runs, that wall sat
 * barely above the median completing run (43.8 s), so 22 of 29 reviews were
 * killed mid-flight — and 11 of those truncated runs never wrote `pi_journal`
 * or `vault_daily`, which the reviewer prompt calls the primary session record.
 * The two limits are now configurable (`reviewTimeoutMs`, `reviewMaxTurns`),
 * and `truncationReason` records *which* limit fired, because `truncated: true`
 * alone cannot distinguish "needs more time" from "needs fewer surfaces".
 */

/** No settings file: a six-surface reviewer needs more than a minute. */
export const DEFAULT_REVIEW_TIMEOUT_MS = 180_000;
export const DEFAULT_REVIEW_MAX_TURNS = 48;

/**
 * Accepted bounds for user-supplied values. Anything outside them is treated as
 * unset — a typo in `settings.json` should widen or narrow the budget, never
 * disable the reviewer or let it run a session indefinitely.
 */
export const REVIEW_TIMEOUT_BOUNDS: readonly [number, number] = [5_000, 600_000];
export const REVIEW_MAX_TURNS_BOUNDS: readonly [number, number] = [1, 200];

export interface ReviewLimits {
	/** Abort the reviewer loop this many ms after it starts. */
	timeoutMs: number;
	/** Stop after this many model turns, even if the reviewer keeps calling tools. */
	maxTurns: number;
}

export const DEFAULT_REVIEW_LIMITS: ReviewLimits = {
	timeoutMs: DEFAULT_REVIEW_TIMEOUT_MS,
	maxTurns: DEFAULT_REVIEW_MAX_TURNS,
};

function boundedInt(
	value: unknown,
	bounds: readonly [number, number],
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
	const [min, max] = bounds;
	if (value < min || value > max) return fallback;
	return value;
}

export function parseReviewTimeoutMs(value: unknown): number {
	return boundedInt(value, REVIEW_TIMEOUT_BOUNDS, DEFAULT_REVIEW_TIMEOUT_MS);
}

export function parseReviewMaxTurns(value: unknown): number {
	return boundedInt(value, REVIEW_MAX_TURNS_BOUNDS, DEFAULT_REVIEW_MAX_TURNS);
}

/** Which limit ended the run. `both` is reported as itself — collapsing it into
 *  `timeout` would hide a reviewer that is chaining too many tool calls. */
export type TruncationReason = "timeout" | "turns" | "both";

export function truncationReason(input: {
	aborted: boolean;
	turns: number;
	maxTurns: number;
}): TruncationReason | null {
	const timedOut = input.aborted;
	const turnCapped = input.turns >= input.maxTurns;
	if (timedOut && turnCapped) return "both";
	if (timedOut) return "timeout";
	if (turnCapped) return "turns";
	return null;
}
