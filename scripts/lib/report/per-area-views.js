// scripts/lib/report/per-area-views.js
//
// Quick 260506-dyb Gap 5 — emit the four per-area views that the
// /atlas:report command spec instructs alongside REPORT-latest.md:
//   - regressions.md     issues with type:regression grouped by domain
//   - readiness.md       single-line verdict + drivers
//   - coverage.md        domain × flow × scenario × state matrix
//   - quality_risks.md   PRD §13.10/§13.11 risks + open needs-validation issues
//
// Each file is regenerated atomically per report run; no append-only history.

import path from 'node:path';

/**
 * Build markdown for the four per-area views. Returns an object keyed by
 * filename → markdown text. Caller writes via atomicWrite.
 *
 * @param {{
 *   jsonReport: object,
 *   issues: object[],
 *   flows: object[],
 *   domains: object[],
 *   testRuns: object[],
 *   scenarioIndex: Map<string, {domain:string|null,type:string|null}>,
 * }} ctx
 * @returns {{ 'regressions.md': string, 'readiness.md': string, 'coverage.md': string, 'quality_risks.md': string }}
 */
export function buildPerAreaViews({ jsonReport, issues, flows, domains, testRuns, scenarioIndex }) {
  return {
    'regressions.md': renderRegressions({ jsonReport, issues }),
    'readiness.md': renderReadiness({ jsonReport, issues }),
    'coverage.md': renderCoverage({ jsonReport, flows, domains, testRuns, scenarioIndex }),
    'quality_risks.md': renderQualityRisks({ jsonReport, issues }),
  };
}

function header(title, jsonReport) {
  return [
    `# ${title}`,
    '',
    `**Generated:** ${jsonReport.generatedAt}`,
    `**Report:** ${jsonReport.id}`,
    '',
  ];
}

