#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node render-report.mjs <input.md> [--output <dir>]");
  }

  const inputPath = path.resolve(args.input);
  const source = await fs.readFile(inputPath, "utf8");
  const { meta, body } = parseFrontmatter(source);
  const config = normalizeConfig(meta, inputPath, args.output);
  const article = parseArticle(body);
  const blocks = parseBlocks(article.bodyText);
  if (!blocks.length) throw new Error("No report body blocks were parsed from input.");

  await fs.mkdir(config.outputDir, { recursive: true });

  const html = buildHtml(config, article, blocks);
  const reportPath = path.join(config.outputDir, "report.html");
  await fs.writeFile(reportPath, html, "utf8");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const warnings = [];
  const pageErrors = [];
  let report;
  let pageCount;
  try {
    const page = await browser.newPage({
      viewport: { width: 1180, height: 1520 },
      deviceScaleFactor: 1
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(pathToFileURL(reportPath).href, { waitUntil: "load" });
    await page.waitForFunction(() => window.__dailyReady === true, { timeout: 10000 });
    report = await collectReportMetrics(page);

    await page.addStyleTag({ content: `
      body { margin: 0 !important; background: transparent !important; }
      .toolbar { display: none !important; }
      .deck { display: block !important; padding: 0 !important; }
      .page { margin: 0 !important; box-shadow: none !important; }
    `});

    const pages = page.locator(".page");
    pageCount = await pages.count();
    for (let i = 0; i < pageCount; i += 1) {
      const suffix = i === 0 ? "cover" : `page-${String(i + 1).padStart(2, "0")}`;
      await pages.nth(i).screenshot({
        path: path.join(config.outputDir, `${String(i + 1).padStart(2, "0")}-${suffix}.png`)
      });
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    inputPath,
    outputDir: config.outputDir,
    config,
    article: {
      title: article.title,
      summary: article.summary
    },
    blocks: {
      count: blocks.length,
      types: blocks.reduce((acc, block) => {
        acc[block.type] = (acc[block.type] || 0) + 1;
        return acc;
      }, {})
    },
    toolchain: {
      node: process.version,
      command: `node ${__filename} ${process.argv.slice(2).join(" ")}`,
      playwrightBootstrap: process.env.DDC_PLAYWRIGHT_BOOTSTRAP === "1"
    },
    validationPreview: {
      consoleErrors: errors,
      consoleWarnings: warnings,
      pageErrors,
      report
    }
  };

  await fs.writeFile(path.join(config.outputDir, "render-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(path.join(config.outputDir, "process-and-params.md"), buildProcessMarkdown(manifest), "utf8");

  console.log(JSON.stringify({
    outputDir: config.outputDir,
    reportHtml: reportPath,
    pageCount,
    consoleErrors: errors.length,
    pageErrors: pageErrors.length,
    overflowCount: report.overflows.filter((item) => item.overflow).length,
    orphanFindingCount: report.pageEndings.filter((item) => item.orphanHeading || item.orphanLeadIn || item.whyWithoutHow).length
  }, null, 2));
}

function parseArgs(argv) {
  const args = { input: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--output") {
      args.output = argv[i + 1];
      i += 1;
    } else if (!args.input) {
      args.input = item;
    }
  }
  return args;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parts) continue;
    meta[parts[1]] = parseScalar(parts[2]);
  }
  return { meta, body: source.slice(match[0].length) };
}

function parseScalar(value) {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  return text;
}

function normalizeConfig(meta, inputPath, outputOverride) {
  const contentDate = String(meta.content_date || "");
  const outputName = sanitizeFileName(meta.output_name || (contentDate ? `daily-report-${contentDate}` : path.basename(inputPath, path.extname(inputPath))));
  const outputDir = path.resolve(process.cwd(), outputOverride || meta.output_dir || path.join("output", outputName));
  return {
    accountName: String(meta.account_name || "每日资讯账号"),
    douyinId: String(meta.douyin_id || "public-demo-id"),
    contentDate,
    coverDate: String(meta.cover_date || contentDate.replaceAll("-", ".")),
    coverTitle: String(meta.cover_title || "每日资讯简报来了"),
    outputName,
    outputDir,
    template: String(meta.template || "public-safe-gradient"),
    canvas: "1080x1440"
  };
}

function sanitizeFileName(value) {
  const sanitized = String(value)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized || /^\.+$/u.test(sanitized)) return "daily-report";
  return sanitized;
}

