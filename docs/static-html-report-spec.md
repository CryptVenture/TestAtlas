# Static HTML Report — design spec (DEFERRED feature)

> **Status:** deferred / optional. Not in the v1 release scope.
>
> This document captures the design contract for the Static HTML Report so a future implementer (or a downstream consumer) can build it from `dashboard-data.json` without needing fresh archeology of TestAtlas internals.

## Goal

Produce a single self-contained HTML file that renders the same surface as the markdown reports under `_testatlas/reports/` (plus a richer dashboard view) without requiring a server, a build step, or a network round-trip. Goal personas: a release engineer skimming a CI artifact in their browser; a non-technical stakeholder reviewing pre-ship readiness; an auditor following the evidence chain through clickable links.

## Inputs

The Static HTML Report is **purely derived** — it consumes:

- `_testatlas/reports/dashboard-data.json` — the machine-readable export emitted by `/atlas:report-dashboard-data`. PRD §16. Currently shaped for downstream UIs / CI status pages.
- `_testatlas/reports/REPORT-latest.json` — the canonical structured report.
- `_testatlas/13_quality_scorecard.md` (optional) — scorecard rendering.

No additional data fetches. The HTML embeds everything inline (`<script>` blob) so it works fully offline.

## Output

A single `_testatlas/reports/static-report-<timestamp>.html` file. Roughly the shape of a self-contained one-page React/preact bundle (no external deps), but the spec is renderer-agnostic — anything that produces a single file from `dashboard-data.json` is acceptable.

## Requirements

### Content
- Executive summary (top-of-page)
- Quality scorecard tile grid (11 PRD §7.15 scores)
- Open-issue queue with severity / domain / flow filters
- Coverage matrix (per-domain × per-flow rollup)
- Drift signals (md↔json + version mismatches)
- Council-session index with links to consolidations
- Evidence chain — every claim links to its evidence sidecar(s)

### Quality
- **WCAG 2.1 AA compliance.** Color contrast, keyboard navigation, ARIA landmarks, focus management, alt text on every image. Tested via `lighthouse --only-categories=accessibility` ≥ 90.
- WCAG checklist documented inline as a comment block at the top of the generated HTML so an auditor can verify by reading the source.
- Color-blind safe palette (Okabe-Ito or equivalent).
- Print-stylesheet so the report is a usable PDF when the user hits Ctrl+P.

### Performance
- LCP ≤ 1.0s on a mid-tier laptop (no network; everything inline).
- Total file size ≤ 1 MB for a workspace with ~200 issues + ~50 evidence records.
- No render-blocking script in `<head>` — defer to a single end-of-body `<script>`.

### Determinism
- Given identical `dashboard-data.json`, the output HTML must be byte-identical (matches the `Test 8` adapter rendering contract). No timestamps, no random IDs, no version banners in the body.

## Non-goals

- Server-side rendering. The Static HTML Report is the *static* form by design.
- Live data. Refresh = re-run the (deferred) `report-static` generator that this spec describes.
- Authentication / role-based views. The HTML is the same for every viewer.
- Per-user filters persisted to localStorage. Out of scope; URL-fragment filters are sufficient.

## Deferred sub-features

- Embedded SQLite browser tab (would require build-sqlite.js to have run; PRD §7.20 makes SQLite optional).
- Trend lines across multiple report runs (needs a multi-report aggregator first).

## Sources

- PRD §16 (machine-readable export)
- PRD §7.15 (quality scores)
- PRD §7.20 (optional SQLite projector)
- WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/

## Status as of 2026-05-09

Not yet implemented. `_testatlas/reports/dashboard-data.json` is emitted by `/atlas:report-dashboard-data`; consumers can build their own static viewer from it today. The reference implementation is **deferred** — open as Q-NEXT-STATIC-HTML-REPORT in the architectural-decision queue when a release-engineer or downstream consumer asks for it.
