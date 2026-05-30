import fs from "node:fs";
import path from "node:path";
import type { ArtifactKind } from "../protocol/actions.js";
import { artifactKindFromPath } from "../protocol/actions.js";
import { safeJoin } from "./pathSafety.js";

const MOJIBAKE_MARKERS = ["锟", "�", "Ã", "Â", "å", "æ", "ç"];

export interface ArtifactValidationReport {
  path: string;
  kind: ArtifactKind;
  sizeBytes: number;
  checks: string[];
  errors: string[];
}

export function validateArtifact(
  root: string,
  relativePath: string,
  expectedKind?: ArtifactKind,
): ArtifactValidationReport {
  const target = safeJoin(root, relativePath);
  const bytes = fs.readFileSync(target);
  const stat = fs.statSync(target);
  const kind = expectedKind ?? artifactKindFromPath(target);
  const checks = ["exists"];
  const errors: string[] = [];

  if (!stat.isFile()) {
    errors.push("path is not a file");
  } else {
    checks.push("is_file");
  }

  validateExtension(target, kind, checks, errors);
  validateContent(bytes, kind, checks, errors);

  return {
    path: target,
    kind,
    sizeBytes: stat.size,
    checks,
    errors,
  };
}

export function summarizeValidation(report: ArtifactValidationReport): string {
  if (report.errors.length === 0) {
    return `ok: ${report.kind}, ${report.sizeBytes} bytes, checks: ${report.checks.join(", ")}`;
  }
  return `failed: ${report.kind}, ${report.sizeBytes} bytes, errors: ${report.errors.join("; ")}`;
}

function validateExtension(
  target: string,
  kind: ArtifactKind,
  checks: string[],
  errors: string[],
): void {
  const ext = path.extname(target).slice(1).toLowerCase();
  const valid =
    kind === "html"
      ? ["html", "htm"].includes(ext)
      : kind === "docx"
        ? ext === "docx"
        : kind === "pdf"
          ? ext === "pdf"
          : kind === "image"
            ? ["png", "jpg", "jpeg", "webp"].includes(ext)
            : true;
  if (valid) checks.push("extension");
  else errors.push(`extension does not match ${kind}`);
}

function validateContent(
  bytes: Buffer,
  kind: ArtifactKind,
  checks: string[],
  errors: string[],
): void {
  if (kind === "pdf") {
    if (bytes.subarray(0, 5).toString() === "%PDF-") checks.push("pdf_header");
    else errors.push("missing PDF header");
    return;
  }
  if (kind === "docx") {
    if (bytes.subarray(0, 2).toString() === "PK") checks.push("zip_header");
    else errors.push("DOCX is not a zip package");
    return;
  }
  if (kind === "image" || kind === "screenshot") {
    if (bytes.length > 0) checks.push("non_empty_binary");
    else errors.push("image file is empty");
    return;
  }

  const content = bytes.toString("utf8");
  checks.push("utf8");
  if (MOJIBAKE_MARKERS.some((marker) => content.includes(marker))) {
    errors.push("content contains mojibake marker");
  } else {
    checks.push("mojibake_scan");
  }
  if (kind === "html") validateHtml(content, checks, errors);
}

function validateHtml(content: string, checks: string[], errors: string[]): void {
  const lower = content.toLowerCase();
  if (lower.includes("<html") || lower.includes("<!doctype html")) checks.push("html_root");
  else errors.push("missing html root");
  if (lower.includes("<body")) checks.push("body");
  else errors.push("missing body");
}
