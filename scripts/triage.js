// scripts/triage.js
//
// Quick 260506-esm. Accelerator for /atlas:triage — parallels create-issue.js
// and generate-report.js. Loads every `<wsDir>/to_fix/ISSUE-*.json`, applies
// triage discipline, AJV-validates every mutated record BEFORE write, and
// emits triage-report-<ts>.md, blockers.md, groups.md alongside refreshed
// cross-cut indexes.
//
// What it does (PRD §17 + .testatlas/commands/triage.md):
//
//   1. Load every to_fix/ISSUE-*.json. Halt on parse error.
//   2. Verify each issue's evidence[] paths resolve under <wsDir>/evidence/.
//      Any issue with one or more missing evidence references is downgraded
//      to confidence:needs-validation and surfaced in the triage report.
//   3. Detect duplicate-candidate groups via 3 heuristics:
//        a) exact title match (case-insensitive, whitespace-collapsed)
//        b) same domain + same flow + Levenshtein-ratio ≥ 0.8 across
//           reproductionSteps
//        c) shared evidence reference
//      Any pair linked by ≥1 heuristic lands in the same group.
//   4. Apply explicit --severity-override <ISSUE-id>=<new-severity> mutations
//      ONLY for the issues named on the CLI. The script does NOT make
//      autonomous severity calls; PRD §28 judgment lives with the agent.
//   5. Transition status:new → status:triaged. status:closed and status:wont_fix
//      are held; any other status is preserved.
//   6. Append-only history entries per mutated record, citing the
//      triage-report id (every audit trail is reproducible from the file
//      alone).
//   7. AJV-validate every mutated record against issue.schema.json BEFORE
//      atomicWrite — bad records never reach disk.
//   8. Write triage-report-<ts>.md, blockers.md (snapshot — severity:critical
//      AND confidence ∈ {confirmed, strong-suspect}), and groups.md (cluster
//      index by domain × type × severity).
//   9. Refresh cross-cut indexes (by_domain/, by_severity/, by_status/,
//      by_type/) by re-deriving from disk truth.
//
// CLI:
//   node scripts/triage.js [--workspace <p>] [--cwd <p>] [--dry-run] \
//     [--severity-override ISSUE-024=low] [--severity-override ISSUE-XXX=...]
//
// Exit codes:
//   0  success
//   1  AJV-validation failure / invalid CLI arg / parse error
//   2  unknown CLI argument

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { regenerateCrossCutIndexes } from './lib/command-lifecycle.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { loadConfig } from './lib/load-config.js';
import { loadAllSchemas } from './lib/schema-loader.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const ISSUE_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/issue.schema.json';
const TARGET_DIR = 'to_fix';
const SEVERITY_VALUES = new Set(['critical', 'high', 'medium', 'low', 'enhancement']);
const HELD_STATUSES = new Set(['closed', 'wont_fix']);
const BLOCKER_CONFIDENCES = new Set(['confirmed', 'strong-suspect']);

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Levenshtein-ratio similarity in [0, 1]: 1 = identical, 0 = totally different.
 * Cheap iterative implementation; inputs are short (repro steps).
 */
function levenshteinRatio(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  const dist = prev[n];
  const maxLen = Math.max(m, n);
  return 1 - dist / maxLen;
}

