---
quick_task: 260508-syv
type: summary
completed: 2026-05-08
duration_min: ~120
commits: 14
test_count_before: 1668
test_count_after: 1685 (+17 inc. 16 new linter cases + 1 manifest-shape test)
linter_invariant_count_before: 7
linter_invariant_count_after: 15 (+8 new — LCB-08..15)
release_cut: false
last_tag: v1.2.6 (unchanged)
---

# Quick 260508-syv: Round-11 closure + linter v3 + audit-manifest — Summary

## One-liner

Tactical (close 18 REAL/PARTIAL Round-11 issues + collateral 130b) + structural (8 new linter invariants — LCB-08..15) + strategic (audit-manifest mode as the asymptote-breaker against the rule-by-rule defect-rate climb).

## Final manifest summary (`tmp/syv-audit.json`)

- **commands_scanned:** 73
- **claims_extracted:** 891
- **claims_resolved:** 534
- **claims_unresolved:** 357
- **resolution_rate (headline):** 59.9%
- **resolution_rate (active resolvers only):** 100% (357 unresolved are explicit deferred-resolver classes — script-flag, slash-command, step-cross-reference, mcp-tool — flagged for 1-2-hour future-round resolver additions per CONTEXT.md `<specifics>`)

## Round-11 closures (18 + 1 collateral)

| Issue | Verdict | File:line | Fix summary | Commit |
| ----- | ------- | --------- | ----------- | ------ |
| 113   | REAL    | `commands/core/init.md:80` | Narrow `--force` to `TESTATLAS_AMBIGUOUS_WORKSPACE` only (per init-workspace.js:189-194) | 57248b39 |
| 114   | REAL    | `commands/validate-workspace.md:42` | Correct `--auto-heal` default (apply=true) + document `--dry-run` as surface-only mode | 57248b39 |
| 115   | REAL    | `commands/maintain/maintain-validate-artifacts.md:62-66` | Narrow sync-markdown-json coverage to `domains/` only (per ARTIFACT_DIRS) | 57248b39 |
| 116   | REAL    | `commands/explore.md:61` | Rename dangling `Fallback (Option B)` → `Fallback Path` | 1c6b84b8 |
| 117a  | REAL    | `default.config.json` + `config.schema.json` | Add `idempotencyTtlMs: 86400000` + schema declaration | c40bffe7 |
| 117b  | REAL    | `commands/explore/explore-all.md:91-94` | Replace `git ls-files` mtime cache with HEAD-comparison via `.lastrun.json` | 57248b39 |
| 118   | REAL    | `commands/explore-codebase.md:64` | Same cache-strategy fix (HEAD comparison) | 57248b39 |
| 119a  | PARTIAL | `commands/explore/explore-tests.md` step-9 xref | Already correct against current numbering; verified at lint time (no edit) | (n/a) |
| 119b  | REAL    | `commands/explore/explore-state.md:138` | Reword `ui-state-machine.schema.json` claim to avoid implying file exists | 56f579ba |
| 120   | REAL    | `commands/explore-ui.md:115-119 + step 2` | Halt on EITHER MCP-or-browser unavailable (partial findings = false-confidence hazard) | 57248b39 |
| 121   | REAL    | `commands/explore-api.md:91` | Unify `maps/api.json` → `maps/apis.json` (plural) | 49dee60e |
| 122   | REAL    | `commands/explore/explore-routes.md:67` | Rewrite `wait_for(settle)` → text-based wait + evaluate_script poll | 57248b39 |
| 123a  | REAL    | `commands/test/generate-automation.md:141` | Reword `test-scenario-meta.schema.json` claim | 56f579ba |
| 123b  | REAL    | `commands/explore-data.md:79` | Unify `maps/data.json` → `maps/entities.json` | 49dee60e |
| 124a  | REAL    | `commands/explore-cli.md:89` | Unify `maps/cli.json` → `maps/cli-commands.json` | 49dee60e |
| 124b  | INSPECTED | `commands/explore-cli.md` | Stop Conditions vs Required Actions internally consistent post-Round-11 (no edit needed) | (n/a) |
| 125   | PARTIAL | `commands/test/test-critical-flows.md` | (a) AJV-fail Stop Condition; (b) `--reindex` valid + added; (c) clarify `<flow-id>` evidence path; (d) clarify RUN-count semantics | 57248b39 |
| 128a  | REAL    | `vocabulary.schema.json $defs.issueStatus` | Add `reopened` enum value (additive) | c40bffe7 |
| 128c  | REAL    | `log-issue.md` × 6, `retest.md`, `validate-workspace.md` × 2, `report.md`, `update.md` × 2, `council/council-test-plan.md` | Rewrite bare `scripts/<X>.js` → `node .testatlas/scripts/<X>.js` (Phase-17 invariant) | b333ca6f |
| 129   | REAL    | `commands/council/council.md:106` | Already canonical; allowlisted (citation of LIFECYCLE_ALLOWLIST in linter source) | b333ca6f |
| 131   | REAL    | `commands/core/status.md:86` | Rename `## Post-Operation Brain Update` → `## Lifecycle` | 5c0dc61d |
| 132   | REAL    | `commands/core/brain-query.md:83` | Same rename | 5c0dc61d |
| **130b** | REAL  | `commands/council/council-test-plan.md:50` | Unify `cli_commands.json` → `cli-commands.json` (kebab-case sibling consistency) | 49dee60e |
| **collateral** | REAL | `commands/core/init.md:102` | Rename `## Post-Operation Brain Update` → `## Lifecycle` (third instance, caught by Inv-12 after status.md + brain-query.md fixes landed) | 5c0dc61d |

