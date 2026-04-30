---
name: douyin-daily-card
description: Use when an agent needs to turn existing Chinese text, a cover brief, or a background-template brief into fixed-size 3:4 Chinese image-card PNG deliverables, including modular cover/base templates and validated daily-report cards.
license: LicenseRef-All-Rights-Reserved
---

# 图文卡片 Skill / Daily Report Card

## Overview

Use this skill to generate fixed-size Chinese image cards from already-written copy or from a cover/base template brief. It is a production workflow, not a website mockup: create HTML only as the rendering surface, then export validated PNG files.

This skill does not gather news, fact-check events, write the article, or publish to any channel. Prepare and approve the source content before using this skill.

中文原则：对用户说明时优先使用中文；必要英文术语后面补中文解释，例如 `template registry（模板注册表）`。

## Required Workflow

1. Read the input contract in `references/input-contract.md`.
2. Use the fixed public-safe layout in `references/layout-spec.md`.
3. Generate or update a report HTML with `scripts/render-report.mjs`.
4. Export PNG pages through Playwright/Chromium.
5. Validate the output with `scripts/validate-report.mjs`.
6. Report the output paths and validation evidence. Do not claim completion without fresh validation output.

For modular cover/base work, also read these repository-level files before designing:

- `../../文档/03-模块化设计规范.md`
- `../../文档/04-模板配方规则.md`
- `../../文档/05-Agent使用流程.md`
- `../../数据/模块注册表.json`
- `../../数据/模板配方注册表.json`
- `../../文档/10-功能清单与公开化路线图.md` when checking whether a capability is public-ready or still private/local.

If the user asks to visually tune a cover/base template or adjust positions/font sizes by hand, use the public-safe editor `../../工具/交互式封面底图编辑器.html` as the preview surface first. Export its JSON parameters and keep them with the final process record.

## Hard Rules

- Do not turn the deliverable into a scrollable website. HTML is only the render source for fixed-size cards.
- Do not add summary cards, keyword chips, or body excerpts onto the cover unless the user explicitly asks.
- Do not keep `DAILY NEWS` as a content section label. Use Chinese section names from the article.
- Do not split a heading onto one page and its content onto the next. Leave whitespace instead.
- Do not modify original templates in place. Write generated files to the requested output directory.
- Do not put daily generated PNG files inside this skill directory.
- Always record the toolchain, commands, output files, and validation results.
- Keep examples and references public-safe: no real private account IDs, no channel-bound wording, and no third-party brand-specific copy.
- Do not use private IP assets in public examples. Use public-demo silhouettes, geometric placeholders, or user-provided private assets only in the user's private workspace.
- Do not auto-select templates whose registry status is `draft` or `beta`; use them only when the user explicitly asks for an experimental template.
- When collecting public assets, use `../../工具/素材候选预览页.html` and `../../数据/公开素材候选表.csv` as the review surface before downloading anything into the repository.
- Treat `../../工具/交互式封面底图编辑器.html` as beta: it is suitable for public-safe interactive exploration, but it is not yet a replacement for the validated PNG render scripts.

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

Validate public helper tools after editing `工具/` pages:

```bash
node scripts/validate-public-tools.mjs
```

## References

- Input schema: `references/input-contract.md`
- Visual constants: `references/layout-spec.md`
- Pagination rules: `references/pagination-rules.md`
- Toolchain and commands: `references/toolchain-and-commands.md`
- Acceptance checklist: `references/validation-checklist.md`
- Known failure modes: `references/common-failures.md`
