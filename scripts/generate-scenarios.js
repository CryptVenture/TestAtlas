#!/usr/bin/env node
// scripts/generate-scenarios.js
//
// Plan 14-07 Task 1 — Scenario generation engine (V2 PRD §7.14, §18).
//
// Reads flow docs from `_testatlas/flows/<FLOW-id>.{md,json}` and produces
// exploratory charters + manual test scripts at
// `_testatlas/tests/scenarios/TEST-<flow-id>-<slug>.{md,json}`.
//
// Each scenario carries the V1 test-scenario.schema.json shape (id, name,
// domain, flow, priority, type, status, userGoal, preconditions, testData,
// steps, expectedResults, evidence, issues, lastUpdatedAt) — but with
// `status: "generated-not-yet-validated"` to signal it has not been executed.
//
// CLI:
//   node scripts/generate-scenarios.js [--cwd <dir>] [--flow <FLOW-id>] [--domain <slug>] [--all] [--output-dir <path>]
//
// Programmatic:
//   import { generateScenarios } from './generate-scenarios.js';
//   const r = await generateScenarios({ cwd, flow, domain, all });

import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

export const GENERATED_STATUS = 'generated-not-yet-validated';

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(p, fb) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fb;
  }
}

function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Extract step text from the flow markdown body. Falls back to JSON
 * `expectedBehavior[]` if no markdown steps present.
 */
