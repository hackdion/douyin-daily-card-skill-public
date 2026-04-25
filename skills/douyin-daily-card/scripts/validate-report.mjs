#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

async function main() {
  const outputDir = path.resolve(process.argv[2] || "");
  if (!process.argv[2]) throw new Error("Usage: node validate-report.mjs <output-dir>");
  const reportPath = path.join(outputDir, "report.html");
  const manifestPath = path.join(outputDir, "render-manifest.json");
  if (!fsSync.existsSync(reportPath)) throw new Error(`Missing report.html: ${reportPath}`);
  if (!fsSync.existsSync(manifestPath)) throw new Error(`Missing render-manifest.json: ${manifestPath}`);
  const reportSource = await fs.readFile(reportPath, "utf8");

  const pngFiles = (await fs.readdir(outputDir))
    .filter((file) => /^[0-9][0-9]-.*\.png$/.test(file))
    .sort();
  const dimensions = pngFiles.map((file) => {
    const fullPath = path.join(outputDir, file);
    return { file, ...readPngDimensions(fullPath) };
  });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 1520 }, deviceScaleFactor: 1 });
  const errors = [];
  const warnings = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto(pathToFileURL(reportPath).href, { waitUntil: "load" });
  await page.waitForFunction(() => window.__dailyReady === true, { timeout: 10000 });
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const report = await page.evaluate(() => {
    const pages = [...document.querySelectorAll(".page")];
    const contentPages = [...document.querySelectorAll(".content-page")];
    const coverText = document.querySelector(".cover")?.innerText || "";
    return {
      pageCount: pages.length,
      allPageSizesOk: pages.every((p) => p.offsetWidth === 1080 && p.offsetHeight === 1440),
      hasDailyNewsText: document.body.innerText.includes("DAILY NEWS"),
      coverHasExtraSummary: /今日摘要|关键词/.test(coverText),
      measureEmpty: document.getElementById("measure").innerHTML.trim() === "",
      overflowCount: contentPages.filter((p) => {
        const c = p.querySelector(".page-content");
        return c.scrollHeight > c.clientHeight + 1;
      }).length,
      orphanFindings: contentPages.map((p, i) => {
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
      }).filter((item) => item.orphanHeading || item.orphanLeadIn || item.whyWithoutHow)
    };
  });
  await browser.close();

  const publicBrandResidue = [
    ...findPublicBrandResidue("report.html source", reportSource),
    ...findPublicBrandResidue("body innerText", bodyText)
  ];

  const checks = [
    ["png-count", pngFiles.length === report.pageCount, `${pngFiles.length} png / ${report.pageCount} pages`],
    ["png-dimensions", dimensions.every((item) => item.width === 1080 && item.height === 1440), JSON.stringify(dimensions)],
    ["dom-page-size", report.allPageSizesOk, "all .page nodes are 1080x1440"],
    ["console-errors", errors.length === 0, `${errors.length}`],
    ["page-errors", pageErrors.length === 0, `${pageErrors.length}`],
    ["overflow", report.overflowCount === 0, `${report.overflowCount}`],
    ["daily-news-visible-text", !report.hasDailyNewsText, `${report.hasDailyNewsText}`],
    ["cover-extra-summary-keywords", !report.coverHasExtraSummary, `${report.coverHasExtraSummary}`],
    ["orphan-findings", report.orphanFindings.length === 0, JSON.stringify(report.orphanFindings)],
    ["public-brand-residue", publicBrandResidue.length === 0, JSON.stringify(publicBrandResidue)],
    ["measure-empty", report.measureEmpty, `${report.measureEmpty}`],
    ["process-record", fsSync.existsSync(path.join(outputDir, "process-and-params.md")), "process-and-params.md exists"]
  ].map(([name, pass, detail]) => ({ name, pass, detail }));

  const validation = {
    validatedAt: new Date().toISOString(),
    outputDir,
    pngFiles,
    dimensions,
    errors,
    warnings,
    pageErrors,
    publicBrandResidue,
    report,
    checks,
    pass: checks.every((check) => check.pass)
  };

  await fs.writeFile(path.join(outputDir, "validation-report.json"), JSON.stringify(validation, null, 2), "utf8");
  await appendValidationMarkdown(outputDir, validation);
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.pass) process.exit(1);
}

function readPngDimensions(filePath) {
  const buffer = fsSync.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`Not a PNG file: ${filePath}`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function appendValidationMarkdown(outputDir, validation) {
  const target = path.join(outputDir, "process-and-params.md");
  const existing = fsSync.existsSync(target)
    ? fsSync.readFileSync(target, "utf8").replace(/\n## Final Validation\n[\s\S]*$/u, "").trimEnd()
    : "";
  const lines = [
    "",
    "## Final Validation",
    "",
    `- Validated at: \`${validation.validatedAt}\``,
    `- PNG count: \`${validation.pngFiles.length}\``,
    `- Console errors: \`${validation.errors.length}\``,
    `- Page errors: \`${validation.pageErrors.length}\``,
    `- Overflow count: \`${validation.report.overflowCount}\``,
    `- Orphan findings: \`${validation.report.orphanFindings.length}\``,
    `- Public brand residue findings: \`${validation.publicBrandResidue.length}\``,
    `- Pass: \`${validation.pass}\``,
    ""
  ];
  await fs.writeFile(target, `${existing}${lines.join("\n")}`, "utf8");
}

function findPublicBrandResidue(source, text) {
  const blockedTerms = (process.env.DDC_BLOCKED_TERMS || "")
    .split(/[,，|]/)
    .map((term) => term.trim())
    .filter(Boolean);
  const findings = [];
  for (const term of blockedTerms) {
    const regex = new RegExp(escapeRegExp(term), "giu");
    const matches = [...String(text).matchAll(regex)];
    if (!matches.length) continue;
    findings.push({
      source,
      term,
      count: matches.length,
      snippets: matches.slice(0, 5).map((match) => {
        const start = Math.max(0, match.index - 36);
        const end = Math.min(text.length, match.index + term.length + 36);
        return String(text).slice(start, end).replace(/\s+/g, " ").trim();
      })
    });
  }
  return findings;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
