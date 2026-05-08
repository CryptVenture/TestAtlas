// scripts/lib/script-flag-metadata.js
//
// Quick 260508-rqx. Explicit catalog of (a) required CLI flags and
// (b) enum-flag values for each TestAtlas accelerator script, used by
// scripts/lint-commands.js sub-invariants 1.1 (flag-completeness) and
// 1.2 (enum-value-validity).
//
// Single source of truth for "what does this script REQUIRE?" — easier to
// maintain than re-parsing scripts every linter run. Add an entry whenever
// a script gains a required flag or a new enum-flag.
//
// REQUIRED_FLAGS: <scriptBasename>: string[] of '--flag' tokens that the
//   script's argv handler treats as required (throws on absence).
//
// ENUM_FLAGS:    <scriptBasename>: { '--flag': string[] of allowed enum
//   literal values per the script's argv handler }.

export const REQUIRED_FLAGS = {
  // Source of truth: scripts/update-brain-after-command.js lines 47-53 throw
  // TESTATLAS_INVALID_ARGS when --command, --actor, or --summary is absent.
  'update-brain-after-command.js': ['--command', '--actor', '--summary'],
};

export const ENUM_FLAGS = {
  // Source of truth: scripts/update-brain-after-command.js status enum is
  // {completed, aborted, in_progress} per the typeFor map (lines 60-64).
  'update-brain-after-command.js': {
    '--status': ['completed', 'aborted', 'in_progress'],
  },
};