function normalizeTitle(t) {
  return String(t ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function reproJoined(issue) {
  return Array.isArray(issue.reproductionSteps) ? issue.reproductionSteps.join(' ') : '';
}

/**
 * Extract evidence ID from a free-form reference (path or bare ID).
 */
function refToEvidId(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/(EVIDENCE-[A-Za-z0-9-]+|EVID-[A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}

/**
 * Walk <wsDir>/evidence/ and return the set of EVIDENCE/EVID directory names
 * present on disk. Used to verify issue.evidence[] references resolve.
 */
async function readEvidenceIndex(wsDir) {
  const dir = path.join(wsDir, 'evidence');
  try {
    const entries = await sortedReaddir(dir, { withFileTypes: true });
    const out = new Set();
    for (const e of entries) {
      if (e.isDirectory() && /^(EVIDENCE|EVID)-/.test(e.name)) out.add(e.name);
    }
    return out;
  } catch (err) {
    if (err.code === 'ENOENT') return new Set();
    throw err;
  }
}

/**
 * Load every ISSUE-*.json under <wsDir>/to_fix/. Returns array of
 * { fileName, filePath, parsed }.
 */
async function readIssues(wsDir) {
  const dir = path.join(wsDir, TARGET_DIR);
  let entries;
  try {
    entries = await sortedReaddir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    if (!/^ISSUE-\d{3,}-/.test(e.name)) continue;
    const filePath = path.join(dir, e.name);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (err) {
      const e2 = new Error(`triage: failed to parse ${e.name}: ${err.message}`);
      e2.code = 'TESTATLAS_INVALID_RECORD';
      throw e2;
    }
    out.push({ fileName: e.name, filePath, parsed });
  }
  return out;
}

/**
 * Compute duplicate-candidate groups. Returns Map<groupId, { canonical, members, heuristics }>.
 * groupId is a stable string = canonical (lowest-numbered member ID).
 */
function detectDuplicateGroups(issues) {
  // Union-Find over issue indexes.
  const parent = issues.map((_, i) => i);
  const heuristicsForIdx = issues.map(() => new Set());
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b, h) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
    heuristicsForIdx[a].add(h);
    heuristicsForIdx[b].add(h);
  };

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const a = issues[i].parsed;
      const b = issues[j].parsed;

      // Heuristic 1: exact title match (case-insensitive, ws-collapsed).
      if (normalizeTitle(a.title) && normalizeTitle(a.title) === normalizeTitle(b.title)) {
        union(i, j, 'exact-title');
        continue;
      }
      // Heuristic 2: same domain + same flow + repro Levenshtein ≥ 0.8.
      if (
        a.domain &&
        a.domain === b.domain &&
        (a.flow ?? null) === (b.flow ?? null) &&
        reproJoined(a) &&
        reproJoined(b) &&
        levenshteinRatio(reproJoined(a), reproJoined(b)) >= 0.8
      ) {
        union(i, j, 'domain-flow-repro');
        continue;
      }
      // Heuristic 3: shared evidence reference.
      const eA = new Set(
        (Array.isArray(a.evidence) ? a.evidence : []).map(refToEvidId).filter(Boolean),
      );
      const eB = new Set(
        (Array.isArray(b.evidence) ? b.evidence : []).map(refToEvidId).filter(Boolean),
      );
      let shared = false;
      for (const id of eA) {
        if (eB.has(id)) {
          shared = true;
          break;
        }
      }
      if (shared) union(i, j, 'shared-evidence');
    }
  }

  // Group by root.
  const byRoot = new Map();
  for (let i = 0; i < issues.length; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }

  const groups = new Map();
  for (const members of byRoot.values()) {
    if (members.length < 2) continue; // singletons are not "duplicate groups"
    const sorted = [...members].sort((x, y) =>
      issues[x].parsed.id.localeCompare(issues[y].parsed.id),
    );
    const canonicalIdx = sorted[0];
    const canonicalId = issues[canonicalIdx].parsed.id;
    const heuristics = new Set();
    for (const idx of sorted) {
      for (const h of heuristicsForIdx[idx]) heuristics.add(h);
    }
    groups.set(canonicalId, {
      canonical: canonicalId,
      members: sorted.map((idx) => issues[idx].parsed.id),
      heuristics: Array.from(heuristics).sort(),
    });
  }
  return groups;
}

/**
 * Parse --severity-override flags into a Map<issueId, newSeverity>. Also
 * accepts a partial issue id prefix (e.g. ISSUE-024) and resolves it to the
 * full filename-based ID by issue lookup.
 */
