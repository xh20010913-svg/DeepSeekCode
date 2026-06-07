import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureBrowserScreenshot } from "../bridge/cdpClient.js";
import { artifactKindFromPath, type TaskOutputKind } from "../protocol/actions.js";
import { captureHtmlWithHeadlessBrowser, captureUrlWithHeadlessBrowser } from "../remote/preview.js";
import { type ToolExecutionContext } from "../Tool.js";
import { summarizeValidation, validateArtifact } from "./artifact.js";
import { classifyCommandFailure, formatFailureDiagnosis } from "./commandPreflight.js";
import { safeOptionalJoin } from "./pathSafety.js";
import {
  defaultShellPolicy,
  runCommand,
  runLongRunningCommand,
  summarizeCommand,
  summarizeLongRunningCommand,
} from "./shell.js";

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

export interface TaskCompletionContract {
  objective?: string;
  expectedOutputs?: Array<{
    kind?: TaskOutputKind | string;
    description: string;
    required?: boolean;
  }>;
  acceptanceCriteria?: string[];
  userConstraints?: string[];
  verificationHints?: string[];
  goal?: string;
  expected_artifacts?: string[];
  verifiable_behaviors?: string[];
  acceptance_criteria?: string[];
  user_constraints?: string[];
}

export interface VerifyTaskInput extends VerifyProjectInput {
  objective?: string;
  contract?: TaskCompletionContract;
  launch?: boolean;
}

export interface ProjectVerificationReport {
  status: "succeeded" | "failed";
  root: string;
  summary: string;
  checks: ProjectCheck[];
  artifacts: string[];
  previewPath?: string;
  startCommand?: string;
  launched?: LaunchedProcess[];
}

export interface ProjectCheck {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning";
  detail: string;
}

export interface PackageInfo {
  dir: string;
  relativeDir: string;
  scripts: Record<string, string>;
}

export interface LaunchedProcess {
  pid?: number;
  command: string;
  cwd: string;
  url?: string;
  ready: boolean;
  running: boolean;
}

const GENERIC_ARTIFACT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".xlsx",
  ".docx",
  ".pptx",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".html",
  ".htm",
];

const SCRIPT_EXTENSIONS = [".js", ".ts", ".mjs", ".cjs", ".py", ".ps1", ".bat", ".cmd", ".sh"];