function parseArticle(body) {
  const lines = body.split(/\r?\n/);
  let title = "";
  let summary = "";
  let inBody = false;
  const bodyLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inBody) bodyLines.push("");
      continue;
    }
    const titleMatch = line.match(/^标题[：:]\s*(.+)$/);
    if (!inBody && titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }
    const summaryMatch = line.match(/^摘要[：:]\s*(.+)$/);
    if (!inBody && summaryMatch) {
      summary = summaryMatch[1].trim();
      continue;
    }
    if (/^正文[：:]?\s*$/.test(line)) {
      inBody = true;
      continue;
    }
    if (inBody) bodyLines.push(line);
  }

  return {
    title,
    summary,
    bodyText: (bodyLines.length ? bodyLines : lines).join("\n")
  };
}

function parseBlocks(bodyText) {
  const blocks = [];
  let currentSection = "";
  let emittedFocusQuote = false;
  for (const rawLine of bodyText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const bracketSection = line.match(/^【(.+?)】$/);
    const starSection = line.match(/^✦\s*(.+)$/);
    if (bracketSection || starSection) {
      currentSection = (bracketSection ? bracketSection[1] : starSection[1]).trim();
      blocks.push({ type: "section", text: currentSection });
      continue;
    }

    const keywordMatch = line.match(/^关键词(?:总结)?[：:]\s*(.+)$/);
    if (keywordMatch) {
      if (!currentSection.includes("关键词")) {
        currentSection = "关键词总结";
        blocks.push({ type: "section", text: currentSection });
      }
      blocks.push({ type: "keywords", words: splitKeywords(keywordMatch[1]) });
      continue;
    }

    if (currentSection.includes("关键词") && /[｜|、,，]\s*/.test(line) && line.length <= 80) {
      blocks.push({ type: "keywords", words: splitKeywords(line) });
      continue;
    }

    const bullet = line.match(/^[-*•]\s*(.+)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1].trim() });
      continue;
    }

    if (isSubhead(line)) {
      blocks.push({ type: "subhead", text: line });
      continue;
    }

    if (currentSection.includes("关键词") && /[？?]/.test(line)) {
      blocks.push({ type: "quote", text: line });
      continue;
    }

    if (currentSection === "今日核心焦点" && !emittedFocusQuote) {
      blocks.push({ type: "quote", text: line });
      emittedFocusQuote = true;
      continue;
    }

    blocks.push({ type: "p", text: line });
  }
  return blocks;
}

