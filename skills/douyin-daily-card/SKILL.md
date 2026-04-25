---
name: douyin-daily-card
description: Use when an agent needs to turn existing Chinese daily-report text, a cover template, or a background template into fixed-size 3:4 image-card PNG deliverables for a public-safe daily report.
license: LicenseRef-All-Rights-Reserved
---

# Daily Report Card

## Overview

Use this skill to generate a complete image-card daily report from already-written copy. It is a production workflow, not a website mockup: create HTML only as the rendering surface, then export validated PNG files.

This skill does not gather news, fact-check events, write the article, or publish to any channel. Prepare and approve the source content before using this skill.

## Required Workflow

1. Read the input contract in `references/input-contract.md`.
2. Use the fixed public-safe layout in `references/layout-spec.md`.
3. Generate or update a report HTML with `scripts/render-report.mjs`.
4. Export PNG pages through Playwright/Chromium.
5. Validate the output with `scripts/validate-report.mjs`.
6. Report the output paths and validation evidence. Do not claim completion without fresh validation output.

## Hard Rules

- Do not turn the deliverable into a scrollable website. HTML is only the render source for fixed-size cards.
- Do not add summary cards, keyword chips, or body excerpts onto the cover unless the user explicitly asks.
- Do not keep `DAILY NEWS` as a content section label. Use Chinese section names from the article.
- Do not split a heading onto one page and its content onto the next. Leave whitespace instead.
- Do not modify original templates in place. Write generated files to the requested output directory.
- Do not put daily generated PNG files inside this skill directory.
- Always record the toolchain, commands, output files, and validation results.
- Keep examples and references public-safe: no real private account IDs, no channel-bound wording, and no third-party brand-specific copy.

## Standard Commands

From the repository root during local validation:

```bash
node skills/douyin-daily-card/scripts/render-report.mjs skills/douyin-daily-card/examples/2026-04-25-input.md
node skills/douyin-daily-card/scripts/validate-report.mjs output/generic-daily-report-2026-04-25
```

Use `--output <dir>` when testing or when the user gives a specific destination:

```bash
OUT_DIR="$(mktemp -d)"
node skills/douyin-daily-card/scripts/render-report.mjs input.md --output "$OUT_DIR"
```

Both scripts auto-bootstrap Playwright with `npm exec --package=playwright@latest` if Node cannot load Playwright directly.

## References

- Input schema: `references/input-contract.md`
- Visual constants: `references/layout-spec.md`
- Pagination rules: `references/pagination-rules.md`
- Toolchain and commands: `references/toolchain-and-commands.md`
- Acceptance checklist: `references/validation-checklist.md`
- Known failure modes: `references/common-failures.md`
