import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

// `getReflectHome()` resolves `os.homedir()`, which honours $HOME, so the real
// reader can be pointed at a scratch profile instead of the human's ~/.pi.
// Each case runs in a child process because `loadSettings()` caches its result
// for the lifetime of the process — the same cache that makes a settings edit
// wait for the next `session_start`.
function readSettingsFrom(config: string | null): Record<string, unknown> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-reflect-test-"));
	if (config !== null) {
		// `getReflectHome()` is the profile root itself (`~/.pi`), so the file
		// lives beside `memory.md`, not inside `reflect/` with the state files.
		fs.mkdirSync(path.join(home, ".pi"), { recursive: true });
		fs.writeFileSync(path.join(home, ".pi", "settings.json"), config, "utf-8");
	}
	const script = `import(${JSON.stringify(path.join(import.meta.dirname!, "..", "settings.ts"))})
		.then((m) => console.log(JSON.stringify(m.loadSettings())))`;
	const out = execFileSync(process.execPath, ["-e", script], { env: { ...process.env, HOME: home }, encoding: "utf-8" });
	fs.rmSync(home, { recursive: true, force: true });
	return JSON.parse(out);
}

test("no settings file yields the documented defaults", () => {
	const settings = readSettingsFrom(null);
	assert.equal(settings.reviewTimeoutMs, 180_000);
	assert.equal(settings.reviewMaxTurns, 48);
	assert.equal(settings.memory, true, "merging the gate must not arm the kill switch");
	assert.equal(settings.memoryGuidance, "");
	assert.equal(settings.settingsError, undefined);
});

test("the documented keys are the keys the reader reads", () => {
	// Exactly the example in README.md's Settings section. If a key is renamed
	// on one side only, this fails instead of quietly running on defaults.
	const settings = readSettingsFrom(
		JSON.stringify({
			"pi-reflect": {
				mode: "session",
				batchSize: 5,
				protectedSkills: ["create-skill"],
				reviewTimeoutMs: 45_000,
				reviewMaxTurns: 12,
			},
		}),
	);
	assert.equal(settings.reviewTimeoutMs, 45_000);
	assert.equal(settings.reviewMaxTurns, 12);
	assert.deepEqual(settings.protectedSkills, ["create-skill"]);
	assert.equal(settings.settingsError, undefined);
});

test("out-of-range limits fall back, unparseable file reports why", () => {
	const outOfRange = readSettingsFrom(JSON.stringify({ "pi-reflect": { reviewTimeoutMs: 999_999_999 } }));
	assert.equal(outOfRange.reviewTimeoutMs, 180_000);

	const broken = readSettingsFrom('{"pi-reflect": { "mode": "batch"');
	assert.equal(broken.reviewTimeoutMs, 180_000, "defaults apply");
	// The file asked for `batch`; seeing `session` proves nothing from the
	// broken file was honoured, rather than a partial read succeeding silently.
	assert.equal(broken.mode, "session", "the unparseable file's values are not honoured");
	assert.match(String(broken.settingsError), /JSON|Unexpected|end of JSON/i);
});
