# Pagination Rules

Pagination prioritizes reading continuity over filling every page.

## Binding Rules

- `section` must not appear as the final block on a page.
- `subhead` must not appear as the final block on a page.
- If a `section` is immediately followed by a `subhead`, keep the section, subhead, and first content block together when possible.
- If a paragraph ends with `：` or `:`, keep it with the next block.
- If a paragraph starts with `为什么现在做：`, keep it with the following `怎么做：` paragraph when possible.

## Overflow Rules

- Use a hidden measurement container before committing blocks to a page.
- Page content height must not exceed `948px`.
- If a page has unused space after applying binding rules, keep the whitespace.
- After render, clear the measurement container so validation can confirm it is empty.

## Failure Examples

- Bad: page ends with `今天优先做的事`; next page starts with `先确认服务窗口`.
- Bad: page ends with `公告说明里，现在比较常见的问题是：`; next page starts with bullets.
- Bad: page ends with `为什么现在做：...`; next page starts with `怎么做：...`.
