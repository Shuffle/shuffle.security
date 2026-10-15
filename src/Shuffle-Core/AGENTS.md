# Shuffle-Core Library Rules

Rules for files under `src/Shuffle-Core/` (published as `@shuffleio/shuffle-core`). Read the root `AGENTS.md` as well.

## Report Export

- Report export is a shared library surface: `ExportReportDialog`, `REPORT_SECTIONS`/`visibleReportSections`, `buildSectionTable` and `buildReportPdf` are exported from the library entry, so any area of the platform or host app can offer the same section picker instead of building its own.
- The dashboards keep `buildDashboardPdf` because it also carries their captured charts and raw stats page. Other areas load rows with `buildSectionTable` and write them with `buildReportPdf`.
- New report sections go into `REPORT_SECTIONS` in `components/dashboard/exportReport.ts`, and the picker rule there stays covered by `components/dashboard/exportReport.test.ts`.