function buildSeverityOverrideMap(overrideFlags, issues) {
  const out = new Map();
  for (const flag of overrideFlags) {
    const eq = flag.indexOf('=');
    if (eq < 0) {
      const e = new Error(`triage: --severity-override expects ISSUE-id=severity (got "${flag}")`);
      e.code = 'TESTATLAS_INVALID_ARGS';
      throw e;
    }
    const idPart = flag.slice(0, eq).trim();
    const sev = flag.slice(eq + 1).trim();
    if (!SEVERITY_VALUES.has(sev)) {
      const e = new Error(
        `triage: invalid severity "${sev}" — must be one of: ${Array.from(SEVERITY_VALUES).join(', ')}`,
      );
      e.code = 'TESTATLAS_INVALID_ARGS';
      throw e;
    }
    // Resolve partial to full id: prefer exact match; else unique prefix match.
    const exact = issues.find((it) => it.parsed.id === idPart);
    let resolved;
    if (exact) {
      resolved = exact.parsed.id;
    } else {
      const matches = issues.filter((it) => it.parsed.id.startsWith(idPart));
      if (matches.length === 1) resolved = matches[0].parsed.id;
      else if (matches.length === 0) {
        const e = new Error(`triage: --severity-override target "${idPart}" not found in to_fix/`);
        e.code = 'TESTATLAS_INVALID_ARGS';
        throw e;
      } else {
        const e = new Error(
          `triage: --severity-override target "${idPart}" is ambiguous (matches ${matches.length} issues)`,
        );
        e.code = 'TESTATLAS_INVALID_ARGS';
        throw e;
      }
    }
    out.set(resolved, sev);
  }
  return out;
}

/**
 * Verify each issue's evidence array resolves to a directory under
 * <wsDir>/evidence/. Returns Map<issueId, missingRefs[]> for issues with at
 * least one missing reference.
 */
async function verifyEvidenceOnDisk(wsDir, issues) {
  const evidIdx = await readEvidenceIndex(wsDir);
  const out = new Map();
  for (const it of issues) {
    const refs = Array.isArray(it.parsed.evidence) ? it.parsed.evidence : [];
    const missing = [];
    for (const ref of refs) {
      const evid = refToEvidId(ref);
      if (!evid) {
        missing.push(ref);
        continue;
      }
      if (!evidIdx.has(evid)) {
        // Last-chance check: maybe the reference is a relative path that
        // points at a real file under <wsDir>/. Stat it directly.
        try {
          await stat(path.join(wsDir, ref));
        } catch {
          missing.push(ref);
        }
      }
    }
    if (missing.length > 0) out.set(it.parsed.id, missing);
  }
  return out;
}

/**
 * Apply triage transitions to the in-memory record. Returns a list of
 * change descriptors (used for both history entries and the triage report).
 */
function applyTriageMutations({ issue, severityOverride, missingEvidence, triageReportId, atIso }) {
  const changes = {
    statusChange: null,
    severityChange: null,
    confidenceChange: null,
    notes: [],
  };

  // 1. Status: new → triaged. closed/wont_fix held.
  if (issue.status === 'new') {
    changes.statusChange = { from: 'new', to: 'triaged' };
  }

  // 2. Severity: only on explicit override.
  if (severityOverride && severityOverride !== issue.severity) {
    changes.severityChange = { from: issue.severity, to: severityOverride };
  }

  // 3. Confidence: downgrade to needs-validation if any evidence is missing.
  if (missingEvidence && missingEvidence.length > 0 && issue.confidence !== 'needs-validation') {
    changes.confidenceChange = { from: issue.confidence, to: 'needs-validation' };
    changes.notes.push(
      `evidence missing on disk: ${missingEvidence.join(', ')} — downgraded to needs-validation`,
    );
  }

  const mutated = !!changes.statusChange || !!changes.severityChange || !!changes.confidenceChange;
  if (!mutated) return { mutated: false, changes };

  // Apply.
  if (changes.statusChange) issue.status = changes.statusChange.to;
  if (changes.severityChange) issue.severity = changes.severityChange.to;
  if (changes.confidenceChange) issue.confidence = changes.confidenceChange.to;
  issue.lastUpdatedAt = atIso;

  // Append-only history entry.
  const noteParts = [`triage-report=${triageReportId}`];
  if (changes.severityChange) {
    noteParts.push(
      `severity ${changes.severityChange.from}→${changes.severityChange.to} (explicit override)`,
    );
  }
  if (changes.confidenceChange) {
    noteParts.push(`confidence ${changes.confidenceChange.from}→${changes.confidenceChange.to}`);
  }
  if (changes.notes.length > 0) noteParts.push(...changes.notes);

  const entry = { at: atIso, action: 'triaged', note: noteParts.join('; ') };
  if (changes.statusChange) entry.statusChange = changes.statusChange;
  if (changes.severityChange) entry.severityChange = changes.severityChange;
  if (changes.confidenceChange) entry.confidenceChange = changes.confidenceChange;

  if (!Array.isArray(issue.history)) issue.history = [];
  issue.history.push(entry);

  return { mutated: true, changes };
}