export async function verifyTask(
  projectRoot: string,
  input: VerifyTaskInput,
  context: ToolExecutionContext,
): Promise<ProjectVerificationReport> {
  const root = safeOptionalJoin(projectRoot, input.path ?? "");
  const checks: ProjectCheck[] = [];
  const artifacts: string[] = [];
  let previewPath: string | undefined;
  let startCommand: string | undefined;
  const launched: LaunchedProcess[] = [];

  const contract = normalizeTaskContract(input.contract, input.objective);
  const strictRuntimeEvidence = contractRequiresRuntimeEvidence(contract);
  const goal = contract.objective;
  if (goal) {
    checks.push({ name: "task_contract", status: "passed", detail: goal.slice(0, 500) });
  } else {
    checks.push({ name: "task_contract", status: "warning", detail: "No explicit task goal was supplied to verify_task." });
  }
  for (const criterion of contract.acceptanceCriteria) {
    checks.push({ name: "acceptance_criterion", status: "passed", detail: criterion.slice(0, 500) });
  }
  for (const constraint of contract.userConstraints) {
    checks.push({ name: "user_constraint", status: "passed", detail: constraint.slice(0, 500) });
  }
  for (const hint of contract.verificationHints) {
    checks.push({ name: "verification_hint", status: "passed", detail: hint.slice(0, 500) });
  }

  const expectedArtifacts = uniqueStrings([
    ...(input.contract?.expected_artifacts ?? []),
    ...contract.expectedOutputs
      .map((output) => extractExpectedArtifactPath(output.description))
      .filter((value): value is string => Boolean(value)),
  ]);
  for (const expected of expectedArtifacts) {
    validateExpectedArtifact(projectRoot, expected, checks, artifacts);
  }

  const projectReport = await verifyProject(projectRoot, {
    path: input.path,
    mode: input.mode,
    install_dependencies: input.install_dependencies,
    run_build: input.run_build,
    run_tests: input.run_tests,
    capture_preview: input.capture_preview,
    timeout_ms: input.timeout_ms,
  }, context);
  checks.push(...projectReport.checks);
  artifacts.push(...projectReport.artifacts);
  previewPath = projectReport.previewPath;
  startCommand = projectReport.startCommand;
  if (projectReport.launched?.length) launched.push(...projectReport.launched);

  if (input.launch !== false) {
    const launchPackages = findPackageJsons(root).slice(0, input.mode === "full" ? 4 : 2);
    for (const pkg of launchPackages) {
      const launchCommand = chooseLaunchCommand(pkg);
      if (!launchCommand) {
        checks.push({
          name: "launch_smoke",
          status: "skipped",
          detail: `${pkg.relativeDir || "."}: no start/dev/serve script`,
        });
        continue;
      }
      const launchReport = await launchProject(
        root,
        {
          path: pkg.relativeDir,
          command: launchCommand,
          capture_preview: input.capture_preview,
          timeout_ms: Math.min(input.timeout_ms ?? 20_000, 25_000),
        },
        context,
      );
      checks.push(...launchReport.checks.map((check) => ({
        ...check,
        name: `launch_${check.name}`,
        detail: `${pkg.relativeDir || "."}: ${check.detail}`,
      })));
      artifacts.push(...launchReport.artifacts);
      if (!previewPath) previewPath = launchReport.previewPath;
      if (!startCommand) startCommand = launchReport.startCommand;
      if (launchReport.launched?.length) launched.push(...launchReport.launched);
    }
  }

  const genericFiles = findFiles(root, GENERIC_ARTIFACT_EXTENSIONS, input.mode === "full" ? 12 : 8)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`))
    .slice(0, input.mode === "full" ? 60 : 30);
  for (const file of genericFiles) {
    const relative = rel(root, file);
    if (!artifacts.includes(relative)) artifacts.push(relative);
    validateGenericArtifact(root, file, checks);
  }

  const scripts = findFiles(root, SCRIPT_EXTENSIONS, input.mode === "full" ? 10 : 6)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`))
    .slice(0, 20);
  if (scripts.length) {
    checks.push({
      name: "script_outputs",
      status: "passed",
      detail: scripts.slice(0, 8).map((file) => rel(root, file)).join(", "),
    });
  }

  for (const output of contract.expectedOutputs) {
    validateExpectedOutputEvidence({
      root,
      output,
      artifacts,
      scripts,
      checks,
      launched,
      packages: findPackageJsons(root).slice(0, input.mode === "full" ? 6 : 3),
    });
  }

  if (strictRuntimeEvidence) {
    applyRuntimeEvidenceGate(root, contract, checks, launched, previewPath);
  }

  if (!genericFiles.length && !scripts.length && expectedArtifacts.length === 0 && contract.expectedOutputs.length === 0 && projectReport.artifacts.length === 0) {
    checks.push({
      name: "task_outputs",
      status: "failed",
      detail: "No verifiable output files, project manifests, scripts, documents, data files, or media artifacts were found.",
    });
  }

  const failed = checks.some((check) => check.status === "failed");
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    status: failed ? "failed" : "succeeded",
    root,
    summary: `task checks=${checks.length} failed=${checks.filter((check) => check.status === "failed").length} warnings=${warnings} artifacts=${uniqueStrings(artifacts).length}`,
    checks,
    artifacts: uniqueStrings(artifacts),
    previewPath,
    startCommand,
    launched,
  };
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
  const launched: LaunchedProcess[] = [];
  const htmlFiles = findFiles(root, [".html", ".htm"], 20).slice(0, 3);
  const packageInfo = findPackageJsons(root)[0];
  const command = input.command ?? (packageInfo ? chooseLaunchCommand(packageInfo) : undefined);
  const commandCwd = packageInfo && !input.command ? packageInfo.relativeDir : path.relative(projectRoot, root);
  if (command) {
    if (!context.allowShell) {
      checks.push({
        name: "launch_command",
        status: "skipped",
        detail: "Shell permission is disabled; runtime cannot launch a local process.",
      });
    } else {
      const output = await runLongRunningCommand(projectRoot, command, commandCwd, input.timeout_ms ?? 20_000, {
        ...defaultShellPolicy,
        allowShell: context.allowShell,
        maxTimeoutMs: Math.max(defaultShellPolicy.maxTimeoutMs, input.timeout_ms ?? 20_000),
      }, {
        signal: context.abortSignal,
        port: input.port,
      });
      launched.push({
        pid: output.pid,
        command,
        cwd: output.cwd,
        url: output.url,
        ready: output.ready,
        running: output.running,
      });
      if (context.state && output.pid && output.running) {
        context.state.upsertProjectProcess({
          runId: context.runId ?? null,
          projectPath: projectRoot,
          pid: output.pid,
          cwd: output.cwd,
          command,
          port: input.port ?? portFromUrl(output.url),
          url: output.url ?? null,
          status: "running",
        });
      }
      const diagnosis = output.running ? undefined : classifyCommandFailure(output);
      checks.push({
        name: "launch_command",
        status: output.running
          ? output.ready
            ? "passed"
            : "warning"
          : output.exitCode === 0
            ? "passed"
            : "failed",
        detail: [summarizeLongRunningCommand(output), formatFailureDiagnosis(diagnosis)].filter(Boolean).join("\n"),
      });
      if (output.url) {
        checks.push(...await inspectLaunchedUrl(output.url, input.timeout_ms ?? 20_000));
        const preview = input.capture_preview !== false
          ? await captureUrlPreview(root, output.url, context.dataDir)
          : undefined;
        if (preview) {
          artifacts.push(preview);
          checks.push({ name: "service_preview", status: "passed", detail: `${output.url} -> ${preview}` });
        } else if (input.capture_preview !== false) {
          checks.push({ name: "service_preview", status: "warning", detail: `Service responded at ${output.url}, but no screenshot could be captured.` });
        }
      } else if (output.running) {
        checks.push({ name: "service_probe", status: "warning", detail: "Process is still running, but no local URL or port was detected. Provide launch_project.port for a stronger smoke test." });
      }
    }
  }

  let previewPath: string | undefined;
  const servicePreview = artifacts.find((item) => item.endsWith(".png"));
  if (servicePreview) previewPath = servicePreview;
  if (!previewPath && input.capture_preview !== false && htmlFiles.length) {
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
    startCommand: command,
    launched,
  };
}

