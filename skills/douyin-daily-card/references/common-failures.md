# Common Failures

## Cover Becomes A Content Page

Symptom: the cover contains summary cards, keywords, or article excerpts.

Fix: keep the cover as account + title + date + template art. Put article content only on content pages.

## `DAILY NEWS` Remains

Symptom: content pages show an English decoration instead of the Chinese section title.

Fix: render `section` blocks as Chinese section chips.

## Heading Split Across Pages

Symptom: a heading appears at the bottom of one page and its paragraph starts on the next page.

Fix: apply the binding rules in `pagination-rules.md` and accept whitespace.

## Hidden Overflow

Symptom: screenshots look generated, but text is clipped by `overflow: hidden`.

Fix: compare `scrollHeight` and `clientHeight` for every `.page-content`.

## Date Confusion

Symptom: article date and cover date are accidentally made the same.

Fix: keep `content_date` and `cover_date` as separate input fields.

## No Process Record

Symptom: PNG files exist but there is no parameter or validation record.

Fix: rerun render and validation so `render-manifest.json`, `validation-report.json`, and `process-and-params.md` are generated.