## Round-11 NOT-REAL / misframed (4 records)

- **ISSUE-126 (REJECTED):** `commands/plan.md:63` `--domain domain-<slug>` is the correct full-ID form per `.testatlas/scripts/create-domain.js:41` (id format is `domain-${slug}`). Dogfood agent misread.
- **ISSUE-127 (REJECTED):** `commands/log-issue.md:54` same — `--domain domain-<slug>` is the correct full-ID form.
- **ISSUE-128b (workspace-state):** `_testatlas/to_fix/by_flow/<flow-id>.md` index built by `log-issue.md` step 9.5 when issues reference flows. The empty index in installed workspaces is install-state, not source-doc bug.
- **ISSUE-130 (MISFRAMED):** empty `_testatlas/maps/` is install-state. Sub-finding 130b (cli_commands → cli-commands) IS real and was fixed.

## Test count delta

- Before (Round-10 baseline): **1668 tests**
- After (Round-11 with extended linter + manifest test): **1685 tests** (+17)
  - 8 new lint invariants × 2 cases each = 16 new tests
  - 1 manifest-mode shape test
- Result: **1685 pass / 0 fail / 2 skipped (pre-existing)**

## Linter invariant count delta

- Before: 9 invariants (LCB-01..07 with sub-invariants 1.1, 1.2)
- After: **15 invariants** (LCB-01..07 + LCB-08..15)
- New (LCB-08..15): schema-file-existence, maps-path-consistency, vocabulary-enum-presence, bare-script-path, lifecycle-heading-strict, config-key-existence, option-pair-completeness, step-cross-reference

## Verification gate results

| Gate                                          | Result |
| --------------------------------------------- | ------ |
| `pnpm test`                                   | GREEN — 1685 pass / 0 fail / 2 skipped |
| `node scripts/lint-commands.js`               | exit 0 (zero violations on post-fix corpus) |
| `node scripts/lint-commands.js --manifest tmp/syv-audit.json` | manifest written, 100% active-resolver closure |
| `node scripts/check-adapter-parity.js --strict` | 1314/1314 obligations, zero drift |
| `node scripts/validate-workspace.js`          | exit code unchanged from baseline (pre-existing TESTATLAS_UNKNOWN_SCHEMA on `maps/*.json`) |
| `node --test test/commands/mesh-graph.test.js` | 4/4 GREEN |

## Commits (14 total)