export function formatProjectVerificationReport(report: ProjectVerificationReport): string {
  return [
    report.summary,
    report.startCommand ? `start_command=${report.startCommand}` : "",
    report.launched?.length
      ? `launched:\n${report.launched.map((item) => `- pid=${item.pid ?? "unknown"} ready=${item.ready} running=${item.running}${item.url ? ` url=${item.url}` : ""} command=${item.command}`).join("\n")}`
      : "",
    report.previewPath ? `preview=${report.previewPath}` : "",
    "checks:",
    ...report.checks.slice(0, 20).map((check) => `- ${check.status} ${check.name}: ${check.detail}`),
    report.artifacts.length ? `artifacts:\n${report.artifacts.slice(0, 12).map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

interface NormalizedTaskContract {
  objective?: string;
  expectedOutputs: Array<{
    kind: string;
    description: string;
    required: boolean;
  }>;
  acceptanceCriteria: string[];
  userConstraints: string[];
  verificationHints: string[];
}

function normalizeTaskContract(
  contract: TaskCompletionContract | undefined,
  fallbackObjective: string | undefined,
): NormalizedTaskContract {
  const expectedOutputs = [
    ...(contract?.expectedOutputs ?? []).map((output) => ({
      kind: String(output.kind ?? "unknown"),
      description: output.description,
      required: output.required ?? true,
    })),
    ...(contract?.expected_artifacts ?? []).map((artifact) => ({
      kind: taskOutputKindFromPath(artifact),
      description: artifact,
      required: true,
    })),
  ].filter((output) => output.description.trim());
  return {
    objective: contract?.objective ?? contract?.goal ?? fallbackObjective,
    expectedOutputs: uniqueBy(expectedOutputs, (output) => `${output.kind}:${output.description}`),
    acceptanceCriteria: uniqueStrings([
      ...(contract?.acceptanceCriteria ?? []),
      ...(contract?.acceptance_criteria ?? []),
    ]),
    userConstraints: uniqueStrings([
      ...(contract?.userConstraints ?? []),
      ...(contract?.user_constraints ?? []),
    ]),
    verificationHints: uniqueStrings([
      ...(contract?.verificationHints ?? []),
      ...(contract?.verifiable_behaviors ?? []),
    ]),
  };
}

function validateExpectedOutputEvidence(input: {
  root: string;
  output: NormalizedTaskContract["expectedOutputs"][number];
  artifacts: string[];
  scripts: string[];
  packages: PackageInfo[];
  launched: LaunchedProcess[];
  checks: ProjectCheck[];
}): void {
  const evidence = expectedOutputEvidence(input);
  const required = input.output.required;
  input.checks.push({
    name: "expected_output",
    status: evidence ? "passed" : required ? "failed" : "skipped",
    detail: evidence
      ? `${input.output.kind}: ${input.output.description} -> ${evidence}`
      : `${input.output.kind}: ${input.output.description} has no matching local evidence`,
  });
}

function contractRequiresRuntimeEvidence(contract: NormalizedTaskContract): boolean {
  const text = [
    contract.objective,
    ...contract.acceptanceCriteria,
    ...contract.verificationHints,
    ...contract.expectedOutputs.map((output) => `${output.kind} ${output.description}`),
  ].filter(Boolean).join("\n");
  return contract.expectedOutputs.some((output) =>
    output.required && /^(web|html|browser|app|site|game)$/i.test(output.kind)
  ) || /网站|网页|页面|浏览器|预览|截图|打开|运行|启动|游戏|商城|前端|交互|按钮|排行榜|关卡|web|html|browser|frontend|vite|react|vue|next|game|canvas/i.test(text);
}

function applyRuntimeEvidenceGate(
  root: string,
  contract: NormalizedTaskContract,
  checks: ProjectCheck[],
  launched: LaunchedProcess[],
  previewPath: string | undefined,
): void {
  const packages = findPackageJsons(root).slice(0, 6);
  const hasRunnablePackage = packages.some((pkg) => Boolean(chooseLaunchCommand(pkg)));
  const baseName = (name: string) => name.startsWith("launch_") ? name.slice("launch_".length) : name;
  const hasPassed = (name: string) => checks.some((check) => baseName(check.name) === name && check.status === "passed");
  const hasFailedOrWarning = (name: string) => checks.some((check) => baseName(check.name) === name && ["failed", "warning"].includes(check.status));
  const servicePreviewPassed = hasPassed("service_preview");
  const staticPreviewPassed = hasPassed("html_preview") || hasPassed("preview") || Boolean(previewPath);
  const serviceHttpPassed = hasPassed("service_http");
  const launchPassed = hasPassed("launch_command");
  const anyRunningUrl = launched.some((item) => item.running && item.url);
  const expected = contract.expectedOutputs
    .filter((output) => output.required && /web|html|browser|app|site|game/i.test(output.kind))
    .map((output) => output.description)
    .join(" | ");

  for (const check of checks) {
    const name = baseName(check.name);
    if (
      check.status === "warning" &&
      ["launch_command", "service_probe", "service_http", "service_preview", "service_blank_page", "html_preview", "html_content"].includes(name)
    ) {
      check.status = "failed";
      check.detail = `${check.detail}\nStrict runtime verification required for web/app/game completion.`;
    }
  }

  if (hasRunnablePackage && !launchPassed) {
    checks.push({
      name: "runtime_launch_required",
      status: "failed",
      detail: `Runnable web/app/game output must start successfully before completion. Expected: ${expected || contract.objective || "runtime output"}`,
    });
  }
  if (hasRunnablePackage && !(serviceHttpPassed && servicePreviewPassed && anyRunningUrl)) {
    checks.push({
      name: "runtime_preview_required",
      status: "failed",
      detail: "Runnable web/app/game output must provide a reachable local URL plus browser screenshot evidence before it can be accepted.",
    });
  }
  if (!hasRunnablePackage && !staticPreviewPassed) {
    checks.push({
      name: "runtime_preview_required",
      status: "failed",
      detail: "Static web/game output must at least render to a browser screenshot before it can be accepted.",
    });
  }
  if (hasFailedOrWarning("service_blank_page")) {
    checks.push({
      name: "runtime_interaction_risk",
      status: "failed",
      detail: "The service looks blank or too thin for acceptance; the agent must inspect and repair the rendered UI before claiming completion.",
    });
  }
}

function expectedOutputEvidence(input: {
  root: string;
  output: NormalizedTaskContract["expectedOutputs"][number];
  artifacts: string[];
  scripts: string[];
  packages: PackageInfo[];
  launched: LaunchedProcess[];
}): string | undefined {
  const kind = input.output.kind.toLowerCase();
  const descriptionPath = extractExpectedArtifactPath(input.output.description);
  if (descriptionPath) {
    const target = safeOptionalJoin(input.root, descriptionPath);
    if (fs.existsSync(target)) return `${descriptionPath} exists`;
  }
  const artifacts = uniqueStrings(input.artifacts.map((artifact) => artifact.replace(/\\/g, "/")));
  const byExt = (extensions: string[]) => artifacts.find((artifact) => extensions.some((ext) => artifact.toLowerCase().endsWith(ext)));
  switch (kind) {
    case "web":
      return byExt([".html", ".htm"]) ?? input.launched.find((item) => item.url && item.running)?.url ?? input.packages.find((pkg) => chooseLaunchCommand(pkg))?.relativeDir;
    case "docx":
      return byExt([".docx"]);
    case "pptx":
      return byExt([".pptx"]);
    case "xlsx":
      return byExt([".xlsx", ".xls"]);
    case "pdf":
      return byExt([".pdf"]);
    case "markdown":
      return byExt([".md", ".markdown"]);
    case "data":
      return byExt([".csv", ".tsv", ".json", ".xlsx", ".xls", ".sqlite", ".db"]);
    case "image":
      return byExt([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    case "cli":
      return input.scripts.length ? rel(input.root, input.scripts[0]!) : input.packages.find((pkg) => Object.keys(pkg.scripts).length)?.relativeDir;
    case "code":
      return input.scripts.length ? rel(input.root, input.scripts[0]!) : findFiles(input.root, [".ts", ".tsx", ".js", ".jsx", ".py", ".ps1", ".cmd"], 5)[0];
    case "mcp":
      return findFiles(input.root, [".json", ".ts", ".js", ".md"], 5)
        .map((file) => rel(input.root, file))
        .find((file) => /mcp|modelcontextprotocol/i.test(file));
    case "plugin":
      return findFiles(input.root, [".json", ".ts", ".js", ".md"], 5)
        .map((file) => rel(input.root, file))
        .find((file) => /plugin|\.codex-plugin/i.test(file));
    case "automation":
      return input.packages.find((pkg) => Object.keys(pkg.scripts).some((script) => /automation|schedule|worker|job/i.test(script)))?.relativeDir
        ?? input.scripts.find((script) => /automation|schedule|worker|job/i.test(script));
    default:
      return artifacts[0] ?? (input.scripts.length ? rel(input.root, input.scripts[0]!) : input.packages[0]?.relativeDir);
  }
}

function validateExpectedArtifact(
  projectRoot: string,
  expectedPath: string,
  checks: ProjectCheck[],
  artifacts: string[],
): void {
  const target = safeOptionalJoin(projectRoot, expectedPath);
  if (!fs.existsSync(target)) {
    checks.push({ name: "expected_artifact", status: "failed", detail: `${expectedPath} is missing` });
    return;
  }
  if (fs.statSync(target).isDirectory()) {
    checks.push({ name: "expected_artifact", status: "passed", detail: `${expectedPath} directory exists` });
    artifacts.push(expectedPath);
    return;
  }
  artifacts.push(expectedPath);
  try {
    const kind = artifactKindFromPath(target);
    const report = validateArtifact(projectRoot, expectedPath, kind);
    checks.push({
      name: "expected_artifact",
      status: report.errors.length ? "failed" : "passed",
      detail: `${expectedPath}: ${summarizeValidation(report)}`,
    });
  } catch (error) {
    checks.push({ name: "expected_artifact", status: "failed", detail: `${expectedPath}: ${String(error)}` });
  }
}

function validateGenericArtifact(root: string, file: string, checks: ProjectCheck[]): void {
  const relative = rel(root, file);
  const ext = path.extname(file).toLowerCase();
  if ([".json"].includes(ext)) {
    try {
      JSON.parse(fs.readFileSync(file, "utf-8"));
      checks.push({ name: "json_artifact", status: "passed", detail: relative });
    } catch (error) {
      checks.push({ name: "json_artifact", status: "failed", detail: `${relative}: ${String(error)}` });
    }
    return;
  }
  if ([".csv", ".tsv"].includes(ext)) {
    const content = fs.readFileSync(file, "utf-8");
    const rows = content.split(/\r?\n/).filter((line) => line.trim()).length;
    checks.push({
      name: "data_artifact",
      status: rows > 0 ? "passed" : "failed",
      detail: `${relative}: rows=${rows}`,
    });
    return;
  }
  if ([".txt"].includes(ext)) {
    const size = fs.statSync(file).size;
    checks.push({ name: "text_artifact", status: size > 0 ? "passed" : "failed", detail: `${relative}: ${size} bytes` });
    return;
  }
  try {
    const kind = artifactKindFromPath(file);
    const report = validateArtifact(root, relative, kind);
    checks.push({
      name: "artifact_validation",
      status: report.errors.length ? "failed" : "passed",
      detail: `${relative}: ${summarizeValidation(report)}`,
    });
  } catch (error) {
    checks.push({ name: "artifact_validation", status: "failed", detail: `${relative}: ${String(error)}` });
  }
}

async function runPackageCommand(
  root: string,
  pkg: PackageInfo,
  name: string,
  command: string,
  timeoutMs: number | undefined,
  context: ToolExecutionContext,
  checks: ProjectCheck[],
  options?: { longRunningOk?: boolean },
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
  const passed = output.exitCode === 0 || (Boolean(options?.longRunningOk) && output.timedOut);
  checks.push({
    name,
    status: passed ? "passed" : "failed",
    detail: [`${pkg.relativeDir || "."}: ${summarizeCommand(output)}`, formatFailureDiagnosis(diagnosis)].filter(Boolean).join("\n"),
  });
}

function chooseLaunchCommand(pkg: PackageInfo): string | undefined {
  const scripts = pkg.scripts;
  if (scripts.dev) return "npm.cmd run dev";
  if (scripts.start) return "npm.cmd start";
  if (scripts.serve) return "npm.cmd run serve";
  if (scripts.preview) return "npm.cmd run preview";
  return undefined;
}

function portFromUrl(url: string | undefined): number | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(value);
  }
  return out;
}

function extractExpectedArtifactPath(value: string): string | undefined {
  const trimmed = value.trim().replace(/^["'`]+|["'`.,，。]+$/g, "");
  if (!trimmed) return undefined;
  if (/^[\w./\\\-\u4e00-\u9fa5 ]+\.[a-z0-9]{1,8}$/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/([\w./\\\-\u4e00-\u9fa5 ]+\.(?:html?|md|markdown|docx|pptx|xlsx|xls|pdf|png|jpe?g|webp|gif|csv|tsv|json|js|ts|tsx|jsx|py|ps1|cmd|bat|sh))/i);
  return match?.[1]?.trim();
}

function taskOutputKindFromPath(target: string): TaskOutputKind {
  const artifactKind = artifactKindFromPath(target);
  switch (artifactKind) {
    case "html":
      return "web";
    case "markdown":
      return "markdown";
    case "docx":
    case "pptx":
    case "xlsx":
    case "pdf":
    case "image":
      return artifactKind;
    case "screenshot":
      return "image";
    default:
      if (/\.(csv|tsv|json|sqlite|db)$/i.test(target)) return "data";
      if (/\.(js|ts|tsx|jsx|py|ps1|cmd|bat|sh|mjs|cjs)$/i.test(target)) return "code";
      return "unknown";
  }
}

function findPackageJsons(root: string): PackageInfo[] {
  return findFiles(root, ["package.json"], 3)
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`))
    .map((file) => {
      try {
        const raw = fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
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

async function captureUrlPreview(root: string, url: string, dataDir: string | undefined): Promise<string | undefined> {
  const outputDir = path.join(dataDir ?? root, ".deepseekcode", "previews");
  try {
    const bytes = await captureBrowserScreenshot(url, false);
    fs.mkdirSync(outputDir, { recursive: true });
    const target = path.join(outputDir, `service-${Date.now()}.png`);
    fs.writeFileSync(target, bytes);
    return target;
  } catch {
    const fallback = await captureUrlWithHeadlessBrowser({ url, outputDir, baseName: "service" });
    return fallback?.path;
  }
}

async function inspectLaunchedUrl(url: string, timeoutMs: number): Promise<ProjectCheck[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10_000));
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    const text = contentType.includes("text") || contentType.includes("html") || contentType.includes("json")
      ? await response.text()
      : "";
    const checks: ProjectCheck[] = [{
      name: "service_http",
      status: response.status >= 400 ? "failed" : "passed",
      detail: `${url} -> HTTP ${response.status} ${response.statusText}`.trim(),
    }];
    if (contentType.includes("html")) {
      const visibleText = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, "")
        .trim();
      checks.push({
        name: "service_blank_page",
        status: visibleText.length >= 5 || /id=["']root["']|id=["']app["']|<canvas|<svg/i.test(text) ? "passed" : "warning",
        detail: visibleText.length >= 5
          ? `visible_text_chars=${visibleText.length}`
          : "HTML response has very little visible text; possible blank page unless client rendering fills it.",
      });
      const missingLocalAsset = [...text.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
        .map((match) => match[1] ?? "")
        .filter((ref) => ref && !/^(https?:|data:|#|mailto:|tel:)/i.test(ref))
        .find((ref) => /(?:undefined|null|\s)/i.test(ref));
      if (missingLocalAsset) {
        checks.push({
          name: "service_asset_reference",
          status: "failed",
          detail: `Suspicious local asset reference: ${missingLocalAsset}`,
        });
      }
    }
    return checks;
  } catch (error) {
    return [{
      name: "service_http",
      status: "warning",
      detail: `Could not inspect ${url}: ${error instanceof Error ? error.message : String(error)}`,
    }];
  } finally {
    clearTimeout(timer);
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
