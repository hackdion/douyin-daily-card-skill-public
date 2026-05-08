# Validation Checklist

The output passes only when all items are true:

- PNG files exist and follow `[0-9][0-9]-*.png`.
- PNG count equals the rendered page count.
- Every PNG is `1080 x 1440`.
- `report.html` exists in the output directory.
- `render-manifest.json` exists in the output directory.
- `process-and-params.md` exists in the output directory.
- Playwright console errors: `0`.
- Playwright page errors: `0`.
- Content overflow count: `0`.
- `DAILY NEWS` visible text count: `0`.
- Cover extra `今日摘要` or `关键词` text count: `0`.
- Orphan `section`/`subhead` page endings: `0`.
- Orphan colon lead-in page endings: `0`.
- `为什么现在做：` without following `怎么做：` at page end: `0`.
- Measurement container is empty after render.

If any item fails, do not publish or claim completion. Fix the HTML/parser/pagination and rerun validation.

For interactive cover/base template output, these additional checks must pass:

- `template-render-manifest.json` exists.
- `template-validation-report.json` exists.
- PNG path stays inside the requested output directory.
- Manifest config uses allowed `mode`, `preset`, and `role` IDs only.
- Text fields are non-empty and no longer than `240` characters.
- Layout values are finite numbers inside script limits.
- Render-time console errors: `0`.
- Render-time page errors: `0`.
- Validation-time console errors: `0`.
- Validation-time page errors: `0`.
- Actual bounds of every movable text field stay inside the `1080 x 1440` canvas.
- Public-safe blocked-term findings: `0`.
