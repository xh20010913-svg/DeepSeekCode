import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureBrowserScreenshot } from "../bridge/cdpClient.js";
import { captureHtmlWithHeadlessBrowser } from "../remote/preview.js";
import { type ToolExecutionContext } from "../Tool.js";
import { classifyCommandFailure, formatFailureDiagnosis } from "./commandPreflight.js";
import { safeOptionalJoin } from "./pathSafety.js";
import { defaultShellPolicy, runCommand, summarizeCommand } from "./shell.js";

export interface VerifyProjectInput {
  path?: string;
  mode?: "auto" | "quick" | "full";
  install_dependencies?: boolean;
  run_build?: boolean;
  run_tests?: boolean;
  capture_preview?: boolean;
  timeout_ms?: number;
}

export interface LaunchProjectInput {
  path?: string;
  command?: string;
  port?: number;
  capture_preview?: boolean;
  timeout_ms?: number;
}

export interface ProjectVerificationReport {
  status: "succeeded" | "failed";
  root: string;
  summary: string;
  checks: ProjectCheck[];
  artifacts: string[];
  previewPath?: string;
  startCommand?: string;
}

interface ProjectCheck {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning";
  detail: string;
}

interface PackageInfo {
  dir: string;
  relativeDir: string;
  scripts: Record<string, string>;
}

export async function verifyProject(
  projectRoot: string,
  input: VerifyProjectInput,
  context: ToolExecutionContext,
): Promise<ProjectVerificationReport> {
  const root = safeOptionalJoin(projectRoot, input.path ?? "");
  const checks: ProjectCheck[] = [];
  const artifacts: string[] = [];
  const packages = findPackageJsons(root).slice(0, input.mode === "full" ? 6 : 3);
  const htmlFiles = findFiles(root, [".html", ".htm"], 30).slice(0, 6);
  const officeFiles = findFiles(root, [".docx", ".pptx", ".xlsx", ".pdf"], 30).slice(0, 12);

  if (!packages.length && !htmlFiles.length && !officeFiles.length) {
    checks.push({
      name: "discover_artifacts",
      status: "warning",
      detail: "No package.json, HTML, Office, or PDF artifact was found under the target path.",
    });
  }

  for (const pkg of packages) {
    checks.push({ name: "package_json", status: "passed", detail: rel(root, path.join(pkg.dir, "package.json")) });
    if (input.install_dependencies) {
      await runPackageCommand(root, pkg, "install dependencies", "npm.cmd install", input.timeout_ms, context, checks);
    }
    if (input.run_build !== false && pkg.scripts.build) {
      await runPackageCommand(root, pkg, "build", "npm.cmd run build", input.timeout_ms, context, checks);
    } else if (input.run_build !== false) {
      checks.push({ name: "build", status: "skipped", detail: `${pkg.relativeDir || "."}: no build script` });
    }
    if (input.run_tests && pkg.scripts.test) {
      await runPackageCommand(root, pkg, "test", "npm.cmd test", input.timeout_ms, context, checks);
    } else if (input.run_tests) {
      checks.push({ name: "test", status: "skipped", detail: `${pkg.relativeDir || "."}: no test script` });
    }
  }

  let previewPath: string | undefined;
  for (const html of htmlFiles) {
    const htmlCheck = inspectHtml(root, html);
    checks.push(htmlCheck);
    artifacts.push(rel(root, html));
    if (!previewPath && input.capture_preview !== false) {
      previewPath = await captureHtmlPreview(root, html, context.dataDir);
      if (previewPath) {
        artifacts.push(previewPath);
        checks.push({ name: "html_preview", status: "passed", detail: previewPath });
      } else {
        checks.push({ name: "html_preview", status: "warning", detail: `Could not capture preview for ${rel(root, html)}` });
      }
    }
  }

  for (const file of officeFiles) {
    const size = fs.statSync(file).size;
    artifacts.push(rel(root, file));
    checks.push({
      name: "artifact_file",
      status: size > 0 ? "passed" : "failed",
      detail: `${rel(root, file)} (${size} bytes)`,
    });
  }

  const failed = checks.some((check) => check.status === "failed");
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    status: failed ? "failed" : "succeeded",
    root,
    summary: `checks=${checks.length} failed=${checks.filter((check) => check.status === "failed").length} warnings=${warnings} artifacts=${artifacts.length}`,
    checks,
    artifacts,
    previewPath,
  };
}

export async function launchProject(
  projectRoot: string,
  input: LaunchProjectInput,
  context: ToolExecutionContext,
): Promise<ProjectVerificationReport> {
  const root = safeOptionalJoin(projectRoot, input.path ?? "");
  const checks: ProjectCheck[] = [];
  const artifacts: string[] = [];
  const htmlFiles = findFiles(root, [".html", ".htm"], 20).slice(0, 3);
  if (input.command) {
    if (!context.allowShell) {
      checks.push({
        name: "launch_command",
        status: "skipped",
        detail: "Shell permission is disabled; runtime cannot launch a local process.",
      });
    } else {
      const output = await runCommand(projectRoot, input.command, path.relative(projectRoot, root), input.timeout_ms ?? 20_000, {
        ...defaultShellPolicy,
        allowShell: context.allowShell,
      }, { signal: context.abortSignal });
      const diagnosis = classifyCommandFailure(output);
      checks.push({
        name: "launch_command",
        status: output.exitCode === 0 || output.timedOut ? "passed" : "failed",
        detail: [summarizeCommand(output), formatFailureDiagnosis(diagnosis)].filter(Boolean).join("\n"),
      });
    }
  }

  let previewPath: string | undefined;
  if (input.capture_preview !== false && htmlFiles.length) {
    previewPath = await captureHtmlPreview(root, htmlFiles[0]!, context.dataDir);
    if (previewPath) {
      artifacts.push(previewPath);
      checks.push({ name: "preview", status: "passed", detail: previewPath });
    }
  }

  const failed = checks.some((check) => check.status === "failed");
  return {
    status: failed ? "failed" : "succeeded",
    root,
    summary: `launch checks=${checks.length} failed=${checks.filter((check) => check.status === "failed").length}`,
    checks,
    artifacts,
    previewPath,
    startCommand: input.command,
  };
}