function splitKeywords(text) {
  return text
    .split(/[｜|、,，\s]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function isSubhead(line) {
  if (line.length > 26) return false;
  if (/^(为什么现在做|怎么做)[：:]/.test(line)) return false;
  if (/[。！？；;：:]$/.test(line)) return false;
  if (/^[0-9]+[.、]/.test(line)) return false;
  if (line.includes("，") || line.includes(",")) return false;
  return true;
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    if (process.env.DDC_PLAYWRIGHT_BOOTSTRAP === "1") throw error;
    const cmd = `NODE_PATH="$(dirname "$(dirname "$(which playwright)")")" node ${shellQuote(__filename)} ${process.argv.slice(2).map(shellQuote).join(" ")}`;
    const result = spawnSync("npm", ["exec", "--yes", "--package=playwright@latest", "--", "sh", "-lc", cmd], {
      stdio: "inherit",
      env: { ...process.env, DDC_PLAYWRIGHT_BOOTSTRAP: "1" }
    });
    process.exit(result.status ?? 1);
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildHtml(config, article, blocks) {
  const data = JSON.stringify(blocks).replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:,">
  <title>${escapeHtml(article.title || config.outputName)}</title>
  <style>
    :root {
      --page-w: 1080px;
      --page-h: 1440px;
      --ink: #10233d;
      --blue: #0f55d8;
      --blue-bright: #2378ff;
      --cyan: #65e7ff;
      --gold: #ffd15a;
      --paper: #f7fbff;
      --font-title: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
      --font-code: "Menlo", "Consolas", monospace;
      --account-x: 81px;
      --account-y: 108px;
      --account-size: 40px;
      --title-x: 113px;
      --title-y: 368px;
      --title-size: 78px;
      --date-x: 328px;
      --date-y: 708px;
      --date-size: 58px;
      --id-x: 691px;
      --id-y: 1312px;
      --id-size: 24px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #172238; font-family: var(--font-title); color: var(--ink); }
    .toolbar { position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; gap: 20px; padding: 16px 24px; color: #eaf6ff; background: rgba(7,18,34,.94); border-bottom: 1px solid rgba(255,255,255,.12); font-size: 14px; }
    .toolbar strong { font-size: 18px; }
    .toolbar code { color: #bdeeff; font-family: var(--font-code); }
    .deck { display: grid; justify-content: center; gap: 28px; padding: 28px; }
    .page { position: relative; width: var(--page-w); height: var(--page-h); overflow: hidden; background-size: cover; background-position: center; box-shadow: 0 26px 70px rgba(0,0,0,.28); isolation: isolate; }
    .page::before { content: ""; position: absolute; inset: 0; background: linear-gradient(112deg, transparent 0 21%, rgba(35,120,255,.05) 21% 22%, transparent 22% 100%), linear-gradient(90deg, rgba(35,120,255,.055) 1px, transparent 1px), linear-gradient(rgba(35,120,255,.045) 1px, transparent 1px); background-size: auto, 88px 88px, 88px 88px; pointer-events: none; }
    .page::after { content: ""; position: absolute; inset: 46px; border: 2px solid rgba(35,120,255,.17); border-radius: 42px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.76), 0 0 42px rgba(101,231,255,.18); pointer-events: none; }
    .cover { background: radial-gradient(circle at 88% 38%, rgba(101,231,255,.28), transparent 32%), radial-gradient(circle at 8% 86%, rgba(255,209,90,.23), transparent 27%), linear-gradient(180deg, #fff 0%, #f8fcff 48%, #eef8ff 100%); }
    .content-page { background: radial-gradient(circle at 86% 20%, rgba(101,231,255,.2), transparent 28%), radial-gradient(circle at 8% 82%, rgba(255,209,90,.16), transparent 24%), linear-gradient(180deg, #ffffff 0%, #f8fcff 48%, #eef8ff 100%); }
    .content-page::before { background: linear-gradient(112deg, transparent 0 21%, rgba(35,120,255,.055) 21% 22%, transparent 22% 100%), radial-gradient(circle at 16% 16%, rgba(35,120,255,.08) 0 2px, transparent 3px), linear-gradient(90deg, rgba(35,120,255,.055) 1px, transparent 1px), linear-gradient(rgba(35,120,255,.045) 1px, transparent 1px); background-size: auto, 42px 42px, 88px 88px, 88px 88px; }
    .orb, .signal-band, .corner-chip, .stage-card, .mini-feed, .cover-note, .neutral-geometry, .account-name, .profile-id, .main-title, .date-line { position: absolute; }
    .orb { border-radius: 999px; filter: blur(2px); opacity: .9; pointer-events: none; }
    .orb.one { width: 680px; height: 680px; right: -260px; top: 152px; background: radial-gradient(circle, rgba(101,231,255,.35), transparent 68%); }
    .orb.two { width: 470px; height: 470px; left: -210px; bottom: 134px; background: radial-gradient(circle, rgba(255,209,90,.22), transparent 70%); }
    .signal-band { z-index: 2; left: -150px; top: 238px; width: 1380px; height: 92px; transform: rotate(-8deg); background: linear-gradient(90deg, transparent, rgba(35,120,255,.08), transparent), repeating-linear-gradient(90deg, rgba(35,120,255,.16) 0 10px, transparent 10px 44px); opacity: .72; }
    .corner-chip { z-index: 3; right: 80px; top: 86px; display: inline-flex; align-items: center; gap: 12px; padding: 12px 18px; border: 1px solid rgba(35,120,255,.2); border-radius: 999px; color: rgba(16,35,61,.64); background: rgba(255,255,255,.72); box-shadow: 0 18px 44px rgba(35,120,255,.1); font-family: var(--font-code); font-size: 18px; font-weight: 900; letter-spacing: .12em; }
    .corner-chip::before { content: ""; width: 12px; height: 12px; border-radius: 999px; background: var(--gold); box-shadow: 0 0 18px rgba(255,209,90,.7); }
    .stage-card { z-index: 4; left: 76px; right: 76px; top: 224px; bottom: 142px; border: 2px solid rgba(35,120,255,.17); border-radius: 56px; background: linear-gradient(135deg, rgba(255,255,255,.93), rgba(241,249,255,.78)), radial-gradient(circle at 78% 46%, rgba(101,231,255,.24), transparent 38%); box-shadow: 0 32px 72px rgba(35,120,255,.13), inset 0 0 0 12px rgba(255,255,255,.44); }
    .stage-card::before { content: ""; position: absolute; inset: 44px; border: 2px dashed rgba(35,120,255,.18); border-radius: 38px; }
    .stage-card::after { content: "PUBLIC DAILY / SIGNAL BRIEF"; position: absolute; left: 54px; top: 46px; color: rgba(35,120,255,.32); font-family: var(--font-code); font-size: 18px; font-weight: 900; letter-spacing: .18em; }
    .mini-feed { z-index: 5; left: 128px; top: 830px; display: grid; gap: 18px; width: 260px; opacity: .62; }
    .mini-feed i { display: block; height: 16px; border-radius: 999px; background: linear-gradient(90deg, rgba(35,120,255,.22), rgba(101,231,255,.02)); }
    .mini-feed i:nth-child(2) { width: 74%; }
    .mini-feed i:nth-child(3) { width: 52%; }
    .neutral-geometry { z-index: 7; right: -74px; bottom: 106px; width: 590px; height: 590px; border-radius: 46% 54% 50% 50%; background: radial-gradient(circle at 38% 34%, rgba(255,255,255,.94) 0 9%, transparent 10%), radial-gradient(circle at 62% 34%, rgba(255,255,255,.94) 0 9%, transparent 10%), radial-gradient(circle at 52% 58%, rgba(16,35,61,.14) 0 13%, transparent 14%), conic-gradient(from 218deg at 50% 50%, rgba(35,120,255,.96), rgba(101,231,255,.88), rgba(255,209,90,.84), rgba(35,120,255,.96)); box-shadow: 0 42px 48px rgba(7,32,75,.24), inset 0 0 0 18px rgba(255,255,255,.36); transform: rotate(-10deg); pointer-events: none; }
    .neutral-geometry::before { content: ""; position: absolute; left: 86px; top: 74px; width: 420px; height: 420px; border-radius: 42% 58% 44% 56%; border: 4px dashed rgba(255,255,255,.72); transform: rotate(22deg); }
    .neutral-geometry::after { content: ""; position: absolute; right: 54px; bottom: 86px; width: 156px; height: 156px; border-radius: 36px; background: linear-gradient(135deg, rgba(255,255,255,.86), rgba(255,255,255,.2)); box-shadow: -238px -212px 0 -46px rgba(255,255,255,.5), -310px 32px 0 -54px rgba(255,255,255,.36); }
    .cover-note { z-index: 8; left: 86px; bottom: 82px; width: 540px; padding: 20px 26px; border-radius: 28px; color: rgba(234,246,255,.9); background: linear-gradient(135deg, #122846, #183e70); box-shadow: 0 18px 42px rgba(16,35,61,.18); font-size: 24px; font-weight: 800; }
    .account-name { z-index: 9; left: var(--account-x); top: var(--account-y); display: inline-flex; align-items: center; gap: 14px; font-size: var(--account-size); font-weight: 800; letter-spacing: -.02em; color: var(--ink); text-shadow: 0 8px 26px rgba(35,120,255,.14); }
    .account-name::before { content: ""; width: 38px; height: 14px; border-radius: 999px; background: linear-gradient(90deg, var(--blue-bright), var(--cyan)); box-shadow: 0 0 24px rgba(101,231,255,.72); }
    .profile-id { z-index: 9; left: var(--id-x); top: var(--id-y); display: inline-flex; align-items: center; gap: 10px; max-width: 360px; padding: 12px 18px; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #0f223d, #183e70); box-shadow: 0 18px 42px rgba(16,35,61,.24), inset 0 0 0 1px rgba(255,255,255,.1); font-family: var(--font-code); font-size: var(--id-size); letter-spacing: .03em; white-space: nowrap; }
    .main-title { z-index: 9; left: var(--title-x); top: var(--title-y); width: 850px; color: var(--ink); font-size: var(--title-size); font-weight: 800; line-height: 1.08; letter-spacing: -.03em; text-align: center; text-wrap: balance; text-shadow: 6px 8px 0 rgba(101,231,255,.38), 0 20px 42px rgba(16,35,61,.12); }
    .date-line { z-index: 9; left: var(--date-x); top: var(--date-y); min-width: 440px; padding: 24px 34px; border: 3px solid rgba(35,120,255,.22); border-radius: 26px; color: var(--blue); background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(244,250,255,.86)), var(--paper); box-shadow: 0 20px 54px rgba(35,120,255,.17), inset 0 -8px 20px rgba(35,120,255,.05); font-family: var(--font-code); font-size: var(--date-size); font-weight: 900; letter-spacing: .06em; text-align: center; }
    .page-content { position: absolute; left: 126px; top: 228px; width: 828px; height: 948px; overflow: hidden; z-index: 5; }
    .page-kicker { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 26px; padding: 12px 22px; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #12305a, #1b61d8); box-shadow: 0 12px 30px rgba(35,120,255,.18); font-size: 34px; font-weight: 900; letter-spacing: -.03em; }
    .page-kicker::before { content: ""; width: 10px; height: 10px; border-radius: 999px; background: var(--cyan); box-shadow: 0 0 16px rgba(101,231,255,.8); }
    .block { margin: 0 0 20px; }
    .subhead { display: flex; align-items: center; gap: 12px; margin: 28px 0 14px; color: var(--blue); font-size: 34px; line-height: 1.18; font-weight: 900; letter-spacing: -.03em; }
    .subhead::before { content: ""; flex: 0 0 auto; width: 18px; height: 18px; border-radius: 6px; background: linear-gradient(135deg, var(--blue), var(--cyan)); box-shadow: 0 0 18px rgba(101,231,255,.45); }
    .para, .bullet { color: rgba(16,35,61,.9); font-size: 31px; line-height: 1.54; font-weight: 650; letter-spacing: -.018em; text-align: left; }
    .bullet { position: relative; padding-left: 34px; }
    .bullet::before { content: ""; position: absolute; left: 6px; top: 19px; width: 10px; height: 10px; border-radius: 999px; background: var(--blue); box-shadow: 0 0 16px rgba(35,120,255,.4); }
    .quote { padding: 22px 24px; border-left: 8px solid var(--blue); border-radius: 22px; color: rgba(16,35,61,.94); background: rgba(255,255,255,.62); box-shadow: 0 14px 38px rgba(35,120,255,.1); font-size: 32px; line-height: 1.5; font-weight: 800; letter-spacing: -.02em; }
    .keyword-list { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 20px; }
    .keyword-list span { padding: 12px 18px; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #12305a, #1b61d8); font-size: 26px; font-weight: 900; }
    .page-number { position: absolute; left: 126px; bottom: 76px; z-index: 6; display: inline-flex; align-items: center; gap: 12px; padding: 9px 16px; border-radius: 999px; color: rgba(16,35,61,.62); background: rgba(255,255,255,.58); border: 1px solid rgba(35,120,255,.12); font-family: var(--font-code); font-size: 18px; font-weight: 900; letter-spacing: .06em; }
    .page-number::before { content: "PAGE"; color: rgba(35,120,255,.52); }
    #measure { position: absolute; left: -2000px; top: 0; width: 828px; visibility: hidden; pointer-events: none; }
    @media (max-width: 1180px) { .deck { justify-content: start; overflow-x: auto; } }
  </style>
</head>
<body>
  <header class="toolbar">
    <strong>${escapeHtml(article.title || config.outputName)}</strong>
    <span>目标尺寸 <code>1080×1440</code>，导出前请以 PNG 文件为准</span>
  </header>
  <main class="deck" id="deck">
    <section class="page cover" data-export-name="page-01-cover">
      <div class="orb one"></div>
      <div class="orb two"></div>
      <div class="signal-band"></div>
      <div class="corner-chip">DAILY INTEL</div>
      <div class="stage-card"></div>
      <div class="mini-feed"><i></i><i></i><i></i></div>
      <div class="account-name">${escapeHtml(config.accountName)}</div>
      <div class="main-title">${escapeHtml(config.coverTitle)}</div>
      <div class="date-line">${escapeHtml(config.coverDate)}</div>
      <div class="neutral-geometry" aria-hidden="true"></div>
      <div class="cover-note">每日新闻整理 · 非官方资讯</div>
      <div class="profile-id">ID ${escapeHtml(config.douyinId)}</div>
    </section>
  </main>
  <div id="measure" aria-hidden="true"></div>
  <script>
    const reportBlocks = ${data};
    function blockNode(block) {
      const node = document.createElement("div");
      node.dataset.blockType = block.type;
      if (block.type === "section") {
        node.className = "block section";
        node.innerHTML = \`<div class="page-kicker">\${escapeHtml(block.text)}</div>\`;
      } else if (block.type === "subhead") {
        node.className = "block subhead";
        node.textContent = block.text;
      } else if (block.type === "keywords") {
        node.className = "block keyword-list";
        block.words.forEach(word => {
          const span = document.createElement("span");
          span.textContent = word;
          node.appendChild(span);
        });
      } else if (block.type === "bullet") {
        node.className = "block bullet";
        node.textContent = block.text;
      } else if (block.type === "quote") {
        node.className = "block quote";
        node.textContent = block.text;
      } else {
        node.className = "block para";
        node.textContent = block.text;
      }
      return node;
    }
    function escapeHtml(text) {
      return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }
    function makeContentPage(blocks, pageIndex) {
      const page = document.createElement("section");
      page.className = "page content-page";
      page.dataset.exportName = \`page-\${String(pageIndex).padStart(2, "0")}\`;
      const content = document.createElement("div");
      content.className = "page-content";
      blocks.forEach(block => content.appendChild(blockNode(block)));
      const number = document.createElement("div");
      number.className = "page-number";
      number.textContent = String(pageIndex).padStart(2, "0");
      page.append(content, number);
      return page;
    }
    function makeMeasureContent(blocks) {
      const measure = document.getElementById("measure");
      measure.innerHTML = "";
      blocks.forEach(block => measure.appendChild(blockNode(block)));
      return measure.scrollHeight;
    }
    function paginationUnits(blocks) {
      const units = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const unit = [block];
        if ((block.type === "section" || block.type === "subhead") && blocks[i + 1]) {
          unit.push(blocks[i + 1]);
          i += 1;
          if (unit[1].type === "subhead" && blocks[i + 1]) {
            unit.push(blocks[i + 1]);
            i += 1;
          }
          if (shouldBindWhyHow(unit.at(-1), blocks[i + 1])) {
            unit.push(blocks[i + 1]);
            i += 1;
          }
        } else if (shouldBindWhyHow(block, blocks[i + 1])) {
          unit.push(blocks[i + 1]);
          i += 1;
        } else if (block.type === "p" && /[：:]$/.test(block.text.trim()) && blocks[i + 1]) {
          unit.push(blocks[i + 1]);
          i += 1;
        }
        units.push(unit);
      }
      return units;
    }
    function shouldBindWhyHow(current, next) {
      return current && next && current.type === "p" && next.type === "p" && current.text.startsWith("为什么现在做：") && next.text.startsWith("怎么做：");
    }
    function paginate(blocks) {
      const pages = [];
      let current = [];
      const maxHeight = 948;
      for (const unit of paginationUnits(blocks)) {
        const candidate = [...current, ...unit];
        const unitHeight = makeMeasureContent(unit);
        if (current.length > 0 && makeMeasureContent(candidate) > maxHeight) {
          pages.push(current);
          current = [...unit];
        } else if (current.length === 0 && unitHeight > maxHeight) {
          current = [...unit];
        } else {
          current = candidate;
        }
      }
      if (current.length) pages.push(current);
      return pages;
    }
    function render() {
      const deck = document.getElementById("deck");
      const pages = paginate(reportBlocks);
      pages.forEach((blocks, index) => deck.appendChild(makeContentPage(blocks, index + 2)));
      const allPages = Array.from(document.querySelectorAll(".page"));
      const total = allPages.length;
      allPages.forEach((page, index) => {
        page.dataset.index = String(index + 1);
        page.dataset.total = String(total);
        const number = page.querySelector(".page-number");
        if (number) number.textContent = \`\${String(index + 1).padStart(2, "0")} / \${String(total).padStart(2, "0")}\`;
      });
      document.getElementById("measure").innerHTML = "";
      window.__dailyReady = true;
      window.__dailyPageCount = total;
    }
    render();
  </script>
</body>
</html>`;
}

async function collectReportMetrics(page) {
  return await page.evaluate(() => {
    const pages = [...document.querySelectorAll(".page")];
    const contentPages = [...document.querySelectorAll(".content-page")];
    const coverText = document.querySelector(".cover")?.innerText || "";
    return {
      pageCount: pages.length,
      pageSizes: pages.map((p) => ({ width: p.offsetWidth, height: p.offsetHeight })),
      hasDailyNewsText: document.body.innerText.includes("DAILY NEWS"),
      coverHasExtraSummary: /今日摘要|关键词/.test(coverText),
      measureEmpty: document.getElementById("measure").innerHTML.trim() === "",
      overflows: contentPages.map((p, i) => {
        const c = p.querySelector(".page-content");
        return {
          page: i + 2,
          scrollHeight: c.scrollHeight,
          clientHeight: c.clientHeight,
          overflow: c.scrollHeight > c.clientHeight + 1
        };
      }),
      pageEndings: contentPages.map((p, i) => {
        const blocks = [...p.querySelectorAll(".page-content > .block")];
        const last = blocks.at(-1);
        const lastText = last?.innerText?.trim() || "";
        return {
          page: i + 2,
          lastType: last?.dataset.blockType || null,
          lastText: lastText.slice(0, 120),
          orphanHeading: ["section", "subhead"].includes(last?.dataset.blockType),
          orphanLeadIn: /[：:]$/.test(lastText),
          whyWithoutHow: lastText.startsWith("为什么现在做：")
        };
      })
    };
  });
}

function buildProcessMarkdown(manifest) {
  const report = manifest.validationPreview.report;
  const overflowCount = report.overflows.filter((item) => item.overflow).length;
  const orphanCount = report.pageEndings.filter((item) => item.orphanHeading || item.orphanLeadIn || item.whyWithoutHow).length;
  return `# Image Card Process And Params

## Input

- Input file: \`${manifest.inputPath}\`
- Output directory: \`${manifest.outputDir}\`
- Template: \`${manifest.config.template}\`
- Content date: \`${manifest.config.contentDate}\`
- Cover date: \`${manifest.config.coverDate}\`

## Canvas

- Format: Short-form image-card post
- Size: \`1080 x 1440 px\`
- Content area: \`left 126px / top 228px / width 828px / height 948px\`
- Body font: \`31px / line-height 1.54 / font-weight 650\`

## Toolchain

- Node: \`${manifest.toolchain.node}\`
- Command: \`${manifest.toolchain.command}\`
- Playwright bootstrap via npm: \`${manifest.toolchain.playwrightBootstrap}\`

## Render Result

- Page count: \`${report.pageCount}\`
- Console errors: \`${manifest.validationPreview.consoleErrors.length}\`
- Page errors: \`${manifest.validationPreview.pageErrors.length}\`
- Overflow count: \`${overflowCount}\`
- Orphan finding count: \`${orphanCount}\`
- DAILY NEWS visible text: \`${report.hasDailyNewsText}\`
- Cover extra summary/keywords: \`${report.coverHasExtraSummary}\`

## Required Next Step

Run \`validate-report.mjs\` on this output directory before declaring completion.
`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