function renderRegressions({ jsonReport, issues }) {
  const lines = header('Regressions', jsonReport);
  const regressions = issues.filter((i) => i.type === 'regression');
  if (regressions.length === 0) {
    lines.push('_No regressions on file._');
    return lines.join('\n');
  }
  // Group by domain.
  const byDomain = new Map();
  for (const i of regressions) {
    const d = i.domain ?? '_unassigned_';
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(i);
  }
  for (const [domain, items] of byDomain) {
    lines.push(`## ${domain}`);
    lines.push('');
    for (const i of items) {
      const title = i.title ?? i.summary ?? '(no title)';
      lines.push(`- **${i.id}** [${i.severity ?? '?'}/${i.status ?? '?'}] ${title}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderReadiness({ jsonReport, issues }) {
  const lines = header('Readiness', jsonReport);
  lines.push(`## Verdict`);
  lines.push('');
  lines.push(`**${jsonReport.readinessAssessment}**`);
  lines.push('');
  lines.push(`## Drivers`);
  lines.push('');

  const blockers = issues.filter((i) => i.severity === 'critical');
  const high = issues.filter((i) => i.severity === 'high');
  const open = issues.filter(
    (i) => i.status !== 'fixed' && i.status !== 'closed' && i.status !== 'cannot-reproduce',
  );

  lines.push(`- Blockers (critical): ${blockers.length}`);
  lines.push(`- High-severity issues: ${high.length}`);
  lines.push(`- Open issues: ${open.length}`);
  lines.push(`- Tests executed: ${jsonReport.testsExecuted}`);
  lines.push(`- Domains covered: ${jsonReport.domainsCovered.length}`);
  lines.push(`- Coverage gaps: ${jsonReport.gaps.length}`);
  lines.push(`- Evidence records: ${jsonReport.evidenceCount}`);
  lines.push('');
  if (blockers.length > 0) {
    lines.push('### Blocking issues');
    lines.push('');
    for (const b of blockers) {
      const t = b.title ?? b.summary ?? '(no title)';
      lines.push(`- **${b.id}**: ${t}`);
    }
  }
  return lines.join('\n');
}

function renderCoverage({ jsonReport, flows, domains, testRuns, scenarioIndex }) {
  const lines = header('Coverage', jsonReport);
  lines.push(`## Coverage matrix`);
  lines.push('');
  lines.push(`Domains × flows × scenarios run.`);
  lines.push('');

  // Build: domain → flow → [scenario IDs run]
  const exercised = new Map(); // domain → Map(flow → Set(scenarioId))
  for (const r of testRuns) {
    const scenarios = Array.isArray(r.parsed?.scenariosRun) ? r.parsed.scenariosRun : [];
    for (const s of scenarios) {
      const id = typeof s === 'string' ? s : s?.id;
      if (!id) continue;
      const sc = scenarioIndex?.get(id);
      const domain = sc?.domain ?? (typeof s === 'object' ? s?.domain : null) ?? '_unknown_';
      const flow = (typeof s === 'object' ? s?.flow : null) ?? '_unknown_';
      if (!exercised.has(domain)) exercised.set(domain, new Map());
      const fmap = exercised.get(domain);
      if (!fmap.has(flow)) fmap.set(flow, new Set());
      fmap.get(flow).add(id);
    }
  }

  lines.push('| Domain | Flow | Scenarios run |');
  lines.push('| --- | --- | --- |');
  if (exercised.size === 0) {
    lines.push('| _none_ | _none_ | 0 |');
  } else {
    for (const [domain, fmap] of exercised) {
      for (const [flow, ids] of fmap) {
        lines.push(`| ${domain} | ${flow} | ${ids.size} |`);
      }
    }
  }
  lines.push('');

  // Gap list: domains the report flagged as uncovered.
  lines.push(`## Gaps`);
  lines.push('');
  if (jsonReport.gaps.length === 0) {
    lines.push('_No gaps recorded._');
  } else {
    for (const g of jsonReport.gaps) lines.push(`- ${g}`);
  }
  lines.push('');

  // Inventory totals.
  lines.push(`## Inventory`);
  lines.push('');
  lines.push(`- Domains on file: ${domains.length}`);
  lines.push(`- Flows on file: ${flows.length}`);
  return lines.join('\n');
}

function renderQualityRisks({ jsonReport, issues }) {
  const lines = header('Quality Risks', jsonReport);

  // PRD §13.10 / §13.11 risk categories — render any free-text risks an
  // issue exposes via its `risks` field, plus open needs-validation issues
  // (the canonical "we don't yet trust this" bucket).
  lines.push(`## Open issues at confidence:needs-validation`);
  lines.push('');
  const needsVal = issues.filter(
    (i) =>
      i.confidence === 'needs-validation' &&
      i.status !== 'fixed' &&
      i.status !== 'closed' &&
      i.status !== 'cannot-reproduce',
  );
  if (needsVal.length === 0) {
    lines.push('_None._');
  } else {
    for (const i of needsVal) {
      const t = i.title ?? i.summary ?? '(no title)';
      lines.push(`- **${i.id}** [${i.severity ?? '?'}/${i.domain ?? '?'}] ${t}`);
    }
  }
  lines.push('');

  lines.push(`## Risk surface (PRD §13.10/§13.11)`);
  lines.push('');
  lines.push(`- Coverage gaps: ${jsonReport.gaps.length}`);
  lines.push(`- Critical blockers: ${jsonReport.blockers.length}`);
  lines.push(`- High-severity issues: ${jsonReport.highestSeverityIssues.length}`);
  lines.push(
    `- Tests executed vs. flows: ${jsonReport.testsExecuted} / ${jsonReport.flowsCovered.length}`,
  );

  return lines.join('\n');
}

/**
 * Resolve filenames to absolute paths inside the workspace's reports/ dir.
 * Convenience for the writer.
 *
 * @param {string} reportsDir
 * @param {Record<string,string>} views
 * @returns {Array<{ filePath: string, content: string }>}
 */
export function viewsToWritePlan(reportsDir, views) {
  return Object.entries(views).map(([name, content]) => ({
    filePath: path.join(reportsDir, name),
    content,
  }));
}
