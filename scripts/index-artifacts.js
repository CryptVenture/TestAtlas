#!/usr/bin/env node
// scripts/index-artifacts.js
//
// Plan 14-02 Task 1 — scan `_testatlas/{domains,flows,to_fix,evidence}/` and
// rebuild the matching brain JSON indexes. Also updates `state.json` counts
// from the rebuilt indexes.
//
// CLI:
//   node scripts/index-artifacts.js [--cwd <dir>]
//
// Programmatic:
//   import { indexArtifacts } from './index-artifacts.js';
//   const r = await indexArtifacts({ cwd });

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { now } from './lib/determinism.js';

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function scanDomains(wsDir) {
  const root = path.join(wsDir, 'domains');
  if (!(await fileExists(root))) return [];
  const out = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const jsonPath = path.join(root, e.name, 'domain.json');
    if (!(await fileExists(jsonPath))) continue;
    const parsed = await readJsonOr(jsonPath, null);
    if (!parsed) continue;
    out.push({
      id: parsed.id ?? `domain-${e.name}`,
      slug: e.name,
      status: parsed.status ?? 'mapped',
      display_name: parsed.displayName ?? e.name,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

async function scanFlows(wsDir) {
  const root = path.join(wsDir, 'flows');
  if (!(await fileExists(root))) return [];
  const out = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const parsed = await readJsonOr(path.join(root, e.name), null);
    if (!parsed) continue;
    out.push({
      id: parsed.id ?? e.name.replace(/\.json$/, ''),
      domain: parsed.domain ?? null,
      status: parsed.status ?? 'mapped',
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

async function scanIssues(wsDir) {
  const root = path.join(wsDir, 'to_fix');
  if (!(await fileExists(root))) return [];
  const out = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    if (!/^ISSUE-/.test(e.name)) continue;
    const parsed = await readJsonOr(path.join(root, e.name), null);
    if (!parsed) continue;
    out.push({
      id: parsed.id ?? e.name.replace(/\.json$/, ''),
      severity: parsed.severity ?? 'medium',
      status: parsed.status ?? 'new',
      domain: parsed.domain ?? null,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

async function scanEvidence(wsDir) {
  const root = path.join(wsDir, 'evidence');
  if (!(await fileExists(root))) return [];
  const out = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true });
  } catch {
    entries = await readdir(root, { withFileTypes: true });
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/^EVIDENCE-/.test(e.name)) continue;
    out.push({ id: e.name.replace(/\.[^.]+$/, '') });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * @param {{ cwd?: string }} [opts]
 */
export async function indexArtifacts({ cwd = process.cwd() } = {}) {
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  if (!(await fileExists(brainDir))) {
    return { ok: false, error: `brain dir missing: ${brainDir}`, changed: [] };
  }

  const domains = await scanDomains(wsDir);
  const flows = await scanFlows(wsDir);
  const issues = await scanIssues(wsDir);
  const evidence = await scanEvidence(wsDir);

  const changed = [];
  const stamp = now();

  await atomicWrite(
    path.join(brainDir, 'domains.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: stamp, domains }, null, 2)}\n`,
  );
  changed.push('domains.json');
  await atomicWrite(
    path.join(brainDir, 'flows.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: stamp, flows }, null, 2)}\n`,
  );
  changed.push('flows.json');
  await atomicWrite(
    path.join(brainDir, 'issues.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: stamp, issues }, null, 2)}\n`,
  );
  changed.push('issues.json');
  await atomicWrite(
    path.join(brainDir, 'evidence.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: stamp, evidence }, null, 2)}\n`,
  );
  changed.push('evidence.json');

  // Update state.json counts.
  const statePath = path.join(brainDir, 'state.json');
  const state = await readJsonOr(statePath, null);
  if (state?.counts) {
    state.counts.domains = domains.length;
    state.counts.flows = flows.length;
    state.counts.issues = issues.length;
    state.counts.critical_issues = issues.filter((i) => i.severity === 'critical').length;
    state.counts.high_issues = issues.filter((i) => i.severity === 'high').length;
    state.counts.evidence_artifacts = evidence.length;
    if (state.status) {
      state.status.last_updated = stamp;
      state.status.last_command = 'index-artifacts';
    }
    await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
    changed.push('state.json');
  }

  return {
    ok: true,
    changed,
    counts: {
      domains: domains.length,
      flows: flows.length,
      issues: issues.length,
      evidence: evidence.length,
    },
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let cwd = process.cwd();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd' && i + 1 < argv.length) {
      cwd = path.resolve(argv[++i]);
    }
  }
  const r = await indexArtifacts({ cwd });
  if (!r.ok) {
    console.error(`index-artifacts: FAIL — ${r.error}`);
    process.exit(1);
  }
  console.log(
    `index-artifacts: ${r.counts.domains} domains, ${r.counts.flows} flows, ${r.counts.issues} issues, ${r.counts.evidence} evidence`,
  );
}
