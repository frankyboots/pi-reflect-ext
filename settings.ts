import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_REVIEW_LIMITS, parseReviewMaxTurns, parseReviewTimeoutMs } from "./lib/limits.ts";
import { getReflectHome } from "./safe-path.ts";

export type ReflectMode = "off" | "session" | "batch";

const MODES: ReadonlyArray<ReflectMode> = ["off", "session", "batch"];

export function isReflectMode(value: unknown): value is ReflectMode {
	return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export interface ReflectSettings {
	mode: ReflectMode;
	protectedSkills: string[];
	batchSize: number;
	vaultPath: string;
	/** Master switch for the memory surface: injection, tool registration, and reviewer access. */
	memory: boolean;
	/** Free-text policy appended to the reviewer prompt above the current memory contents. Empty = omitted. */
	memoryGuidance: string;
	/** How long one review may run before it is aborted. */
	reviewTimeoutMs: number;
	/** How many model turns one review may take before it is stopped. */
	reviewMaxTurns: number;
	/**
	 * Set when `settings.json` existed but could not be read or parsed, in which
	 * case every value above is a default. Surfaced by `/reflect status` so a
	 * typo in the file cannot masquerade as "my setting took effect".
	 */
	settingsError?: string;
}

const DEFAULT_SETTINGS: ReflectSettings = {
	mode: "session",
	protectedSkills: [],
	batchSize: 5,
	vaultPath: "",
	memory: true,
	memoryGuidance: "",
	reviewTimeoutMs: DEFAULT_REVIEW_LIMITS.timeoutMs,
	reviewMaxTurns: DEFAULT_REVIEW_LIMITS.maxTurns,
};

function settingsPath(): string {
	return path.join(getReflectHome(), "settings.json");
}

interface SettingsFileShape {
	"pi-reflect"?: {
		mode?: unknown;
		protectedSkills?: unknown;
		batchSize?: unknown;
		vaultPath?: unknown;
		memory?: unknown;
		memoryGuidance?: unknown;
		reviewTimeoutMs?: unknown;
		reviewMaxTurns?: unknown;
	};
}

function parseBatchSize(value: unknown): number {
	if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
	return DEFAULT_SETTINGS.batchSize;
}

function parseProtectedSkills(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.length > 0) out.push(item);
	}
	return out;
}

let cache: ReflectSettings | null = null;

export function loadSettings(): ReflectSettings {
	if (cache) return cache;
	const target = settingsPath();
	try {
		const raw = fs.readFileSync(target, "utf-8");
		const parsed = JSON.parse(raw) as SettingsFileShape;
		const section = parsed["pi-reflect"];
		if (!section || typeof section !== "object") {
			cache = { ...DEFAULT_SETTINGS };
			return cache;
		}
		const mode = isReflectMode(section.mode) ? section.mode : DEFAULT_SETTINGS.mode;
		const protectedSkills = parseProtectedSkills(section.protectedSkills);
		const batchSize = parseBatchSize(section.batchSize);
		const vaultPath = typeof section.vaultPath === "string" ? section.vaultPath : DEFAULT_SETTINGS.vaultPath;
		const memory = typeof section.memory === "boolean" ? section.memory : DEFAULT_SETTINGS.memory;
		const memoryGuidance =
			typeof section.memoryGuidance === "string" ? section.memoryGuidance : DEFAULT_SETTINGS.memoryGuidance;
		const reviewTimeoutMs = parseReviewTimeoutMs(section.reviewTimeoutMs);
		const reviewMaxTurns = parseReviewMaxTurns(section.reviewMaxTurns);
		cache = {
			mode,
			protectedSkills,
			batchSize,
			vaultPath,
			memory,
			memoryGuidance,
			reviewTimeoutMs,
			reviewMaxTurns,
		};
		return cache;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		// No file at all is the normal state: defaults, nothing to report.
		if (code === "ENOENT") {
			cache = { ...DEFAULT_SETTINGS };
			return cache;
		}
		// A file that exists but will not parse is not normal, and silently
		// running on defaults would make a broken setting look like an applied
		// one. Keep the defaults, record why, and let `/reflect status` say so.
		cache = { ...DEFAULT_SETTINGS, settingsError: err instanceof Error ? err.message : String(err) };
		return cache;
	}
}

export function invalidateSettingsCache(): void {
	cache = null;
}

export function overrideMode(mode: ReflectMode): ReflectSettings {
	const current = loadSettings();
	cache = { ...current, mode };
	return cache;
}