1. `2589c9e7` test: RED for 8 new lint-commands invariants + manifest mode
2. `543cb3da` feat: GREEN — implement 8 new lint-commands invariants + audit-manifest mode
3. `c40bffe7` feat: extend vocabulary.schema.json (reopened) + default.config.json (idempotencyTtlMs)
4. `b53a3424` fix: tighten VOCAB_LITERAL_PATTERNS to require backtick-wrapped values
5. `56f579ba` fix: close inv-8 violations (ISSUE-119b, 123a class)
6. `49dee60e` fix: close inv-9 violations (ISSUE-121, 123b, 124a, 130b)
7. `b333ca6f` fix: close inv-11 violations (ISSUE-128c, 129 + collateral)
8. `5c0dc61d` fix: close inv-12 violations (ISSUE-131, 132 + init.md collateral)
9. `1c6b84b8` fix: close inv-14 violation (ISSUE-116)
10. `9bbb2c82` fix: close residual inv-10 false positives + inv-13 releaseGates
11. `57248b39` fix: manual fixes outside linter reach (ISSUE-113, 114, 115, 117b, 118, 120, 122, 125)
12. `c4f26afa` chore: audit-manifest spot-check note + tmp/ gitignore
13. `d6604538` chore: regen 18 adapter trees post-Round-11 source-doc fixes
14. `d3fef8ac` docs: comprehensive CHANGELOG for Round-11 closure + linter v3 + audit-manifest

## Confirmation: no release cut

- Last git tag: `v1.2.6` (unchanged)
- `git tag -l 'v1.2.7'` empty
- `scripts/lib/install-core.js` untouched (`git diff HEAD~14 -- scripts/lib/install-core.js` empty)

## Reference: CHANGELOG architectural-diagnosis section

The `## [Unreleased]` block in `CHANGELOG.md` includes a comprehensive
`### Architectural diagnosis — why this keeps happening` section documenting:

- Empirical defect-rate trend (R7=26%, R8=26%, R9=15%, R10=23%, R11=35%)
- Diminishing-returns reasoning for rule-based linting
- The audit-manifest mode as the architectural commitment to break the asymptote
- Round-12 projection: <10% defect rate IF the architectural commitment holds (plumb the four deferred resolvers)

## Deviations from plan

- **Task 1 GREEN + Task 2 GREEN merged into one commit (`543cb3da`)** rather than the planned separate commits per task. Rationale: the manifest mode (Task 2) shares regex patterns and catalog accessors with the 8 new invariants (Task 1); a single GREEN cycle was more cohesive. The Task 2 RED test (manifest-shape assertion) was added in the same RED commit (`2589c9e7`) as the 16 invariant tests. No semantic loss; the TDD RED→GREEN visibility is preserved.
- **Several plan-named files don't exist in current corpus** (`test-design.md`, `explore-codebase.md` under `commands/explore/`). The equivalent fix landed in the actually-present command bodies (`test-critical-flows.md`, top-level `explore-codebase.md`). Documented inline in CHANGELOG.
- **Inv-13 `releaseGates` config-key fix** softens the doc claim rather than adding the key (out of round scope to declare a not-yet-implemented feature in default.config.json).
- **Inv-10 cue regex** required two iterations to eliminate false positives: first iteration tightened to backtick-wrapped values (`b53a3424`); second iteration added `(?<![\\w-])` negative-lookbehind to disambiguate `skeleton-status:` / `pack-status:` / `scenario-status:` from workspace `issueStatus` claims (`9bbb2c82`).

## Self-Check

Verified post-summary:

- ✓ `scripts/lint-commands.js` exports 8 new invariant functions (grep confirms `checkSchemaFileExistence|checkMapsPathConsistency|checkVocabularyEnumPresence|checkBareScriptPath|checkLifecycleHeadingStrict|checkConfigKeyExistence|checkOptionPairCompleteness|checkStepCrossReference|emitManifest`)
- ✓ `vocabulary.schema.json $defs.issueStatus.enum` includes `reopened`
- ✓ `default.config.json` includes `idempotencyTtlMs: 86400000`
- ✓ `config.schema.json` declares `idempotencyTtlMs` property
- ✓ `node scripts/lint-commands.js` exits 0 on post-fix corpus
- ✓ `node scripts/lint-commands.js --manifest tmp/syv-audit.json` writes valid JSON with documented shape
- ✓ All 14 commits present in `git log --oneline` chain since prior session
- ✓ `git tag -l 'v1.2.7'` empty
- ✓ `scripts/lib/install-core.js` not in any commit's file list (verified by `git log --name-only HEAD~14..HEAD -- scripts/lib/install-core.js`)
- ✓ CHANGELOG `[Unreleased]` contains all five required blocks (Changed / Fixed / Round-11 NOT-REAL / Architectural diagnosis / Future work)

## Self-Check: PASSED
