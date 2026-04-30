#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    results.push(await validateAssetCandidatePage(browser));
    results.push(await validateInteractiveEditor(browser));
  } finally {
    await browser.close();
  }

  const pass = results.every((result) => result.pass);
  const report = {
    validatedAt: new Date().toISOString(),
    repoRoot,
    results,
    pass
  };

  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(1);
}

async function validateAssetCandidatePage(browser) {
  const filePath = path.join(repoRoot, "工具", "素材候选预览页.html");
  const page = await newInstrumentedPage(browser);
  await page.goto(pathToFileURL(filePath).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".candidate", { timeout: 10000 });

  const initial = await page.evaluate(() => ({
    candidates: document.querySelectorAll(".candidate").length,
    directions: document.querySelectorAll(".direction").length,
    resultText: document.querySelector("#resultCount")?.textContent || ""
  }));

  await page.locator("#categoryChips .chip", { hasText: "游戏" }).click();
  const gameText = await page.locator("#resultCount").textContent();

  await page.locator("#categoryChips .chip", { hasText: "全部" }).click();
  await page.locator("#searchInput").fill("NASA");
  const searchText = await page.locator("#resultCount").textContent();
  const searchCards = await page.locator(".candidate h3").allTextContents();

  await page.locator("button.pick").first().click();
  const selectedCount = await page.evaluate(() => JSON.parse(document.querySelector("#selectionOutput").textContent).length);

  await page.locator("#clearSelectionBtn").click();
  const clearCount = await page.evaluate(() => JSON.parse(document.querySelector("#selectionOutput").textContent).length);

  const checks = [
    ["candidate-count", initial.candidates === 10, `${initial.candidates}`],
    ["direction-count", initial.directions === 4, `${initial.directions}`],
    ["initial-result", initial.resultText === "10 / 10 个候选", initial.resultText],
    ["category-filter", gameText === "3 / 10 个候选", gameText],
    ["search-filter", searchText === "1 / 10 个候选" && searchCards[0]?.includes("NASA"), `${searchText} ${searchCards.join("|")}`],
    ["selection-add", selectedCount === 1, `${selectedCount}`],
    ["selection-clear", clearCount === 0, `${clearCount}`],
    ["console-errors", page.consoleErrors.length === 0, JSON.stringify(page.consoleErrors)],
    ["page-errors", page.pageErrors.length === 0, JSON.stringify(page.pageErrors)]
  ];

  await page.close();
  return resultFor("素材候选预览页", filePath, checks);
}

async function validateInteractiveEditor(browser) {
  const filePath = path.join(repoRoot, "工具", "交互式封面底图编辑器.html");
  if (!fs.existsSync(filePath)) {
    return resultFor("交互式封面底图编辑器", filePath, [
      ["file-exists", false, "missing"]
    ]);
  }

  const page = await newInstrumentedPage(browser);
  await page.goto(pathToFileURL(filePath).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='card-canvas']", { timeout: 10000 });

  const initial = await page.evaluate(() => ({
    canvasWidth: document.querySelector("[data-testid='card-canvas']")?.offsetWidth || 0,
    canvasHeight: document.querySelector("[data-testid='card-canvas']")?.offsetHeight || 0,
    presetButtons: document.querySelectorAll("[data-preset]").length,
    roleButtons: document.querySelectorAll("[data-role]").length,
    rangeInputs: document.querySelectorAll("[data-testid='slider-panel'] input[type='range']").length,
    title: document.querySelector(".field[data-field='title']")?.textContent || "",
    exportText: document.querySelector("[data-testid='json-box']")?.value || ""
  }));

  await page.locator("[data-preset='sat']").click();
  await page.locator("[data-testid='mode-switch'] [data-mode='base']").click();
  await page.locator("#titleText").fill("公开演示日报标题");
  await page.locator("input[type='range'][data-field='title'][data-prop='size']").fill("88");
  await page.locator("[data-testid='export-json']").click();

  const after = await page.evaluate(() => {
    const payload = JSON.parse(document.querySelector("[data-testid='json-box']").value);
    return {
      title: document.querySelector(".field[data-field='title']")?.textContent || "",
      mode: payload.mode,
      preset: payload.preset,
      exportedTitle: payload.text.title,
      exportedMode: payload.mode,
      exportedTitleSize: payload.layout.title.size
    };
  });

  await page.locator("[data-testid='json-box']").fill(JSON.stringify({
    mode: "cover",
    preset: "mon",
    role: "star",
    text: {
      account: "演示账号",
      douyin: "demo-001",
      title: "导入参数成功",
      date: "2026.04.30",
      tag: "公开安全演示"
    },
    layout: {
      title: {
        size: 72
      }
    }
  }));
  await page.locator("[data-testid='import-json']").click();
  const importedTitle = await page.locator(".field[data-field='title']").textContent();

  const checks = [
    ["canvas-size", initial.canvasWidth === 1080 && initial.canvasHeight === 1440, `${initial.canvasWidth}x${initial.canvasHeight}`],
    ["preset-count", initial.presetButtons >= 7, `${initial.presetButtons}`],
    ["role-count", initial.roleButtons >= 3, `${initial.roleButtons}`],
    ["range-count", initial.rangeInputs >= 15, `${initial.rangeInputs}`],
    ["mode-switch", after.mode === "base", after.mode],
    ["preset-switch", after.preset === "sat", after.preset],
    ["text-edit", after.title === "公开演示日报标题", after.title],
    ["export-json", after.exportedTitle === "公开演示日报标题" && after.exportedMode === "base", JSON.stringify(after)],
    ["range-export", Number(after.exportedTitleSize) === 88, `${after.exportedTitleSize}`],
    ["import-json", importedTitle === "导入参数成功", importedTitle],
    ["console-errors", page.consoleErrors.length === 0, JSON.stringify(page.consoleErrors)],
    ["page-errors", page.pageErrors.length === 0, JSON.stringify(page.pageErrors)]
  ];

  await page.close();
  return resultFor("交互式封面底图编辑器", filePath, checks);
}

async function newInstrumentedPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  page.consoleErrors = [];
  page.pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") page.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => page.pageErrors.push(error.message));
  return page;
}

function resultFor(name, filePath, checks) {
  const normalizedChecks = checks.map(([check, pass, detail]) => ({ check, pass, detail }));
  return {
    name,
    filePath,
    checks: normalizedChecks,
    pass: normalizedChecks.every((item) => item.pass)
  };
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch (firstError) {
    if (process.env.DDC_PLAYWRIGHT_BOOTSTRAP === "0") throw firstError;

    const install = spawnSync("npm", ["exec", "--yes", "--package=playwright@latest", "--", "which", "playwright"], {
      encoding: "utf8"
    });
    if (install.status !== 0) {
      throw new Error(`Playwright is unavailable. npm exec output:\n${install.stderr || install.stdout}`);
    }

    const playwrightBin = install.stdout.trim();
    const moduleRoot = path.resolve(path.dirname(playwrightBin), "..");
    process.env.NODE_PATH = [moduleRoot, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    require("node:module").Module._initPaths();
    return require("playwright");
  }
}
