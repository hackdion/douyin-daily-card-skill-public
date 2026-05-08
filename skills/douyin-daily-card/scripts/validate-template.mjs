#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
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
  const outputDir = path.resolve(process.argv[2] || "");
  if (!process.argv[2]) {
    throw new Error("Usage: node skills/douyin-daily-card/scripts/validate-template.mjs <output-dir>");
  }

  const manifestPath = path.join(outputDir, "template-render-manifest.json");
  const htmlPath = path.join(outputDir, "template-render-source.html");
  if (!fsSync.existsSync(manifestPath)) throw new Error(`Missing template-render-manifest.json: ${manifestPath}`);
  if (!fsSync.existsSync(htmlPath)) throw new Error(`Missing template-render-source.html: ${htmlPath}`);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const pngPath = safeJoinInside(outputDir, manifest.files?.png || "");
  const htmlSource = await fs.readFile(htmlPath, "utf8");
  const pngDimensions = pngPath && fsSync.existsSync(pngPath) ? readPngDimensions(pngPath) : null;

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];
  let metrics;
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    metrics = await page.evaluate(() => {
      const canvas = document.querySelector("[data-testid='card-canvas']");
      const rect = canvas?.getBoundingClientRect();
      const canvasLeft = rect?.left || 0;
      const canvasTop = rect?.top || 0;
      return {
        hasCanvas: !!canvas,
        canvasWidth: canvas?.offsetWidth || 0,
        canvasHeight: canvas?.offsetHeight || 0,
        boundingWidth: Math.round(rect?.width || 0),
        boundingHeight: Math.round(rect?.height || 0),
        fieldBounds: [...document.querySelectorAll(".field[data-field]")].map((field) => {
          const fieldRect = field.getBoundingClientRect();
          return {
            field: field.dataset.field,
            text: (field.textContent || "").slice(0, 80),
            left: Math.round(fieldRect.left - canvasLeft),
            top: Math.round(fieldRect.top - canvasTop),
            right: Math.round(fieldRect.right - canvasLeft),
            bottom: Math.round(fieldRect.bottom - canvasTop),
            width: Math.round(fieldRect.width),
            height: Math.round(fieldRect.height)
          };
        }),
        bodyText: document.body.innerText || ""
      };
    });
  } finally {
    await browser.close();
  }

  const blockedTerms = collectBlockedTerms();
  const blockedFindings = findBlockedTerms(`${htmlSource}\n${JSON.stringify(manifest)}`, blockedTerms);
  const configFindings = validateManifestConfig(manifest.config);
  const fieldOverflowFindings = findFieldOverflows(metrics.fieldBounds || []);
  const manifestConsoleErrors = Array.isArray(manifest.validationPreview?.consoleErrors)
    ? manifest.validationPreview.consoleErrors
    : [];
  const manifestPageErrors = Array.isArray(manifest.validationPreview?.pageErrors)
    ? manifest.validationPreview.pageErrors
    : [];
  const checks = [
    ["png-path-inside-output", !!pngPath, manifest.files?.png || ""],
    ["png-exists", !!pngPath && fsSync.existsSync(pngPath), pngPath || ""],
    ["png-dimensions", pngDimensions?.width === 1080 && pngDimensions?.height === 1440, JSON.stringify(pngDimensions)],
    ["html-canvas-exists", metrics.hasCanvas, JSON.stringify(metrics)],
    ["html-canvas-size", metrics.canvasWidth === 1080 && metrics.canvasHeight === 1440, `${metrics.canvasWidth}x${metrics.canvasHeight}`],
    ["console-errors", consoleErrors.length === 0, `${consoleErrors.length}`],
    ["page-errors", pageErrors.length === 0, `${pageErrors.length}`],
    ["render-console-errors", manifestConsoleErrors.length === 0, JSON.stringify(manifestConsoleErrors)],
    ["render-page-errors", manifestPageErrors.length === 0, JSON.stringify(manifestPageErrors)],
    ["field-bounds", fieldOverflowFindings.length === 0, JSON.stringify(fieldOverflowFindings)],
    ["manifest-process-record", fsSync.existsSync(path.join(outputDir, "process-and-params.md")), "process-and-params.md"],
    ["manifest-config-valid", configFindings.length === 0, JSON.stringify(configFindings)],
    ["public-safe-blocked-terms", blockedFindings.length === 0, JSON.stringify(blockedFindings)]
  ].map(([name, pass, detail]) => ({ name, pass, detail }));

  const validation = {
    validatedAt: new Date().toISOString(),
    outputDir,
    pngPath,
    pngDimensions,
    consoleErrors,
    pageErrors,
    manifestConsoleErrors,
    manifestPageErrors,
    metrics,
    configFindings,
    fieldOverflowFindings,
    blockedFindings,
    checks,
    pass: checks.every((check) => check.pass)
  };

  await fs.writeFile(path.join(outputDir, "template-validation-report.json"), JSON.stringify(validation, null, 2), "utf8");
  await appendValidationMarkdown(outputDir, validation);
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.pass) process.exit(1);
}

