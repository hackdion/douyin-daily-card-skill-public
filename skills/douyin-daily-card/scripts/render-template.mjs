#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const require = createRequire(import.meta.url);
const ALLOWED_MODES = new Set(["cover", "base"]);
const ALLOWED_PRESETS = new Set(["morning", "noon", "night", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const ALLOWED_ROLES = new Set(["robot", "star", "sprite", "boxbot"]);
const FIELD_LIMITS = {
  account: { x: [0, 980], y: [0, 1360], size: [16, 160] },
  title: { x: [0, 980], y: [0, 1360], size: [16, 160] },
  date: { x: [0, 980], y: [0, 1360], size: [16, 160] },
  douyin: { x: [0, 980], y: [0, 1360], size: [16, 160] },
  tag: { x: [0, 980], y: [0, 1360], size: [16, 160] }
};

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node skills/douyin-daily-card/scripts/render-template.mjs <config.json> [--output <dir>]");
  }

  const inputPath = path.resolve(args.input);
  const config = normalizeConfig(JSON.parse(await fs.readFile(inputPath, "utf8")), inputPath, args.output);
  await fs.mkdir(config.outputDir, { recursive: true });

  const editorPath = path.join(repoRoot, "工具", "交互式封面底图编辑器.html");
  if (!fsSync.existsSync(editorPath)) throw new Error(`Missing editor HTML: ${editorPath}`);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];
  let metrics;
  let reportHtml;
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(pathToFileURL(editorPath).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='card-canvas']", { timeout: 10000 });
    await importConfig(page, config.renderState);
    await prepareCanvasForExport(page);

    const canvas = page.locator("[data-testid='card-canvas']");
    await canvas.screenshot({ path: path.join(config.outputDir, config.pngName) });

    metrics = await page.evaluate(() => {
      const canvas = document.querySelector("[data-testid='card-canvas']");
      const rect = canvas.getBoundingClientRect();
      return {
        canvasWidth: canvas.offsetWidth,
        canvasHeight: canvas.offsetHeight,
        boundingWidth: Math.round(rect.width),
        boundingHeight: Math.round(rect.height),
        mode: canvas.className,
        bodyText: document.body.innerText
      };
    });

    await page.evaluate(() => {
      document.querySelectorAll("script").forEach((script) => script.remove());
    });
    reportHtml = await page.content();
  } finally {
    await browser.close();
  }
  await fs.writeFile(path.join(config.outputDir, "template-render-source.html"), reportHtml, "utf8");

  const manifest = {
    generatedAt: new Date().toISOString(),
    inputPath,
    outputDir: config.outputDir,
    outputPng: path.join(config.outputDir, config.pngName),
    config: config.renderState,
    files: {
      png: config.pngName,
      html: "template-render-source.html",
      manifest: "template-render-manifest.json",
      process: "process-and-params.md"
    },
    toolchain: {
      node: process.version,
      command: `node ${__filename} ${process.argv.slice(2).join(" ")}`
    },
    validationPreview: {
      consoleErrors,
      pageErrors,
      metrics
    }
  };

  await fs.writeFile(path.join(config.outputDir, "template-render-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(path.join(config.outputDir, "process-and-params.md"), buildProcessMarkdown(manifest), "utf8");

  console.log(JSON.stringify({
    outputDir: config.outputDir,
    outputPng: manifest.outputPng,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    canvas: `${metrics.canvasWidth}x${metrics.canvasHeight}`
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

function normalizeConfig(rawConfig, inputPath, outputOverride) {
  const renderState = validateRenderState(mergeState(defaultState(), rawConfig));
  const outputName = sanitizeFileName(rawConfig.outputName || `${renderState.preset}-${renderState.mode}-template`);
  const outputDir = resolveOutputDir(outputOverride, rawConfig.outputDir, outputName);
  const pngName = `${safeFilePart(renderState.mode)}-${safeFilePart(renderState.preset)}-${safeFilePart(renderState.role)}.png`;
  return {
    inputPath,
    outputName,
    outputDir,
    pngName,
    renderState
  };
}

function defaultState() {
  return {
    mode: "cover",
    preset: "morning",
    role: "robot",
    text: {
      account: "演示日报研究所",
      douyin: "抖音号：public-safe-demo",
      title: "今日冒险情报",
      date: "2026.05.04",
      tag: "公开安全演示"
    },
    layout: {
      account: { x: 78, y: 126, size: 46 },
      title: { x: 76, y: 330, size: 118 },
      date: { x: 82, y: 260, size: 34 },
      douyin: { x: 80, y: 1246, size: 30 },
      tag: { x: 78, y: 1082, size: 34 }
    }
  };
}

function mergeState(base, incoming) {
  return {
    ...base,
    ...incoming,
    text: { ...base.text, ...(incoming.text || {}) },
    layout: {
      account: { ...base.layout.account, ...(incoming.layout?.account || {}) },
      title: { ...base.layout.title, ...(incoming.layout?.title || {}) },
      date: { ...base.layout.date, ...(incoming.layout?.date || {}) },
      douyin: { ...base.layout.douyin, ...(incoming.layout?.douyin || {}) },
      tag: { ...base.layout.tag, ...(incoming.layout?.tag || {}) }
    }
  };
}

function validateRenderState(renderState) {
  if (!ALLOWED_MODES.has(renderState.mode)) {
    throw new Error(`Invalid mode: ${renderState.mode}. Allowed: ${[...ALLOWED_MODES].join(", ")}`);
  }
  if (!ALLOWED_PRESETS.has(renderState.preset)) {
    throw new Error(`Invalid preset: ${renderState.preset}. Allowed: ${[...ALLOWED_PRESETS].join(", ")}`);
  }
  if (!ALLOWED_ROLES.has(renderState.role)) {
    throw new Error(`Invalid role: ${renderState.role}. Allowed: ${[...ALLOWED_ROLES].join(", ")}`);
  }

  const normalized = {
    ...renderState,
    text: {},
    layout: {}
  };
  for (const field of Object.keys(FIELD_LIMITS)) {
    normalized.text[field] = normalizeText(renderState.text?.[field], field);
    normalized.layout[field] = {};
    for (const prop of Object.keys(FIELD_LIMITS[field])) {
      normalized.layout[field][prop] = normalizeNumber(renderState.layout?.[field]?.[prop], FIELD_LIMITS[field][prop], `${field}.${prop}`);
    }
  }
  return normalized;
}

function normalizeText(value, field) {
  const text = String(value ?? "");
  if (text.length > 240) {
    throw new Error(`Text field ${field} is too long: ${text.length} characters. Max: 240`);
  }
  return text;
}

function normalizeNumber(value, [min, max], label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric layout value: ${label}=${value}`);
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

async function importConfig(page, renderState) {
  await page.locator("[data-testid='json-box']").fill(JSON.stringify(renderState));
  await page.locator("[data-testid='import-json']").click();
  await page.waitForFunction((expected) => {
    const title = document.querySelector(".field[data-field='title']")?.textContent || "";
    return title === expected;
  }, renderState.text.title, { timeout: 10000 });
}

async function prepareCanvasForExport(page) {
  await page.addStyleTag({ content: `
    body {
      margin: 0 !important;
      width: 1080px !important;
      height: 1440px !important;
      overflow: hidden !important;
      background: transparent !important;
    }
    body::before,
    .panel {
      display: none !important;
    }
    .app,
    .stage-shell,
    .canvas-wrap {
      display: block !important;
      width: 1080px !important;
      height: 1440px !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
      filter: none !important;
    }
    #canvas {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 1080px !important;
      height: 1440px !important;
      border-radius: 0 !important;
      transform: none !important;
    }
  `});
  await page.waitForFunction(() => {
    const canvas = document.querySelector("[data-testid='card-canvas']");
    return canvas && canvas.offsetWidth === 1080 && canvas.offsetHeight === 1440;
  }, { timeout: 10000 });
}

function buildProcessMarkdown(manifest) {
  return [
    "# Template Render Process",
    "",
    `- Generated at: \`${manifest.generatedAt}\``,
    `- Input: \`${manifest.inputPath}\``,
    `- Output directory: \`${manifest.outputDir}\``,
    `- PNG: \`${manifest.files.png}\``,
    `- HTML source: \`${manifest.files.html}\``,
    `- Node.js: \`${manifest.toolchain.node}\``,
    `- Console errors: \`${manifest.validationPreview.consoleErrors.length}\``,
    `- Page errors: \`${manifest.validationPreview.pageErrors.length}\``,
    "",
    "## Render Config",
    "",
    "```json",
    JSON.stringify(manifest.config, null, 2),
    "```",
    ""
  ].join("\n");
}

function sanitizeFileName(value) {
  const sanitized = String(value)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized || /^\.+$/u.test(sanitized)) return "template-render";
  return sanitized;
}

function resolveOutputDir(outputOverride, configOutputDir, outputName) {
  if (outputOverride) return path.resolve(process.cwd(), outputOverride);
  if (configOutputDir) return resolveSafeConfigOutputDir(configOutputDir);
  return path.resolve(process.cwd(), "output", outputName);
}

function resolveSafeConfigOutputDir(value) {
  const text = String(value || "");
  if (!text || text.includes("\0") || path.isAbsolute(text)) {
    throw new Error("Config outputDir must be a safe relative path. Use --output for an explicit absolute destination.");
  }
  const normalized = path.normalize(text);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("Config outputDir cannot point outside the current workspace. Use --output for an explicit destination.");
  }
  return path.resolve(process.cwd(), normalized);
}

function safeFilePart(value) {
  const text = String(value);
  if (!/^[a-z0-9-]+$/i.test(text)) {
    throw new Error(`Unsafe file name segment: ${text}`);
  }
  return text;
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