/**
 * Render triage-report-<ts>.md content.
 */
function renderTriageReport({
  triageReportId,
  generatedAt,
  issues,
  duplicateGroups,
  severityOverrides,
  missingEvidence,
  mutated,
}) {
  const total = issues.length;
  const sevChanges = mutated.filter((m) => m.changes.severityChange);
  const confChanges = mutated.filter((m) => m.changes.confidenceChange);
  const statusChanges = mutated.filter((m) => m.changes.statusChange);

  const blockers = issues.filter(
    (it) =>
      it.parsed.severity === 'critical' &&
      BLOCKER_CONFIDENCES.has(it.parsed.confidence) &&
      !HELD_STATUSES.has(it.parsed.status),
  );

  // Active groups by (domain, type, severity).
  const activeGroups = new Map();
  for (const it of issues) {
    if (HELD_STATUSES.has(it.parsed.status)) continue;
    const key = `${it.parsed.domain}|${it.parsed.type}|${it.parsed.severity}`;
    if (!activeGroups.has(key)) activeGroups.set(key, []);
    activeGroups.get(key).push(it.parsed.id);
  }

  const lines = [];
  lines.push(`# Triage Report — ${triageReportId}`);
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total issues triaged: ${total}`);
  lines.push(`- Status transitions (→ triaged): ${statusChanges.length}`);
  lines.push(`- Severity overrides applied: ${sevChanges.length}`);
  lines.push(`- Confidence downgrades (missing evidence): ${confChanges.length}`);
  lines.push(`- Duplicate-candidate groups detected: ${duplicateGroups.size}`);
  lines.push(
    `- Blockers (severity:critical & confidence ∈ {confirmed, strong-suspect}): ${blockers.length}`,
  );
  lines.push(`- Issues with missing evidence: ${missingEvidence.size}`);
  lines.push('');

  lines.push('## Severity Changes');
  lines.push('');
  if (sevChanges.length === 0) {
    lines.push('_None._');
  } else {
    for (const m of sevChanges) {
      lines.push(
        `- ${m.id}: ${m.changes.severityChange.from} → ${m.changes.severityChange.to} (explicit override)`,
      );
    }
  }
  lines.push('');

  lines.push('## Confidence Changes');
  lines.push('');
  if (confChanges.length === 0) {
    lines.push('_None._');
  } else {
    for (const m of confChanges) {
      lines.push(
        `- ${m.id}: ${m.changes.confidenceChange.from} → ${m.changes.confidenceChange.to}`,
      );
    }
  }
  lines.push('');

  lines.push('## Duplicate Groups');
  lines.push('');
  if (duplicateGroups.size === 0) {
    lines.push('_None detected._');
  } else {
    for (const g of duplicateGroups.values()) {
      lines.push(
        `- canonical=${g.canonical}; members=${g.members.join(', ')}; heuristics=${g.heuristics.join('+')}`,
      );
    }
  }
  lines.push('');

  lines.push('## Blockers');
  lines.push('');
  if (blockers.length === 0) {
    lines.push('_None._');
  } else {
    for (const b of blockers) {
      lines.push(`- ${b.parsed.id}: ${b.parsed.title}`);
    }
  }
  lines.push('');

  lines.push('## Missing Evidence');
  lines.push('');
  if (missingEvidence.size === 0) {
    lines.push('_None._');
  } else {
    for (const [id, refs] of missingEvidence) {
      lines.push(`- ${id}: ${refs.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Active Groups (domain × type × severity)');
  lines.push('');
  if (activeGroups.size === 0) {
    lines.push('_None._');
  } else {
    const sortedKeys = Array.from(activeGroups.keys()).sort();
    for (const key of sortedKeys) {
      const ids = activeGroups.get(key);
      lines.push(`- ${key} → ${ids.length} issue(s): ${ids.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Severity Overrides Applied (CLI)');
  lines.push('');
  if (severityOverrides.size === 0) {
    lines.push('_None._');
  } else {
    for (const [id, sev] of severityOverrides) {
      lines.push(`- ${id} → ${sev}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function renderBlockersMd(issues, generatedAt) {
  const blockers = issues.filter(
    (it) =>
      it.parsed.severity === 'critical' &&
      BLOCKER_CONFIDENCES.has(it.parsed.confidence) &&
      !HELD_STATUSES.has(it.parsed.status),
  );
  const lines = [];
  lines.push('# Blockers');
  lines.push('');
  lines.push(
    `_Snapshot generated ${generatedAt}._ Issues with severity=critical AND confidence ∈ {confirmed, strong-suspect} AND status not closed/wont_fix.`,
  );
  lines.push('');
  if (blockers.length === 0) {
    lines.push('_No blockers._');
  } else {
    for (const b of blockers) {
      const evCount = Array.isArray(b.parsed.evidence) ? b.parsed.evidence.length : 0;
      lines.push(`- **${b.parsed.id}** — ${b.parsed.title}`);
      lines.push(
        `  - domain: ${b.parsed.domain}; flow: ${b.parsed.flow ?? '_none_'}; evidence: ${evCount}; confidence: ${b.parsed.confidence}`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function renderGroupsMd(issues, generatedAt) {
  const map = new Map(); // key: domain|type|severity → list of issues (open only)
  for (const it of issues) {
    if (HELD_STATUSES.has(it.parsed.status)) continue;
    const key = `${it.parsed.domain}|${it.parsed.type}|${it.parsed.severity}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it.parsed);
  }
  const lines = [];
  lines.push('# Issue Groups (domain × type × severity)');
  lines.push('');
  lines.push(`_Snapshot generated ${generatedAt}._ Excludes status:closed and status:wont_fix.`);
  lines.push('');
  if (map.size === 0) {
    lines.push('_No active groups._');
    lines.push('');
    return lines.join('\n');
  }
  const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, members] of sorted) {
    const [domain, type, severity] = key.split('|');
    members.sort((x, y) => x.id.localeCompare(y.id));
    const exemplar = members[0];
    lines.push(`## ${domain} / ${type} / ${severity}`);
    lines.push('');
    lines.push(`- members: ${members.length}`);
    lines.push(`- exemplar: ${exemplar.id} — ${exemplar.title}`);
    lines.push('- ids:');
    for (const m of members) lines.push(`  - ${m.id}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   severityOverride?: string[],
 * }} [args]
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   atomicWrite?: typeof atomicWrite,
 *   loadAllSchemas?: typeof loadAllSchemas,
 * }} [_inject]
 */
export async function triage(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _loadAllSchemas = _inject.loadAllSchemas ?? loadAllSchemas;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;

  // 1. Load issues.
  const issues = await readIssues(wsDir);
  if (issues.length === 0) {
    return {
      wsDir,
      dryRun,
      mutatedCount: 0,
      duplicateGroupCount: 0,
      missingEvidenceCount: 0,
      message: 'Nothing to triage.',
    };
  }

  // 2. Resolve --severity-override map (exits early on invalid value).
  const overrides = buildSeverityOverrideMap(args.severityOverride ?? [], issues);

  // 3. Verify evidence on disk.
  const missingEvidence = await verifyEvidenceOnDisk(wsDir, issues);

  // 4. Detect duplicate groups (informational; the script does not auto-mark
  //    duplicates because the canonical/duplicate distinction needs agent
  //    judgment per command spec — surfaced in the triage report instead).
  const duplicateGroups = detectDuplicateGroups(issues);

  // 5. Apply mutations.
  const generatedAt = now();
  const triageReportId = `triage-report-${generatedAt.replace(/[:.]/g, '-')}`;
  const mutated = [];
  for (const it of issues) {
    const ovr = overrides.get(it.parsed.id) ?? null;
    const missing = missingEvidence.get(it.parsed.id) ?? null;
    const result = applyTriageMutations({
      issue: it.parsed,
      severityOverride: ovr,
      missingEvidence: missing,
      triageReportId,
      atIso: generatedAt,
    });
    if (result.mutated) {
      mutated.push({
        id: it.parsed.id,
        fileName: it.fileName,
        filePath: it.filePath,
        changes: result.changes,
      });
    }
  }

  // 6. AJV-validate every mutated record.
  const ajv = await _loadAllSchemas({ cwd });
  const validator = ajv.getSchema(ISSUE_SCHEMA_ID);
  if (!validator) {
    const e = new Error('triage: issue.schema.json not loaded');
    e.code = 'TESTATLAS_SCHEMA_MISSING';
    throw e;
  }
  for (const it of issues) {
    if (!validator(it.parsed)) {
      const e = new Error(
        `triage: ${it.parsed.id} no longer passes issue.schema.json:\n  ${(validator.errors ?? [])
          .map((x) => `${x.instancePath || '/'} ${x.message}`)
          .join('\n  ')}`,
      );
      e.code = 'TESTATLAS_INVALID_RECORD';
      e.validationErrors = validator.errors;
      throw e;
    }
  }

  // 7. Surface missing-evidence to stderr (for visibility) regardless of dry-run.
  if (missingEvidence.size > 0) {
    const lines = ['triage: missing-evidence detected:'];
    for (const [id, refs] of missingEvidence) {
      lines.push(`  ${id} → ${refs.join(', ')}`);
    }
    console.warn(lines.join('\n'));
  }

  // 8. Write outputs (unless dry-run).
  const triageReportMd = renderTriageReport({
    triageReportId,
    generatedAt,
    issues,
    duplicateGroups,
    severityOverrides: overrides,
    missingEvidence,
    mutated,
  });
  const blockersMd = renderBlockersMd(issues, generatedAt);
  const groupsMd = renderGroupsMd(issues, generatedAt);

  const toFixDir = path.join(wsDir, TARGET_DIR);
  const triageReportPath = path.join(toFixDir, `${triageReportId}.md`);
  const blockersPath = path.join(toFixDir, 'blockers.md');
  const groupsPath = path.join(toFixDir, 'groups.md');

  if (!dryRun) {
    // Write mutated issue JSONs first (atomic).
    for (const m of mutated) {
      const it = issues.find((x) => x.parsed.id === m.id);
      await _atomicWrite(it.filePath, `${JSON.stringify(it.parsed, null, 2)}\n`);
    }
    await _atomicWrite(triageReportPath, triageReportMd);
    await _atomicWrite(blockersPath, blockersMd);
    await _atomicWrite(groupsPath, groupsMd);

    // Refresh cross-cut indexes from disk truth.
    const indexInputs = issues.map((it) => ({
      id: it.parsed.id,
      slug: it.parsed.slug,
      parsed: it.parsed,
    }));
    await regenerateCrossCutIndexes(wsDir, indexInputs);
  }

  return {
    wsDir,
    dryRun,
    triageReportPath,
    blockersPath,
    groupsPath,
    mutatedCount: mutated.length,
    duplicateGroupCount: duplicateGroups.size,
    missingEvidenceCount: missingEvidence.size,
  };
}

// Suppress unused-import lint for writeFile (kept for forward-compat extension).
void writeFile;

// ─── CLI wrapper ─────────────────────────────────────────────────────────────

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = { severityOverride: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--workspace':
        opts.workspaceDir = argv[++i];
        break;
      case '--cwd':
        opts.cwd = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--severity-override':
        opts.severityOverride.push(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/triage.js [--workspace <p>] [--cwd <p>] [--dry-run] \\\n' +
            '  [--severity-override ISSUE-024=low] [--severity-override ISSUE-XXX=...]\n\n' +
            'Reads every <wsDir>/to_fix/ISSUE-*.json, applies triage discipline\n' +
            '(status:new → status:triaged; explicit --severity-override; confidence\n' +
            'downgrade for missing evidence; duplicate-group detection), AJV-validates\n' +
            'every mutated record against issue.schema.json BEFORE write, and emits\n' +
            'triage-report-<ts>.md, blockers.md, and groups.md.\n\n' +
            'Severity values (PRD §28): critical, high, medium, low, enhancement.\n' +
            'Idempotent: re-running on an already-triaged corpus is a no-op.',
        );
        process.exit(0);
        break;
      default:
        console.error(`triage: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await triage(opts);
    console.log(
      `triage: ${r.dryRun ? 'would write' : 'wrote'} ${r.mutatedCount} mutation(s); ${r.duplicateGroupCount} duplicate group(s); ${r.missingEvidenceCount} missing-evidence flag(s)`,
    );
  } catch (err) {
    console.error(`triage: ${err.code ?? 'ERROR'} — ${err.message}`);
    if (err.validationErrors) {
      for (const e of err.validationErrors) {
        console.error(`  ${e.instancePath || '/'} ${e.message}`);
      }
    }
    process.exit(1);
  }
}
