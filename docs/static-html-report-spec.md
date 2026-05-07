# TestAtlas Static HTML Report — Design Specification

> Status: **Deferred to post-V2 / community contribution.** This document is the design contract; no static HTML renderer ships in the core suite.
>
> The contract is locked here so any downstream renderer (community, internal, vendor) produces a consistent, dashboard-grade visualisation of TestAtlas brain state.

## Purpose

Render `_testatlas/reports/dashboard-data.json` (PRD §16) as a single-page, dependency-free, offline-viewable HTML report suitable for:

- CI artifact uploads (a single `dashboard.html` blob a reviewer can open with no server).
- Sharing release-readiness state with non-technical stakeholders.
- Embedding in vendor dashboards via an iframe sandbox.

The renderer is OPTIONAL. JSON remains canonical. The HTML is a pure projection of `dashboard-data.json` plus a deterministic CSS/JS bundle.

## Hard Requirements

1. **Single file output.** All HTML, CSS, and JS inlined into `_testatlas/reports/dashboard.html`. No external CDNs, no remote fonts, no remote analytics. A reviewer with no network access must be able to open the file and see the full report.
2. **Input contract.** The renderer reads exactly one file: `_testatlas/reports/dashboard-data.json`. It MUST validate the JSON against `dashboard_data.schema.json` before rendering and refuse on schema violation.
3. **Deterministic output.** Re-running the renderer on the same `dashboard-data.json` produces a byte-identical HTML output (modulo a single `<meta name="generated-at">` tag carrying the input `generated_at` timestamp).
4. **Responsive layout.** The HTML must render correctly at viewport widths from 320px (mobile) to 1920px (desktop) without horizontal scroll. Use CSS grid + flexbox; no hard-coded pixel widths above 320px.
5. **Accessibility (WCAG 2.2 AA).** All charts must carry text alternatives (data tables behind a `<details>` toggle, `aria-label` on every interactive element, contrast ratio ≥ 4.5:1 for body text and ≥ 3:1 for chart elements). Tab order must follow visual order.
6. **No JavaScript dependencies.** No React, no Vue, no D3, no Chart.js. Use raw SVG + minimal vanilla JS. Total inlined JS ≤ 20 KB minified.
7. **No build step assumption.** A developer running the renderer must not need to install npm packages beyond what the suite already pulls in.

## Visual Sections

### 1. Header

- Project name (from `dashboard-data.json#project`).
- `generated_at` timestamp formatted in the viewer's local timezone.
- `schema_version` badge.

### 2. Quality Score Gauges

Render five circular gauges (SVG arcs) for the headline metrics:

| Gauge          | Source field                                      | Range  |
|----------------|---------------------------------------------------|--------|
| Overall Score  | `quality_summary.overall_score`                   | 0–100  |
| Domain Coverage| `quality_summary.domains_tested / domains_total`  | 0–100% |
| Open Critical  | `quality_summary.open_critical`                   | 0–N    |
| Open High      | `quality_summary.open_high`                       | 0–N    |
| Council Pulse  | `council_activity.sessions_last_7_days`           | 0–N    |

Each gauge must have a numeric label, a status color (green ≥ 70, amber 40–69, red < 40 for percent metrics; green = 0, amber 1–3, red ≥ 4 for issue counts), and a `<title>` element naming the metric for screen readers.

### 3. Issue Severity Bar Chart

A horizontal bar chart of `issues_by_severity.{critical, high, medium, low, enhancement}`. Bars color-coded by severity (red, orange, yellow, blue, gray). Behind a `<details>` toggle: a `<table>` with the same data for screen readers and for users who prefer numbers.

### 4. Domain Coverage Grid

A responsive grid (1 column mobile, 2–4 columns desktop) of cards — one per entry in `domains[]`. Each card shows:

- Domain `id` and optional `name`.
- `score` (0–100) as a small inline gauge.
- `open_issues` count.
- `drift_status` as a colored badge (`fresh`=green, `possibly_stale`=amber, `stale_requires_review`=red, `unknown`=gray).

### 5. Drift Timeline

A horizontal bar showing `drift.drift_records_7_days` and a list of `drift.stale_domains[]`. If non-empty, link each domain id to its card in section 4 via a fragment anchor.

### 6. Council Activity Feed

A list rendering `council_activity.{sessions_total, sessions_last_7_days, open_decisions}`. Each statistic shown as a labeled tile.

### 7. Footer

- Link to `_testatlas/reports/dashboard-data.json` (relative path).
- Suite version, schema version, renderer version.
- A note that JSON is canonical.

## Renderer Interface

The renderer is invoked as:

```
node scripts/render-dashboard-html.js [--cwd <dir>] [--input <path>] [--output <path>]
```

Defaults:

- `--input` = `<cwd>/_testatlas/reports/dashboard-data.json`
- `--output` = `<cwd>/_testatlas/reports/dashboard.html`

Exit codes:

- `0` — success, file written.
- `1` — schema validation failure.
- `2` — input file missing.
- `3` — write failure.

## Why This Is Deferred

1. **Scope.** Core V2 prioritises agent-readable JSON and instruction files. A graphical renderer is a cosmetic surface, not a primitive of the brain.
2. **Maintenance burden.** Every UI shift (color palette, accessibility update, browser quirk) becomes a release-blocking bug. Better to leave the surface to community/vendor renderers that can iterate independently.
3. **Composability.** A dashboard-data.json file is consumed by many tools (GitHub status checks, Slack bots, internal portals, vendor dashboards). Picking one renderer would push others to write conversion layers anyway.

## Reference Implementations

When/if community renderers ship, list them here:

- _(none yet)_

## Schema Compatibility

When `dashboard_data.schema.json` evolves (V2 → V3 additive fields), renderers SHOULD render the new fields if present and gracefully ignore unknown fields. They MUST refuse to render input where `schema_version` is incompatible with the renderer's declared support range.
