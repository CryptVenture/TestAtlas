// scripts/validate-handoff.js
//
// AJV2020 + ajv-formats handoff JSON sidecar validator. Built atop the
// suite-canonical singleton (`scripts/lib/ajv-instance.js`) and the
// schema-loader registry (`scripts/lib/schema-loader.js`) — never instantiates
// AJV directly. Closes Phase 18 sub-finding #4 (deferred): /atlas:handoff was
// reporting "partial" because the dogfood agent set up AJV inline with the
// default `Ajv` class (draft-07) and hit the expected mismatch against the
// draft-2020-12 sub-agent-handoff schema. The defect is a missing accelerator,
// not a defective validator.
//
// CLI shape (consistent with sibling validators):
//   node scripts/validate-handoff.js <handoff-json-path> [--workspace <p>] [--cwd <p>]
//
// Exit codes:
//   0 — handoff JSON validates against sub-agent-handoff.schema.json
//   1 — invalid handoff (AJV errors surfaced verbatim) OR schema-load failure
//       (TESTATLAS_SCHEMAS_DIR_MISSING from schema-loader)
//   2 — argv parse error (unknown flag, missing required <handoff-json-path>)
//
// Programmatic export: `validateHandoff(path, opts)` returns
//   { valid, errors, handoffPath } so test harnesses can call it directly.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatErrors } from './lib/ajv-instance.js';
import { isMainModule } from './lib/is-main.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const HANDOFF_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/sub-agent-handoff.schema.json';

/**
 * Validates a handoff JSON sidecar against sub-agent-handoff.schema.json.
 *
 * @param {string} handoffPath - absolute or cwd-relative path to handoff JSON
 * @param {{ cwd?: string, workspaceDir?: string }} [opts]
 * @returns {Promise<{ valid: boolean, errors: import('ajv').ErrorObject[], handoffPath: string }>}
 */
export async function validateHandoff(handoffPath, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const ajv = await loadAllSchemas({ cwd });
  const validator = ajv.getSchema(HANDOFF_SCHEMA_ID);
  if (!validator) {
    const e = new Error(`schema not registered: ${HANDOFF_SCHEMA_ID}`);
    e.code = 'TESTATLAS_HANDOFF_SCHEMA_NOT_REGISTERED';
    throw e;
  }
  const absPath = path.isAbsolute(handoffPath) ? handoffPath : path.resolve(cwd, handoffPath);
  const text = await readFile(absPath, 'utf8');
  const data = JSON.parse(text);
  const valid = validator(data);
  return { valid: !!valid, errors: validator.errors ?? [], handoffPath: absPath };
}

if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}

/**
 * @param {string[]} argv
 */
async function runCli(argv) {
  const opts = {};
  let handoffPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') {
      opts.cwd = argv[++i];
    } else if (a === '--workspace') {
      opts.workspaceDir = argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage: node scripts/validate-handoff.js <handoff-json-path> [--cwd <p>] [--workspace <p>]',
          '',
          'Validates a handoff JSON sidecar against sub-agent-handoff.schema.json.',
          'Exits 0 on valid, 1 on invalid or schema-load failure, 2 on argv error.',
          '',
          'Options:',
          '  --cwd <path>        Working directory (default: process.cwd())',
          '  --workspace <path>  Workspace dir (forwarded for parity with sibling validators)',
          '  --help, -h          Show this message',
        ].join('\n'),
      );
      process.exit(0);
    } else if (!handoffPath && !a.startsWith('--')) {
      handoffPath = a;
    } else {
      console.error(`validate-handoff: unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!handoffPath) {
    console.error('validate-handoff: missing required <handoff-json-path> argument');
    console.error(
      'Usage: node scripts/validate-handoff.js <handoff-json-path> [--cwd <p>] [--workspace <p>]',
    );
    process.exit(2);
  }
  try {
    const r = await validateHandoff(handoffPath, opts);
    if (r.valid) {
      console.log(`OK ${r.handoffPath}`);
      process.exit(0);
    }
    for (const line of formatErrors(r.errors, r.handoffPath)) {
      console.error(line);
    }
    process.exit(1);
  } catch (err) {
    if (err.code === 'TESTATLAS_SCHEMAS_DIR_MISSING') {
      console.error(`validate-handoff: TESTATLAS_SCHEMAS_DIR_MISSING — ${err.message}`);
      process.exit(1);
    }
    console.error(`validate-handoff: ${err.message}`);
    process.exit(1);
  }
}
