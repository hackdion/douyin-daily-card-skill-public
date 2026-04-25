# douyin-daily-card-skill

Public-safe Agent Skills package for generating fixed-size Chinese daily-report image cards from an existing article.

## Current Scope

- Input: one Markdown daily report with frontmatter.
- Output: fixed-size `1080 x 1440` PNG cards, `report.html`, `render-manifest.json`, and `process-and-params.md`.
- Workflow: render HTML, export PNG with Playwright/Chromium, validate dimensions and pagination risks.
- Default template: `public-safe-v1-white-tech`.
- Default output name: `generic-daily-report-YYYY-MM-DD`.
- Out of scope: news gathering, fact-checking, account research, channel publishing, or third-party template conversion.

## Public-Safe Example

The bundled example uses fictional community-announcement content. Replace the copy, dates, and account fields with content that you own or are allowed to publish.

## Local Validation

```bash
gh skill publish --dry-run
node skills/douyin-daily-card/scripts/render-report.mjs skills/douyin-daily-card/examples/2026-04-25-input.md --output /tmp/daily-card-skill-test
node skills/douyin-daily-card/scripts/validate-report.mjs /tmp/daily-card-skill-test
sips -g pixelWidth -g pixelHeight /tmp/daily-card-skill-test/[0-9][0-9]-*.png
```

## Publishing Policy

This package is intended to be safe for public documentation review. Before any formal release, verify that bundled assets, examples, generated outputs, and downstream usage rights are also public-safe.

Do not publish user data, private account identifiers, channel-specific credentials, or third-party brand material through this skill package.
