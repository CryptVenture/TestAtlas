// scripts/lib/validate/reporter.js
//
// Markdown + JSON report renderers for validate-workspace. Plan 05-02 (Wave 1).
//
// renderMarkdownReport(results, ctx) → string
// renderJsonReport(results, ctx) → JSON-serializable object
//
// Both consume the same input shape:
//   results: Array<{id, prdRule, status:'pass'|'fail'|'warn', findings:[...]}>
//   ctx:     {wsDir, ajv, files, manifest, config} from the orchestrator
//
// Markdown report layout (per 05-RESEARCH.md §"Example: Reporter output shape"):
//   # Workspace Validation Report
//   **Generated:** <iso>
//   **Workspace:** <wsDir>
//   **Result:** PASS | FAIL | WARN  (+ counts)
//
//   ## Summary
//   | Check | PRD §33 | Status | Findings |
//   |-------|---------|--------|----------|
//
//   ## Findings
//   ### check-<id> (PRD §33 condition <n>) — STATUS
//   - **error|warning** `<path>:<line?>` — CODE — message
//
//   ## Auto-heal
//   Run with `--auto-heal` to fix:
//   - <code> (<n> case[s])

import path from 'node:path';

/**
 * @typedef {{severity:'error'|'warning', path:string, line?:number, code:string, message:string, fixable:'auto'|'manual'|null, fixDescription?:string}} Finding
 * @typedef {{id:string, prdRule:number, status:'pass'|'fail'|'warn', findings:Finding[]}} CheckResult
 * @typedef {{wsDir:string, manifest?:object}} ReporterCtx
 */

/**
 * Render a human-readable markdown report.
 *
 * @param {CheckResult[]} results
 * @param {ReporterCtx} ctx
 * @returns {string}
 */
export function renderMarkdownReport(results, ctx) {
  const generatedAt = new Date().toISOString();
  const wsDirRel = ctx.wsDir;

  const totalErrors = results.reduce(
    (n, r) => n + r.findings.filter((f) => f.severity === 'error').length,
    0,
  );
  const totalWarnings = results.reduce(
    (n, r) => n + r.findings.filter((f) => f.severity === 'warning').length,
    0,
  );
  const overall = aggregateStatus(results);
  const overallText = overall === 'fail' ? 'FAIL' : overall === 'warn' ? 'WARN' : 'PASS';

  const lines = [];
  lines.push('# Workspace Validation Report');
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push(`**Workspace:** \`${wsDirRel}\``);
  lines.push(
    `**Result:** ${overallText} (${totalErrors} error${totalErrors === 1 ? '' : 's'}, ${totalWarnings} warning${totalWarnings === 1 ? '' : 's'} across ${results.length} checks)`,
  );
  lines.push('');

  // Summary table.
  lines.push('## Summary');
  lines.push('');
  lines.push('| Check | PRD §33 | Status | Findings |');
  lines.push('|-------|---------|--------|----------|');
  for (const r of results) {
    const statusLabel = r.status === 'fail' ? 'FAIL' : r.status === 'warn' ? 'WARN' : 'PASS';
    lines.push(`| ${r.id} | ${r.prdRule} | ${statusLabel} | ${r.findings.length} |`);
  }
  lines.push('');

  // Findings sections (only for non-pass checks).
  const nonPass = results.filter((r) => r.status !== 'pass');
  if (nonPass.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const r of nonPass) {
      const statusLabel = r.status === 'fail' ? 'FAIL' : 'WARN';
      lines.push(`### ${r.id} (PRD §33 condition ${r.prdRule}) — ${statusLabel}`);
      lines.push('');
      for (const f of r.findings) {
        const loc = f.line != null ? `${f.path}:${f.line}` : f.path;
        lines.push(`- **${f.severity}** \`${loc}\` — ${f.code} — ${f.message}`);
      }
      lines.push('');
    }
  }

  // Auto-heal hint.
  const autoHealFindings = results.flatMap((r) => r.findings.filter((f) => f.fixable === 'auto'));
  lines.push('## Auto-heal');
  lines.push('');
  if (autoHealFindings.length === 0) {
    lines.push('No auto-fixable findings. Run with `--auto-heal` is a no-op.');
  } else {
    lines.push('Run with `--auto-heal` to fix:');
    // Group by code for compact output.
    const byCode = new Map();
    for (const f of autoHealFindings) {
      byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
    }
    for (const [code, n] of byCode) {
      lines.push(`- ${code} (${n} case${n === 1 ? '' : 's'})`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Render a JSON-serializable report.
 *
 * @param {CheckResult[]} results
 * @param {ReporterCtx} ctx
 * @returns {object}
 */
export function renderJsonReport(results, ctx) {
  const generatedAt = new Date().toISOString();
  const summary = results.map((r) => ({
    check: r.id,
    prdRule: r.prdRule,
    status: r.status,
    findingCount: r.findings.length,
  }));

  const findings = [];
  for (const r of results) {
    for (const f of r.findings) {
      findings.push({
        check: r.id,
        prdRule: r.prdRule,
        ...f,
      });
    }
  }

  const autoHeal = {
    applicable: findings.filter((f) => f.fixable === 'auto'),
  };

  return {
    generatedAt,
    workspace: path.resolve(ctx.wsDir),
    overallStatus: aggregateStatus(results),
    summary,
    findings,
    autoHeal,
  };
}

/**
 * Aggregate per-check status into a workspace-level status.
 *   any fail → 'fail'
 *   any warn (and no fails) → 'warn'
 *   else → 'pass'
 *
 * @param {CheckResult[]} results
 * @returns {'pass'|'warn'|'fail'}
 */
export function aggregateStatus(results) {
  if (results.some((r) => r.status === 'fail')) return 'fail';
  if (results.some((r) => r.status === 'warn')) return 'warn';
  return 'pass';
}
