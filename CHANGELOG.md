# Changelog

All notable changes to `pi-reflect` are documented here. Patch entries are
small bugfixes; minor entries change behavior in user-visible ways.

## [0.1.2] — 2026-10-20

### Added

- **`reviewTimeoutMs` and `reviewMaxTurns`.** The reviewer's two resource limits
  were hard-coded at 60 s and 16 turns. Audited against real sessions, the wall
  sat barely above the median completing run (43.8 s): 22 of 29 reviews were
  killed mid-flight, and 11 of those truncated runs never wrote `pi_journal` or
  `vault_daily` — the surfaces the prompt calls the primary session record. Both
  limits are now settings, defaulted to **180 s and 48 turns** for a six-surface
  reviewer. Out-of-range values fall back to the default rather than disabling
  the reviewer.
- **Run attribution.** `log.jsonl` entries carry `truncatedReason`
  (`"timeout"` \| `"turns"` \| `"both"`), `turns`, and `memoryBytes`
  (`{from, to}` when the run wrote `memory.md`). `truncated: true` alone could
  not distinguish a reviewer that needed more clock from one that kept chaining
  tool calls, which is how the 60 s wall went unnoticed for so long.
  `/reflect status` shows the active limits, and a memory write now reports its
  byte delta in the notification (`Memory updated (2708 → 2894 B)`).
- **`memory` and `memoryGuidance`, merged from `fork/memory-gate`.** The memory
  surface can be switched off end to end (injection, tool registration, reviewer
  access), and `memoryGuidance` puts a user-authored memory policy in the
  reviewer prompt without anyone editing TypeScript. Defaults are unchanged
  (`true` / `""`), so merging armed nothing.

### Fixed

- **A `settings.json` that would not parse silently ran on defaults**, which
  makes a dead setting look exactly like an applied one. Defaults are still used
  — they are the safe answer — but the reason is kept and `/reflect status`
  reports it as `settings.json: UNREADABLE (…)`.
- **Settings documentation drift.** The documented `mode` values and the
  `log.jsonl` `mode`/`trigger` field values listed `"turn"` and `"turn_end"`,
  which the code does not emit; the example config carried a `turnInterval` key
  that has never been read. Corrected to match `settings.ts` and `audit.ts`, and
  the reviewer's tool count in "How reviews work" said two tools where the
  prompt offers six.

## [0.1.1] — 2026-06-02

### Fixed

- **`vault_daily` and `vault_pending` now date files in the host's local
  timezone, not UTC.** Both tools previously called
  `new Date().toISOString().slice(0, 10)`, which is always UTC. Any session
  run past ~6–7pm local time (depending on DST/offset) would write a
  "tomorrow" file: e.g. a `Daily/2026-06-03.md` file created at 21:54 CDT
  on 2026-06-02. This directly violated the vault root `CLAUDE.md` rule
  *"Do NOT create future-dated Daily files proactively"* and produced
  internally inconsistent session blocks (UTC date in filename, local time
  in `### Session — HH:MM` header). Both tools now use a shared
  `lib/dates.ts#localDateStr()` helper that reads `Date#getFullYear` /
  `getMonth` / `getDate` from the host clock.

  Full ISO timestamps used as cross-machine records (`pi-journal` entries,
  the `proposed:` frontmatter inside pending items) remain UTC. Only
  filenames and other "today by the user's clock" surfaces moved to local.

## [0.1.0]

Initial release.