function findFieldOverflows(fieldBounds) {
  return fieldBounds.filter((item) => (
    item.left < 0 ||
    item.top < 0 ||
    item.right > 1080 ||
    item.bottom > 1440
  ));
}

function safeJoinInside(baseDir, relativePath) {
  const text = String(relativePath || "");
  if (!text || path.isAbsolute(text) || text.includes("\0")) return "";
  const resolved = path.resolve(baseDir, text);
  const base = path.resolve(baseDir);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`) ? resolved : "";
}

function validateManifestConfig(config) {
  const findings = [];
  if (!config || typeof config !== "object") {
    return [{ field: "config", reason: "missing or not object" }];
  }
  if (!ALLOWED_MODES.has(config.mode)) findings.push({ field: "mode", value: config.mode });
  if (!ALLOWED_PRESETS.has(config.preset)) findings.push({ field: "preset", value: config.preset });
  if (!ALLOWED_ROLES.has(config.role)) findings.push({ field: "role", value: config.role });
  for (const [field, limits] of Object.entries(FIELD_LIMITS)) {
    const text = String(config.text?.[field] ?? "");
    if (!text || text.length > 240) findings.push({ field: `text.${field}`, length: text.length });
    for (const [prop, [min, max]] of Object.entries(limits)) {
      const value = Number(config.layout?.[field]?.[prop]);
      if (!Number.isFinite(value) || value < min || value > max) {
        findings.push({ field: `layout.${field}.${prop}`, value: config.layout?.[field]?.[prop], min, max });
      }
    }
  }
  return findings;
}

function readPngDimensions(filePath) {
  const buffer = fsSync.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function appendValidationMarkdown(outputDir, validation) {
  const target = path.join(outputDir, "process-and-params.md");
  const existing = fsSync.existsSync(target)
    ? fsSync.readFileSync(target, "utf8").replace(/\n## Template Validation\n[\s\S]*$/u, "").trimEnd()
    : "";
  const lines = [
    "",
    "## Template Validation",
    "",
    `- Validated at: \`${validation.validatedAt}\``,
    `- PNG dimensions: \`${validation.pngDimensions?.width || 0}x${validation.pngDimensions?.height || 0}\``,
    `- Console errors: \`${validation.consoleErrors.length}\``,
    `- Page errors: \`${validation.pageErrors.length}\``,
    `- Render console errors: \`${validation.manifestConsoleErrors.length}\``,
    `- Render page errors: \`${validation.manifestPageErrors.length}\``,
    `- Field overflow findings: \`${validation.fieldOverflowFindings.length}\``,
    `- Blocked-term findings: \`${validation.blockedFindings.length}\``,
    `- Pass: \`${validation.pass}\``,
    ""
  ];
  await fs.writeFile(target, `${existing}${lines.join("\n")}`, "utf8");
}

function collectBlockedTerms() {
  const builtIn = [
    "\u6d1b\u514b",
    "\u6d1b\u514b\u738b\u56fd",
    ["R", "O", "C", "O"].join(""),
    "\u8fea\u83ab",
    "\u6076\u9b54\u72fc",
    "\u55b5\u55b5",
    "\u6c34\u7075",
    "\u706b\u82b1",
    "\u9b54\u529b\u732b",
    ["981", "707", "78245"].join(""),
    ["roco", "douyin", "template"].join("-"),
    "\u963f\u695e",
    ["Dan", "bo"].join(""),
    ["Dan", "board"].join(""),
    ["Yot", "suba"].join(""),
    "\u56db\u53f6\u59b9\u59b9"
  ];
  const extra = (process.env.DDC_BLOCKED_TERMS || "")
    .split(/[,，|]/)
    .map((term) => term.trim())
    .filter(Boolean);
  return [...new Set([...builtIn, ...extra])];
}

function findBlockedTerms(text, terms) {
  return terms.flatMap((term) => {
    const regex = new RegExp(escapeRegExp(term), "giu");
    const matches = [...String(text).matchAll(regex)];
    if (!matches.length) return [];
    return [{
      term,
      count: matches.length,
      snippets: matches.slice(0, 5).map((match) => {
        const start = Math.max(0, match.index - 32);
        const end = Math.min(text.length, match.index + term.length + 32);
        return String(text).slice(start, end).replace(/\s+/g, " ").trim();
      })
    }];
  });
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
