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
 * @param {{
 *   healed?: {applied: object[], skipped: object[]},
 *   postHealResults?: CheckResult[],
 *   apply?: boolean,
 * }} [extras]
 * @returns {string}
 */
export function renderMarkdownReport(results, ctx, extras = {}) {
  const { healed, postHealResults, apply = false } = extras;
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

  // Auto-heal section. Two flavors:
  //   1. `--auto-heal` was passed: render Applied + Skipped tables from the
  //      `healed` argument; show post-heal status if a re-run happened.
  //   2. No `--auto-heal`: fall back to the original "hint" listing the
  //      auto-fixable codes the user could fix by passing the flag.
  lines.push('## Auto-heal');
  lines.push('');
  if (healed) {
    const { applied = [], skipped = [] } = healed;
    // Plan 12-05 (ISSUE-023): branch the header on the `apply` flag so
    // preview-mode (`--auto-heal` without `--apply`) renders "Would apply (N)"
    // — making it unambiguous that no on-disk writes happened. The previous
    // unconditional "Applied (N)" label caused ISSUE-023.
    const verb = apply ? 'Applied' : 'Would apply';
    lines.push(`### ${verb} (${applied.length})`);
    lines.push('');
    // GAP-2 (quick-260506-nj2): header-level preview subtitle. Additive — the
    // per-row footer below still renders the same wording so both ends of the
    // table agree. Skip when applied.length === 0 (no preview to describe).
    if (!apply && applied.length > 0) {
      lines.push('_Preview only — re-run without `--dry-run` to persist these changes._');
      lines.push('');
    }
    if (applied.length > 0) {
      lines.push('| HEAL | Path | Summary |');
      lines.push('|------|------|---------|');
      for (const a of applied) {
        lines.push(`| ${a.healId} | \`${a.path}\` | ${a.summary} |`);
      }
      if (!apply) {
        lines.push('');
        lines.push('_Preview only — re-run without `--dry-run` to persist these changes._');
      }
    } else {
      lines.push(apply ? '_No heals applied._' : '_No heals to apply._');
    }
    lines.push('');
    lines.push(`### Skipped (${skipped.length})`);
    lines.push('');
    if (skipped.length > 0) {
      lines.push('| Code | Path | Reason |');
      lines.push('|------|------|--------|');
      for (const s of skipped) {
        lines.push(`| ${s.code} | \`${s.path}\` | ${s.reason} |`);
      }
    } else {
      lines.push('_No findings skipped._');
    }
    lines.push('');
    if (postHealResults) {
      const postStatus = aggregateStatus(postHealResults);
      const label = postStatus === 'fail' ? 'FAIL' : postStatus === 'warn' ? 'WARN' : 'PASS';
      lines.push(`**Post-heal status:** ${label}`);
      lines.push('');
    }
  } else {
    const autoHealFindings = results.flatMap((r) => r.findings.filter((f) => f.fixable === 'auto'));
    if (autoHealFindings.length === 0) {
      lines.push('No auto-fixable findings. Run with `--auto-heal` is a no-op.');
    } else {
      lines.push('Run with `--auto-heal` to fix:');
      const byCode = new Map();
      for (const f of autoHealFindings) {
        byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
      }
      for (const [code, n] of byCode) {
        lines.push(`- ${code} (${n} case${n === 1 ? '' : 's'})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a JSON-serializable report.
 *
 * @param {CheckResult[]} results
 * @param {ReporterCtx} ctx
 * @param {{
 *   healed?: {applied: object[], skipped: object[]},
 *   postHealResults?: CheckResult[],
 * }} [extras]
 * @returns {object}
 */
export function renderJsonReport(results, ctx, extras = {}) {
  const { healed, postHealResults } = extras;
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
    applied: healed?.applied ?? [],
    skipped: healed?.skipped ?? [],
  };

  const out = {
    generatedAt,
    workspace: path.resolve(ctx.wsDir),
    overallStatus: aggregateStatus(results),
    summary,
    findings,
    autoHeal,
  };
  if (postHealResults) {
    out.postHealSummary = {
      overallStatus: aggregateStatus(postHealResults),
      summary: postHealResults.map((r) => ({
        check: r.id,
        prdRule: r.prdRule,
        status: r.status,
        findingCount: r.findings.length,
      })),
    };
  }
  return out;
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
