#!/usr/bin/env node
// scripts/bundle-context.js
//
// Plan 14-02 Task 2 — prepare a scoped context bundle for persona execution
// during a council session. Reads relevant brain slices (state, coverage,
// quality_scores) + evidence index + scoped domain/flow files and writes
// `<wsDir>/agents/councils/sessions/<session>/<persona>/context_bundle.md`.
//
// CLI:
//   node scripts/bundle-context.js --persona <id> --session <id> --scope <id|path>
//
// Programmatic:
//   import { bundleContext } from './bundle-context.js';
//   const r = await bundleContext({ cwd, persona, session, scope });

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * @param {{ cwd?: string, persona: string, session: string, scope?: string }} args
 */
export async function bundleContext(args = {}) {
  if (!args.persona) throw err('TESTATLAS_INVALID_ARGS', 'bundle-context: --persona is required');
  if (!args.session) throw err('TESTATLAS_INVALID_ARGS', 'bundle-context: --session is required');

  const cwd = args.cwd ?? process.cwd();
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  if (!(await fileExists(brainDir))) {
    throw err('TESTATLAS_BRAIN_MISSING', `brain dir missing under ${wsDir}`);
  }

  const readJsonOr = async (p, fb) => {
    try {
      return JSON.parse(await readFile(p, 'utf8'));
    } catch {
      return fb;
    }
  };
  const state = await readJsonOr(path.join(brainDir, 'state.json'), null);
  const coverage = await readJsonOr(path.join(brainDir, 'coverage.json'), null);
  const qualityScores = await readJsonOr(path.join(brainDir, 'quality_scores.json'), null);
  const evidenceIdx = await readJsonOr(path.join(brainDir, 'evidence.json'), null);

  const scope = args.scope ?? '(unspecified)';

  const lines = [];
  lines.push(`# Context Bundle`);
  lines.push('');
  lines.push(`- Persona: ${args.persona}`);
  lines.push(`- Session: ${args.session}`);
  lines.push(`- Scope: ${scope}`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## State Snapshot');
  lines.push('');
  if (state) {
    lines.push(`- Project: ${state.project?.name ?? 'unknown'}`);
    lines.push(`- Phase: ${state.status?.phase ?? 'unknown'}`);
    lines.push(`- Domains: ${state.counts?.domains ?? 0}`);
    lines.push(`- Flows: ${state.counts?.flows ?? 0}`);
    lines.push(`- Issues: ${state.counts?.issues ?? 0}`);
    lines.push(`- Confidence: ${state.confidence?.overall ?? 'unknown'}`);
  } else {
    lines.push('- (state.json missing)');
  }
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  if (coverage?.coverage) {
    lines.push(`- Routes: ${coverage.coverage.routes?.length ?? 0}`);
    lines.push(`- Components: ${coverage.coverage.components?.length ?? 0}`);
    lines.push(`- Endpoints: ${coverage.coverage.endpoints?.length ?? 0}`);
    lines.push(`- Commands: ${coverage.coverage.commands?.length ?? 0}`);
  } else {
    lines.push('- (coverage.json missing)');
  }
  lines.push('');
  lines.push('## Quality Scores');
  lines.push('');
  const scores = qualityScores?.scores ?? [];
  if (scores.length === 0) lines.push('- (no scores recorded)');
  else
    for (const s of scores.slice(0, 10))
      lines.push(`- ${s.target ?? 'unknown'}: ${s.score ?? '-'}`);
  lines.push('');
  lines.push('## Evidence Index');
  lines.push('');
  const evidence = evidenceIdx?.evidence ?? [];
  lines.push(`- ${evidence.length} evidence artifact(s) catalogued`);
  for (const e of evidence.slice(0, 5)) lines.push(`  - ${e.id ?? 'unknown'}`);
  lines.push('');
  lines.push('## Scope Files');
  lines.push('');
  // Best-effort: if scope looks like a domain id, include its domain.md.
  if (typeof scope === 'string' && /^domain-/.test(scope)) {
    const slug = scope.replace(/^domain-/, '');
    const mdPath = path.join(wsDir, 'domains', slug, 'domain.md');
    if (await fileExists(mdPath)) {
      lines.push(`- ${path.relative(cwd, mdPath)}`);
    }
  }
  lines.push('');

  // Output path.
  const outDir = path.join(wsDir, 'agents', 'councils', 'sessions', args.session, args.persona);
  await mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'context_bundle.md');
  await atomicWrite(outputPath, lines.join('\n'));

  return { ok: true, outputPath };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--persona':
        opts.persona = argv[++i];
        break;
      case '--session':
        opts.session = argv[++i];
        break;
      case '--scope':
        opts.scope = argv[++i];
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/bundle-context.js --persona <id> --session <id> [--scope <id>] [--cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`bundle-context: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await bundleContext(opts);
    console.log(`bundle-context: wrote ${r.outputPath}`);
  } catch (e) {
    console.error(`bundle-context: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
