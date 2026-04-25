# Input Contract

Use one Markdown file per daily report. The file must start with YAML-like frontmatter, followed by the article text.

```markdown
---
account_name: 社区服务中心
account_id: "community-demo-001"
content_date: "2026-04-25"
cover_date: "2026.04.26"
cover_title: 社区公告日报来了
output_name: generic-daily-report-2026-04-25
template: public-safe-v1-white-tech
---

标题：社区公告日报来了｜4月25日
摘要：先看服务窗口，再处理报名和反馈。

正文：
【今日核心焦点】
本周末社区服务台开放，志愿者报名继续进行，场地维护提醒已经同步。
```

## Required Fields

- `account_name`: account name shown on cover and base template.
- `account_id`: optional public-safe account or project identifier shown on lower-right badge when supported by the renderer.
- `content_date`: factual article date. Keep this separate from cover date.
- `cover_date`: date printed on the cover.
- `cover_title`: fixed large cover title.
- `output_name`: output folder name under `output/` unless `output_dir` is provided.
- `template`: currently use `public-safe-v1-white-tech`.

## Optional Fields

- `output_dir`: absolute or workspace-relative output directory.
- `cover_params`: reserved for future JSON position overrides.
- `section_order`: reserved for future explicit section sorting.

## Body Parsing Rules

- `标题：` and `摘要：` are metadata for records and do not automatically appear on the cover.
- `【栏目名】` becomes a section block.
- Short standalone lines under a section become subheads.
- Lines beginning with `-`, `•`, or `*` become bullets.
- `关键词：A｜B｜C` becomes keyword chips.
- Normal lines become paragraphs.
