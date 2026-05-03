// scripts/lib/validate/check-schemas.js
//
// PRD §33 condition 2: every JSON artifact in the workspace validates against
// its declared schema. Plan 05-02 (Wave 1).
//
// Findings:
//   TESTATLAS_JSON_PARSE_ERROR    — JSON file failed to parse (severity error)
//   TESTATLAS_UNKNOWN_SCHEMA      — schemaId could not be inferred (severity error)
//   TESTATLAS_SCHEMA_VIOLATION    — AJV reported violations (severity error)
//
// All findings are fixable=null (NEVER auto-heal — could be in-progress edits).
// Pitfall 4 honored: this module receives ctx.ajv from the orchestrator and
// MUST NOT instantiate its own Ajv.

import path from 'node:path';
import { formatErrors } from '../ajv-instance.js';

export const id = 'check-schemas';
export const prdRule = 2;

const SCHEMA_BASE = 'https://testatlas.dev/schemas/v1';

/**
 * Infer the schema $id for a given JSON file. Strategy:
 *   1. If the parsed object has a `$schema` field, trust that.
 *   2. Otherwise, infer from path patterns relative to the workspace dir.
 * Returns null if no rule matched (the orchestrator surfaces this as
 * TESTATLAS_UNKNOWN_SCHEMA — a user-visible signal that the file is in
 * an unrecognized location).
 *
 * @param {string} absPath
 * @param {object|null} parsed
 * @param {string} wsDir
 * @returns {string | null}
 */
function inferSchemaId(absPath, parsed, wsDir) {
  if (parsed && typeof parsed.$schema === 'string') {
    return parsed.$schema;
  }
  const relPath = path.relative(wsDir, absPath).split(path.sep).join('/');
  const baseName = path.basename(absPath);

  // Top-level canonical JSON.
  if (relPath === '11_workspace_manifest.json')
    return `${SCHEMA_BASE}/workspace-manifest.schema.json`;
  if (relPath === '12_app_map.json') return `${SCHEMA_BASE}/app-map.schema.json`;

  // to_fix/ISSUE-*.json
  if (relPath.startsWith('to_fix/') && /^ISSUE-/.test(baseName))
    return `${SCHEMA_BASE}/issue.schema.json`;

  // flows/FLOW-*.json
  if (relPath.startsWith('flows/') && /^FLOW-/.test(baseName))
    return `${SCHEMA_BASE}/flow.schema.json`;

  // domains/<slug>/domain.json
  if (relPath.startsWith('domains/') && baseName === 'domain.json')
    return `${SCHEMA_BASE}/domain.schema.json`;

  // evidence/<id>/evidence.json
  if (relPath.startsWith('evidence/') && baseName === 'evidence.json')
    return `${SCHEMA_BASE}/evidence.schema.json`;

  // tests/runs/RUN-*.json
  if (relPath.startsWith('tests/runs/') && /^RUN-/.test(baseName))
    return `${SCHEMA_BASE}/test-run.schema.json`;

  // tests/scenarios/TEST-*.json
  if (relPath.startsWith('tests/scenarios/') && /^TEST-/.test(baseName))
    return `${SCHEMA_BASE}/test-scenario.schema.json`;

  // reports/REPORT-*.json
  if (relPath.startsWith('reports/') && /^REPORT-/.test(baseName))
    return `${SCHEMA_BASE}/report.schema.json`;

  // No mapping — caller surfaces as TESTATLAS_UNKNOWN_SCHEMA.
  return null;
}

/**
 * @param {{wsDir: string, ajv: object, files: {allJsonFiles: Array<{path:string, parsed:object|null, parseError:Error|null}>}}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:'pass'|'fail', findings:object[]}>}
 */
export async function check(ctx) {
  const findings = [];
  const { wsDir, ajv, files } = ctx;

  for (const f of files.allJsonFiles) {
    const relPath = path.relative(wsDir, f.path);

    // Parse error → JSON-parse-error finding; skip schema validation.
    if (f.parseError) {
      findings.push({
        severity: 'error',
        path: relPath,
        code: 'TESTATLAS_JSON_PARSE_ERROR',
        message: `Could not parse JSON: ${f.parseError.message}`,
        fixable: null,
      });
      continue;
    }

    // Skip files outside the workspace tree somehow; defensive.
    if (!f.parsed || typeof f.parsed !== 'object') continue;

    const schemaId = inferSchemaId(f.path, f.parsed, wsDir);
    if (!schemaId) {
      findings.push({
        severity: 'error',
        path: relPath,
        code: 'TESTATLAS_UNKNOWN_SCHEMA',
        message: `Cannot infer schema for ${relPath} (no $schema field and no directory-mapping rule)`,
        fixable: null,
      });
      continue;
    }

    const validator = ajv.getSchema(schemaId);
    if (!validator) {
      findings.push({
        severity: 'error',
        path: relPath,
        code: 'TESTATLAS_UNKNOWN_SCHEMA',
        message: `Schema ${schemaId} is not registered with the AJV singleton`,
        fixable: null,
      });
      continue;
    }

    const valid = validator(f.parsed);
    if (!valid) {
      const lines = formatErrors(validator.errors, relPath);
      findings.push({
        severity: 'error',
        path: relPath,
        code: 'TESTATLAS_SCHEMA_VIOLATION',
        message: `Schema validation failed: ${lines.join('; ')}`,
        fixable: null,
      });
    }
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