export function formatProjectVerificationReport(report: ProjectVerificationReport): string {
  return [
    report.summary,
    report.startCommand ? `start_command=${report.startCommand}` : "",
    report.previewPath ? `preview=${report.previewPath}` : "",
    "checks:",
    ...report.checks.slice(0, 20).map((check) => `- ${check.status} ${check.name}: ${check.detail}`),
    report.artifacts.length ? `artifacts:\n${report.artifacts.slice(0, 12).map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

async function runPackageCommand(
  root: string,
  pkg: PackageInfo,
  name: string,
  command: string,
  timeoutMs: number | undefined,
  context: ToolExecutionContext,
  checks: ProjectCheck[],
): Promise<void> {
  if (!context.allowShell) {
    checks.push({ name, status: "skipped", detail: `${pkg.relativeDir || "."}: shell permission disabled` });
    return;
  }
  const output = await runCommand(root, command, pkg.relativeDir, timeoutMs ?? 30_000, {
    ...defaultShellPolicy,
    allowShell: context.allowShell,
    maxTimeoutMs: Math.max(defaultShellPolicy.maxTimeoutMs, timeoutMs ?? 30_000),
  }, { signal: context.abortSignal });
  const diagnosis = classifyCommandFailure(output);
  checks.push({
    name,
    status: output.exitCode === 0 && !output.timedOut ? "passed" : "failed",
    detail: [`${pkg.relativeDir || "."}: ${summarizeCommand(output)}`, formatFailureDiagnosis(diagnosis)].filter(Boolean).join("\n"),
  });
}

function findPackageJsons(root: string): PackageInfo[] {
  return findFiles(root, ["package.json"], 3)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`))
    .map((file) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { scripts?: Record<string, string> };
        const dir = path.dirname(file);
        return {
          dir,
          relativeDir: rel(root, dir) === "." ? "" : rel(root, dir),
          scripts: parsed.scripts ?? {},
        };
      } catch {
        return undefined;
      }
    })
    .filter((item): item is PackageInfo => Boolean(item));
}

function inspectHtml(root: string, file: string): ProjectCheck {
  const content = fs.readFileSync(file, "utf-8");
  const missing = referencedLocalAssets(file, content).filter((asset) => !fs.existsSync(asset));
  const visibleText = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");
  if (missing.length) {
    return {
      name: "html_assets",
      status: "failed",
      detail: `${rel(root, file)} missing assets: ${missing.slice(0, 5).map((asset) => rel(root, asset)).join(", ")}`,
    };
  }
  if (visibleText.length < 5 && !/<canvas|<svg|id=["']root["']|id=["']app["']/i.test(content)) {
    return { name: "html_content", status: "warning", detail: `${rel(root, file)} may render blank` };
  }
  return { name: "html_static", status: "passed", detail: rel(root, file) };
}

async function captureHtmlPreview(root: string, htmlPath: string, dataDir: string | undefined): Promise<string | undefined> {
  const outputDir = path.join(dataDir ?? root, ".deepseekcode", "previews");
  try {
    const bytes = await captureBrowserScreenshot(pathToFileURL(htmlPath).href, false);
    fs.mkdirSync(outputDir, { recursive: true });
    const target = path.join(outputDir, `${path.basename(htmlPath, path.extname(htmlPath))}-${Date.now()}.png`);
    fs.writeFileSync(target, bytes);
    return target;
  } catch {
    const fallback = await captureHtmlWithHeadlessBrowser({ htmlPath, outputDir });
    return fallback?.path;
  }
}

function findFiles(root: string, extensions: string[], maxDepth: number): string[] {
  const out: string[] = [];
  const wanted = new Set(extensions.map((ext) => ext.toLowerCase()));
  const exact = wanted.has("package.json");
  walk(root, 0);
  return out;

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth || out.length > 200) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".deepseekcode") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (exact && entry.name.toLowerCase() === "package.json") out.push(full);
        else if (!exact && wanted.has(path.extname(entry.name).toLowerCase())) out.push(full);
      }
    }
  }
}

function referencedLocalAssets(htmlPath: string, content: string): string[] {
  const dir = path.dirname(htmlPath);
  const assets: string[] = [];
  const pattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  for (const match of content.matchAll(pattern)) {
    const ref = match[1] ?? "";
    if (!ref || /^(https?:|data:|#|mailto:|tel:)/i.test(ref)) continue;
    assets.push(path.resolve(dir, ref.split(/[?#]/)[0] ?? ref));
  }
  return assets;
}

function rel(root: string, target: string): string {
  const value = path.relative(root, target) || ".";
  return value.split(path.sep).join("/");
}