function extractStepsFromMarkdown(md) {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const steps = [];
  let inSteps = false;
  for (const line of lines) {
    if (/^##\s+Steps\b/i.test(line)) {
      inSteps = true;
      continue;
    }
    if (inSteps && /^##\s+/.test(line)) break;
    if (inSteps) {
      const m = line.match(/^\s*(?:\d+\.\s+|[-*]\s+)(.+?)\s*$/);
      if (m?.[1]) steps.push(m[1]);
    }
  }
  return steps;
}

/**
 * Build a scenario record from a flow JSON sidecar.
 */
function scenarioForFlow(flow, mdSteps) {
  const flowId = flow.id;
  const flowSlug = flowId.replace(/^FLOW-/, '');
  const id = `TEST-${flowSlug}-generated`;
  const steps =
    mdSteps.length > 0
      ? mdSteps
      : Array.isArray(flow.expectedBehavior) && flow.expectedBehavior.length > 0
        ? flow.expectedBehavior
        : ['Walk through the flow end-to-end with documented preconditions.'];
  const expectedResults =
    Array.isArray(flow.expectedBehavior) && flow.expectedBehavior.length > 0
      ? flow.expectedBehavior
      : ['Flow completes without unhandled errors.'];
  return {
    $schema: 'https://testatlas.dev/schemas/v1/test-scenario.schema.json',
    id,
    name: `Generated scenario: ${flow.name ?? flowId}`,
    domain: flow.domain,
    flow: flowId,
    priority: flow.priority ?? 'medium',
    type: 'exploratory',
    status: GENERATED_STATUS,
    userGoal: flow.goal ?? `Validate ${flow.name ?? flowId}`,
    preconditions: Array.isArray(flow.preconditions) ? flow.preconditions : [],
    testData: { fixtures: [], mock_data: [] },
    steps,
    expectedResults,
    evidence: [],
    issues: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function renderMarkdown(scenario, flow) {
  const lines = [];
  lines.push('---');
  lines.push(`id: ${scenario.id}`);
  lines.push(`flow: ${scenario.flow}`);
  lines.push(`domain: ${scenario.domain}`);
  lines.push(`priority: ${scenario.priority}`);
  lines.push(`status: ${scenario.status}`);
  lines.push(`type: ${scenario.type}`);
  lines.push(`generated_by: scripts/generate-scenarios.js`);
  lines.push(`last_updated: ${scenario.lastUpdatedAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${scenario.name}`);
  lines.push('');
  lines.push('> Status: **generated-not-yet-validated** — this scenario was');
  lines.push('> generated from the flow doc and has not been executed yet.');
  lines.push('> Run it via `/atlas:test-flow` (or the equivalent test command)');
  lines.push('> and update the status to `validated` once evidence is captured.');
  lines.push('');
  lines.push('## User Goal');
  lines.push('');
  lines.push(scenario.userGoal);
  lines.push('');
  lines.push('## Preconditions');
  lines.push('');
  if (scenario.preconditions.length === 0) lines.push('- (none documented)');
  for (const p of scenario.preconditions) lines.push(`- ${p}`);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  for (let i = 0; i < scenario.steps.length; i++) {
    lines.push(`${i + 1}. ${scenario.steps[i]}`);
  }
  lines.push('');
  lines.push('## Expected Results');
  lines.push('');
  for (const r of scenario.expectedResults) lines.push(`- ${r}`);
  lines.push('');
  lines.push('## Test Data / Fixtures');
  lines.push('');
  lines.push('- Fixtures: (declare any fixture files this scenario needs)');
  lines.push('- Mock data: (describe stubbed services, payloads, time)');
  lines.push('');
  lines.push('## Source Flow');
  lines.push('');
  lines.push(`- ${flow.id}${flow.name ? ` — ${flow.name}` : ''}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function readFlows(flowsDir) {
  if (!(await fileExists(flowsDir))) return [];
  const entries = await readdir(flowsDir, { withFileTypes: true });
  const flows = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    if (!e.name.startsWith('FLOW-')) continue;
    const json = await readJsonOr(path.join(flowsDir, e.name), null);
    if (!json || typeof json !== 'object' || !json.id) continue;
    let md = '';
    const mdPath = path.join(flowsDir, e.name.replace(/\.json$/, '.md'));
    if (await fileExists(mdPath)) md = await readFile(mdPath, 'utf8');
    flows.push({ json, md });
  }
  return flows;
}

/**
 * @param {{ cwd?: string, flow?: string, domain?: string, all?: boolean, outputDir?: string }} args
 */
export async function generateScenarios(args = {}) {
  const cwd = args.cwd ?? process.cwd();
  const flowsDir = path.join(cwd, '_testatlas', 'flows');
  const outDir = args.outputDir ?? path.join(cwd, '_testatlas', 'tests', 'scenarios');
  await mkdir(outDir, { recursive: true });

  const flows = await readFlows(flowsDir);
  const filtered = flows.filter(({ json }) => {
    if (args.flow && json.id !== args.flow) return false;
    if (args.domain && json.domain !== args.domain) return false;
    return true;
  });

  if (filtered.length === 0 && !args.all && !args.flow && !args.domain) {
    return { ok: true, scenarios: [], written: [] };
  }

  const scenarios = [];
  const written = [];
  for (const { json, md } of filtered) {
    const mdSteps = extractStepsFromMarkdown(md);
    const scenario = scenarioForFlow(json, mdSteps);
    const flowSlug = slugify(json.id.replace(/^FLOW-/, ''));
    const baseName = `TEST-${flowSlug}-generated`;
    const jsonPath = path.join(outDir, `${baseName}.json`);
    const mdPath = path.join(outDir, `${baseName}.md`);
    await atomicWrite(jsonPath, `${JSON.stringify(scenario, null, 2)}\n`);
    await atomicWrite(mdPath, renderMarkdown(scenario, json));
    scenarios.push(scenario);
    written.push(jsonPath, mdPath);
  }

  return { ok: true, scenarios, written };
}

function parseArgs(argv) {
  const out = { cwd: process.cwd(), all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--flow') out.flow = argv[++i];
    else if (a === '--domain') out.domain = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--output-dir') out.outputDir = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      console.error(`generate-scenarios: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/generate-scenarios.js [--cwd <dir>] [--flow <FLOW-id>] [--domain <slug>] [--all] [--output-dir <path>]',
    );
    process.exit(0);
  }
  generateScenarios(args)
    .then((r) => {
      console.log(
        `generate-scenarios: ${r.scenarios.length} scenario(s) generated; ${r.written.length} file(s) written.`,
      );
    })
    .catch((err) => {
      console.error(`generate-scenarios: ${err.code ?? 'ERROR'} — ${err.message}`);
      process.exit(1);
    });
}
