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
 * Returns true for raw evidence dumps. The ONLY schema-bound JSON file under
 * an evidence directory is the canonical sidecar `evidence/EVIDENCE-<id>(-<slug>)?/evidence.json`.
 * Every other JSON file under `evidence/` is a raw dump — could be an HTTP
 * response (with HTTP_CODE: prefix), a concatenated multi-object dump, plain
 * text masquerading as .json, etc. — and must be skipped without parsing.
 *
 * Distinguishing rules (F-7 + Quick 260506-rd2):
 *
 *   1. `evidence/<non-EVIDENCE-seg>/<seg2>/...` (4+ parts, first seg NOT
 *      EVIDENCE-NNN) → legacy raw-dump shape from `explore-codebase` and
 *      friends. (F-7 / Quick 260505-ge3.)
 *   2. `evidence/EVIDENCE-<id>(-<slug>)?/<basename>` where basename is
 *      anything OTHER than `evidence.json` → raw dump promoted by HEAL-05
 *      or written by `create-evidence-record.js` alongside the sidecar.
 *      (Quick 260506-rd2.)
 *   3. `evidence/EVIDENCE-<id>(-<slug>)?/<subdir>/<file>` (4+ parts under
 *      an EVIDENCE-NNN dir) → nested raw dump (e.g. screenshots/foo.png
 *      tree) → raw dump regardless of basename.
 *
 * `evidence.json` at depth 3 inside an EVIDENCE-NNN dir is the only
 * exception — it remains schema-bound.
 *
 * @param {string} relPath  Workspace-relative POSIX path
 * @returns {boolean}
 */
function isRawEvidenceDump(relPath) {
  if (!relPath.startsWith('evidence/')) return false;
  const parts = relPath.split('/');
  if (parts.length < 3) return false;
  const firstSeg = parts[1];
  const baseName = parts[parts.length - 1];

  // EVIDENCE-NNN dir → only `evidence.json` is schema-bound; everything
  // else (siblings + nested files) is a raw dump.
  if (/^EVIDENCE-\d{3,}/.test(firstSeg)) {
    return baseName !== 'evidence.json';
  }

  // Non-EVIDENCE prefix dir (e.g. evidence/explore-codebase/<ts>/foo.json)
  // → raw dump if depth ≥ 4 (legacy F-7 rule unchanged).
  return parts.length >= 4;
}

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

  // tests/matrix.json
  if (relPath === 'tests/matrix.json') return `${SCHEMA_BASE}/matrix.schema.json`;

  // reports/REPORT-*.json
  if (relPath.startsWith('reports/') && /^REPORT-/.test(baseName))
    return `${SCHEMA_BASE}/report.schema.json`;

  // V2: brain/*.json — skip skeleton/index files that lack $schema or have
  // array wrappers rather than single-record shape. Wave 0 scaffolding only.
  if (relPath.startsWith('brain/') && baseName.endsWith('.json')) {
    if (parsed && typeof parsed.$schema === 'string') {
      return parsed.$schema;
    }
    // No $schema and no path rule → skip silently (not an error for V2 stubs).
    return '__SKIP__';
  }

  // V2: agents/registry.json — skip until dedicated schema exists.
  if (relPath === 'agents/registry.json') {
    return '__SKIP__';
  }

  // V2: agents/personas/{system,generated,project}/*.json → persona.schema.json (V2).
  // Closes 14 of the deferred-items.md baseline TESTATLAS_UNKNOWN_SCHEMA errors.
  if (
    /^agents\/personas\/(system|generated|project)\/[^/]+\.json$/.test(relPath) &&
    baseName.endsWith('.json')
  ) {
    return `https://testatlas.dev/schemas/v2/persona.schema.json`;
  }

  // V2: agents/councils/sessions/<id>/*.json — session sub-artifacts (session.json,
  // participants.json, consolidation.json, votes.json). Heterogeneous shapes
  // emitted by create-council-session.js + consolidate-council.js; each is
  // schema-flexible by design (mirrors brain/ skeleton stubs). Skip until each
  // sub-artifact gets a dedicated schema or carries an explicit `$schema` field.
  if (/^agents\/councils\/sessions\//.test(relPath) && baseName.endsWith('.json')) {
    return '__SKIP__';
  }

  // V2: agents/councils/council_templates/*.json — reusable mode presets
  // (brain-audit, bug-triage, domain-review, red-team, release-readiness).
  // Heterogeneous; skip until a dedicated council-template.schema.json lands.
  if (/^agents\/councils\/council_templates\//.test(relPath) && baseName.endsWith('.json')) {
    return '__SKIP__';
  }

  // V2: maps/<feature>.json — schema-flexible explorer-output sidecars per
  // bootstrap.md §2 ("write a per-feature sidecar at `_testatlas/maps/<feature>.json`
  // rather than inventing new keys on `12_app_map.json`"). Heterogeneous by
  // design; the closed app-map schema is the canonical contract, the maps/
  // sidecars preserve cross-explorer mesh without breaking it.
  if (relPath.startsWith('maps/') && baseName.endsWith('.json')) {
    return '__SKIP__';
  }

  // V2: reports/dashboard-data.json — heterogeneous machine-readable export
  // (PRD §16) shaped for downstream UIs / CI status pages, not a single-record
  // schema artifact. Skip until a dedicated dashboard-data.schema.json lands.
  if (relPath === 'reports/dashboard-data.json') {
    return '__SKIP__';
  }

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

    // F-7 (Quick 260505-ge3): raw evidence captures under
    // `evidence/<command>/<timestamp>/*.json` are NOT schema-bound. Skip
    // them silently — no finding emitted (not even TESTATLAS_JSON_PARSE_ERROR;
    // a malformed raw dump is a non-finding by contract).
    const relPathPosix = relPath.split(path.sep).join('/');
    if (isRawEvidenceDump(relPathPosix)) {
      continue;
    }

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
    if (schemaId === '__SKIP__') {
      continue;
    }
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
