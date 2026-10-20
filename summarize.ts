export interface EditRecord {
	toolCallId: string;
	toolName: string;
	details: unknown;
}

interface SkillManageDetails {
	action?: string;
	skill?: string;
}

function isSkillManageDetails(value: unknown): value is SkillManageDetails {
	return typeof value === "object" && value !== null;
}

interface PiJournalDetails {
	ts?: string;
	file?: string;
	created?: boolean;
}

function isPiJournalDetails(value: unknown): value is PiJournalDetails {
	return typeof value === "object" && value !== null;
}

interface VaultDailyDetails {
	date?: string;
	created?: boolean;
}

interface VaultPendingDetails {
	action?: string;
	type?: string;
	filename?: string;
}

interface VaultSourceDetails {
	entry?: string;
}

interface MemoryDetails {
	bytesBefore?: number;
	bytesAfter?: number;
}

function isMemoryDetails(value: unknown): value is MemoryDetails {
	return typeof value === "object" && value !== null;
}

/** Net `memory.md` size for a run: size before its first successful `memory`
 *  call, size after its last. Null when the run touched memory not at all —
 *  "no writes" and "no size change" are different facts. */
export interface MemoryByteSpan {
	from: number;
	to: number;
}

export function memoryByteSpan(edits: EditRecord[]): MemoryByteSpan | null {
	let from: number | undefined;
	let to: number | undefined;
	const seen = new Set<string>();
	for (const edit of edits) {
		if (seen.has(edit.toolCallId)) continue;
		seen.add(edit.toolCallId);
		if (edit.toolName !== "memory" || !isMemoryDetails(edit.details)) continue;
		const before = edit.details.bytesBefore;
		const after = edit.details.bytesAfter;
		if (typeof before !== "number" || typeof after !== "number") continue;
		if (from === undefined) from = before;
		to = after;
	}
	if (from === undefined || to === undefined) return null;
	return { from, to };
}

function isVaultDailyDetails(value: unknown): value is VaultDailyDetails {
	return typeof value === "object" && value !== null;
}

function isVaultPendingDetails(value: unknown): value is VaultPendingDetails {
	return typeof value === "object" && value !== null;
}

function isVaultSourceDetails(value: unknown): value is VaultSourceDetails {
	return typeof value === "object" && value !== null;
}

export function summarizeEdits(edits: EditRecord[]): string | null {
	const seen = new Set<string>();
	const parts: string[] = [];
	let memoryReported = false;
	let journalReported = false;
	let dailyReported = false;
	let pendingCount = 0;
	let sourceCount = 0;

	for (const edit of edits) {
		if (seen.has(edit.toolCallId)) continue;
		seen.add(edit.toolCallId);

		if (edit.toolName === "memory") {
			if (!memoryReported) {
				// Carry the byte delta in the one live signal the human sees, so
				// "memory grew again" is readable at the end of a session rather
				// than something a prune pass discovers weeks later.
				const span = memoryByteSpan(edits);
				parts.push(span ? `Memory updated (${span.from} → ${span.to} B)` : "Memory updated");
				memoryReported = true;
			}
			continue;
		}

		if (edit.toolName === "skill_manage" && isSkillManageDetails(edit.details)) {
			const action = edit.details.action;
			const skill = edit.details.skill;
			if ((action === "write" || action === "write_file") && typeof skill === "string" && skill.length > 0) {
				parts.push(`Skill "${skill}" patched`);
			}
			continue;
		}

		if (edit.toolName === "pi_journal" && isPiJournalDetails(edit.details)) {
			if (!journalReported) {
				parts.push("Session logged");
				journalReported = true;
			}
			continue;
		}

		if (edit.toolName === "vault_daily" && isVaultDailyDetails(edit.details)) {
			if (!dailyReported) {
				const suffix = edit.details.created ? " (created)" : "";
				parts.push(`Daily note updated${suffix}`);
				dailyReported = true;
			}
			continue;
		}

		if (edit.toolName === "vault_pending" && isVaultPendingDetails(edit.details)) {
			if (edit.details.action === "propose") {
				pendingCount++;
			}
			continue;
		}

		if (edit.toolName === "vault_source" && isVaultSourceDetails(edit.details)) {
			sourceCount++;
			continue;
		}
	}

	if (pendingCount > 0) {
		parts.push(`${pendingCount} vault ${pendingCount === 1 ? "item" : "items"} proposed`);
	}
	if (sourceCount > 0) {
		parts.push(`${sourceCount} ${sourceCount === 1 ? "source" : "sources"} queued`);
	}

	if (parts.length === 0) return null;
	return parts.join(" · ");
}
