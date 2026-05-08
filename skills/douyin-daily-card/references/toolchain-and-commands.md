# Toolchain And Commands

## Required Tools

- `Node.js`: runs the scripts.
- `npm`: bootstraps Playwright when it is not installed locally.
- `Playwright/Chromium`: renders HTML and exports PNG screenshots.
- `sips`: optional macOS PNG dimension check.
- Local filesystem read/write permission.

## Optional Tools

- `browser-use/IAB`: preview the generated `report.html`.
- External design tools: second-phase template conversion only; do not block HTML/PNG generation on them.

## Standard Render

```bash
node skills/douyin-daily-card/scripts/render-report.mjs input.md
```

To avoid overwriting existing output during tests, pass an explicit destination:

```bash
OUT_DIR="$(mktemp -d)"
node skills/douyin-daily-card/scripts/render-report.mjs input.md --output "$OUT_DIR"
```

## Standard Validate

```bash
node skills/douyin-daily-card/scripts/validate-report.mjs output/generic-daily-report-YYYY-MM-DD
```

## Dimension Spot Check

```bash
sips -g pixelWidth -g pixelHeight output/generic-daily-report-YYYY-MM-DD/[0-9][0-9]-*.png
```

## Required Evidence

Every final report must include:

- exact commands run;
- output directory;
- PNG count;
- page dimensions;
- console/page error count;
- overflow count;
- orphan heading/lead-in count;
- whether `render-manifest.json` and `process-and-params.md` exist.

For template JSON output, also include:

- `template-render-manifest.json` path;
- `template-validation-report.json` path;
- whether PNG path stayed inside the output directory;
- manifest config validation result;
- render-time console/page error counts;
- validation-time console/page error counts;
- movable text field overflow count.
