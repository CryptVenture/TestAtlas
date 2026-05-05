// scripts/lib/emitter.js
//
// Plan 05-01: shared emit() helper consumed by the 4 Phase-5 create-* scripts
// (create-issue, create-flow, create-domain, create-evidence-record). Without
// this helper each emitter would repeat ~150 LOC of "load schemas, build
// record, validate, render markdown, atomic-write both files" boilerplate.
//
// Contract (locked):
//   emit({
//     schemaId,            // e.g. 'https://testatlas.dev/schemas/v1/issue.schema.json'
//     templateMdPath,      // path RELATIVE to cwd (e.g. '.testatlas/templates/issues/ISSUE.md')
//     targetDir,           // path RELATIVE to wsDir (e.g. 'to_fix' or 'domains/<slug>')
//     filenameMd,          // (record) => string  — e.g. r => `ISSUE-${r.id}-${r.slug}.md`
//     filenameJson,        // (record) => string
//     record,              // the populated record object
//     substitutions,       // optional Record<string,string> for {{key}} replacements
//                          // (defaults to flattened scalar fields of `record`)
//     cwd, workspaceDir, dryRun,
//   }, _inject?)
//
// Behavior:
//   1. assertNotUpdate('command') is called FIRST (before any I/O).
//   2. Schemas are loaded via loadAllSchemas({cwd}); the named schemaId MUST
//      already be registered (else throw TESTATLAS_UNKNOWN_SCHEMA).
//   3. The record is AJV-validated. On failure: throw Error with
//      code='TESTATLAS_INVALID_RECORD' and `.validationErrors` attached.
//      VALIDATE BEFORE WRITE — never partial-write a bad record.
//   4. The markdown template is read and {{key}} substitutions applied.
//   5. If dryRun is FALSE: atomic-write both .md and .json files.
//      If dryRun is TRUE:  no I/O occurs; emit() still returns the intended
//      paths so callers can log them.
//
// Ownership: Plan 05-01 owns this file. Plans 05-02..05-05 do NOT modify it.
//
// Phase 10 Plan 01: `applyTemplate` and `flattenSubstitutions` are additionally
// exposed as named exports so the regression suite can pin the
// drop-line-on-missing rendering contract introduced in Plan 10-01 directly.
// The public `emit()` contract is unchanged.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './atomic-write.js';
import { loadAllSchemas } from './schema-loader.js';
import { assertNotUpdate } from './workspace-guard.js';

/**
 * Flatten a record into a `{{key}}` substitution map. Only scalar (string,
 * number, boolean) fields are taken — arrays and objects are skipped (callers
 * who want array rendering pass an explicit `substitutions` arg).
 */
export function flattenSubstitutions(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Apply `{{key}}` substitution in `template` using `subs`. Unknown keys are
 * left in place (so emitters can leave optional placeholders unbound without
 * the template becoming visibly broken).
 */
export function applyTemplate(template, subs) {
  return template.replace(/\{\{\s*([a-zA-Z_$][\w-]*)\s*\}\}/g, (_, key) =>
    Object.hasOwn(subs, key) ? subs[key] : `{{${key}}}`,
  );
}

/**
 * @param {{
 *   schemaId: string,
 *   templateMdPath: string,
 *   targetDir: string,
 *   filenameMd: (record: object) => string,
 *   filenameJson: (record: object) => string,
 *   record: object,
 *   substitutions?: Record<string,string>,
 *   cwd: string,
 *   workspaceDir: string,
 *   dryRun?: boolean,
 * }} args
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   atomicWrite?: typeof atomicWrite,
 *   loadAllSchemas?: typeof loadAllSchemas,
 * }} [_inject] @internal — test-only DI.
 * @returns {Promise<{mdPath: string, jsonPath: string, validated: true}>}
 */
export async function emit(
  {
    schemaId,
    templateMdPath,
    targetDir,
    filenameMd,
    filenameJson,
    record,
    substitutions,
    cwd,
    workspaceDir,
    dryRun = false,
  },
  _inject = {},
) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _loadAllSchemas = _inject.loadAllSchemas ?? loadAllSchemas;
  _assertNotUpdate('command');

  if (!schemaId) {
    const e = new Error('emit: schemaId is required');
    e.code = 'TESTATLAS_INVALID_ARGS';
    throw e;
  }
  if (!cwd || !workspaceDir) {
    const e = new Error('emit: cwd and workspaceDir are required');
    e.code = 'TESTATLAS_INVALID_ARGS';
    throw e;
  }

  const ajv = await _loadAllSchemas({ cwd });
  const validator = ajv.getSchema(schemaId);
  if (!validator) {
    const e = new Error(`emit: schema not found: ${schemaId}`);
    e.code = 'TESTATLAS_UNKNOWN_SCHEMA';
    throw e;
  }

  if (!validator(record)) {
    const e = new Error(`emit: record failed schema validation for ${schemaId}`);
    e.code = 'TESTATLAS_INVALID_RECORD';
    e.validationErrors = validator.errors;
    throw e;
  }

  const mdName = filenameMd(record);
  const jsonName = filenameJson(record);
  const mdPath = path.join(workspaceDir, targetDir, mdName);
  const jsonPath = path.join(workspaceDir, targetDir, jsonName);

  if (!dryRun) {
    const mdTemplate = await readFile(path.join(cwd, templateMdPath), 'utf8');
    const subs = substitutions ?? flattenSubstitutions(record);
    const mdText = applyTemplate(mdTemplate, subs);
    await _atomicWrite(mdPath, mdText);
    await _atomicWrite(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  }

  return { mdPath, jsonPath, validated: true };
}
