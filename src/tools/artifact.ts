import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export function validateArtifact(
  root: string,
  relativePath: string,
  expectedKind?: ArtifactKind,
): ArtifactValidationReport {
  const target = safeJoin(root, relativePath);
  const bytes = fs.readFileSync(target);
  const stat = fs.statSync(target);
  const inferredKind = artifactKindFromPath(target);
  const kind = expectedKind && expectedKind !== "file" ? expectedKind : inferredKind;
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
      : kind === "markdown"
        ? ["md", "markdown"].includes(ext)
      : kind === "docx"
        ? ext === "docx"
        : kind === "pptx"
          ? ext === "pptx"
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
  if (kind === "docx" || kind === "pptx") {
    if (bytes.subarray(0, 2).toString() === "PK") checks.push("zip_header");
    else errors.push(`${kind.toUpperCase()} is not a zip package`);
    const entries = zipEntries(bytes);
    const requiredEntry = kind === "docx" ? "word/document.xml" : "ppt/presentation.xml";
    if (entries?.some((entry) => entry.name === requiredEntry)) checks.push(`${kind}_main_part`);
    else errors.push(`missing ${requiredEntry}`);
    if (kind === "pptx" && entries) {
      validatePptxStructure(bytes, entries, checks, errors);
    }
    if (kind === "docx" && entries) {
      validateDocxStructure(bytes, entries, checks, errors);
    }
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

function validatePptxStructure(
  bytes: Buffer,
  entries: ZipEntry[],
  checks: string[],
  errors: string[],
): void {
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  if (slideEntries.length === 0) {
    errors.push("PPTX has no slide parts");
    return;
  }

  const slideXml = slideEntries
    .map((entry) => readZipEntryText(bytes, entry) ?? "")
    .filter(Boolean);
  const slideTexts = slideXml.map((xml) => extractXmlText(xml, "a"));
  const combinedText = compactText(slideTexts.join(" "), 20_000);
  const nonEmptySlides = slideTexts.filter((text) => text.trim().length > 0).length;
  const shapeCount = sumMatches(slideXml, /<p:sp\b/g);
  const pictureCount = sumMatches(slideXml, /<p:pic\b/g);
  const mediaCount = entries.filter((entry) => /^ppt\/media\/.+/i.test(entry.name)).length;
  const notesCount = entries.filter((entry) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(entry.name)).length;
  const textChars = visibleLength(combinedText);
  const cjkChars = countCjk(combinedText);

  checks.push(`pptx_slides=${slideEntries.length}`);
  checks.push(`pptx_nonempty_slides=${nonEmptySlides}`);
  if (textChars > 0) checks.push(`pptx_text_chars=${textChars}`);
  else errors.push("PPTX has no readable slide text");
  if (cjkChars > 0) checks.push(`pptx_cjk_chars=${cjkChars}`);
  checks.push(`pptx_shapes=${shapeCount}`);
  checks.push(`pptx_pictures=${pictureCount}`);
  checks.push(`pptx_media=${mediaCount}`);
  checks.push(`pptx_notes=${notesCount}`);
}

function validateDocxStructure(
  bytes: Buffer,
  entries: ZipEntry[],
  checks: string[],
  errors: string[],
): void {
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml");
  const documentXml = documentEntry ? readZipEntryText(bytes, documentEntry) : undefined;
  if (!documentXml) {
    errors.push("DOCX document.xml could not be read");
    return;
  }

  const text = extractXmlText(documentXml, "w");
  const paragraphCount = countMatches(documentXml, /<w:p\b/g);
  const tableCount = countMatches(documentXml, /<w:tbl\b/g);
  const pictureCount = countMatches(documentXml, /<pic:pic\b|<w:drawing\b/g);
  const mediaCount = entries.filter((entry) => /^word\/media\/.+/i.test(entry.name)).length;
  const textChars = visibleLength(text);
  const cjkChars = countCjk(text);

  checks.push(`docx_paragraphs=${paragraphCount}`);
  checks.push(`docx_tables=${tableCount}`);
  checks.push(`docx_pictures=${pictureCount}`);
  checks.push(`docx_media=${mediaCount}`);
  if (textChars > 0) checks.push(`docx_text_chars=${textChars}`);
  else errors.push("DOCX has no readable document text");
  if (cjkChars > 0) checks.push(`docx_cjk_chars=${cjkChars}`);
}

function zipEntries(bytes: Buffer): ZipEntry[] | undefined {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0 || eocdOffset + 22 > bytes.length) return undefined;

  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryOffset >= bytes.length ||
    centralDirectoryEnd > bytes.length ||
    centralDirectoryEnd < centralDirectoryOffset
  ) {
    return undefined;
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount && offset + 46 <= centralDirectoryEnd; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) return undefined;
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraFieldLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > centralDirectoryEnd) return undefined;
    entries.push({
      name: bytes.subarray(nameStart, nameEnd).toString("utf8"),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraFieldLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimumSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, bytes.length - minimumSize - maxCommentLength);
  for (let offset = bytes.length - minimumSize; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function validateHtml(content: string, checks: string[], errors: string[]): void {
  const lower = content.toLowerCase();
  if (lower.includes("<html") || lower.includes("<!doctype html")) checks.push("html_root");
  else errors.push("missing html root");
  if (lower.includes("<body")) checks.push("body");
  else errors.push("missing body");
}

function readZipEntryText(bytes: Buffer, entry: ZipEntry): string | undefined {
  const payload = readZipEntry(bytes, entry);
  return payload?.toString("utf8");
}

function readZipEntry(bytes: Buffer, entry: ZipEntry): Buffer | undefined {
  const offset = entry.localHeaderOffset;
  if (offset < 0 || offset + 30 > bytes.length) return undefined;
  if (bytes.readUInt32LE(offset) !== 0x04034b50) return undefined;
  const fileNameLength = bytes.readUInt16LE(offset + 26);
  const extraFieldLength = bytes.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > bytes.length || dataEnd < dataStart) return undefined;

  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) {
    try {
      const inflated = zlib.inflateRawSync(compressed);
      if (entry.uncompressedSize > 0 && inflated.length !== entry.uncompressedSize) return undefined;
      return inflated;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractXmlText(xml: string, prefix: "a" | "w"): string {
  const pattern = new RegExp(`<${prefix}:t\\b[^>]*>([\\s\\S]*?)<\\/${prefix}:t>`, "g");
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    parts.push(decodeXmlEntities(match[1] ?? ""));
  }
  return compactText(parts.join(" "), 20_000);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function compactText(value: string, maxChars: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxChars ? compacted : compacted.slice(0, maxChars);
}

function visibleLength(value: string): number {
  return value.replace(/\s+/g, "").length;
}

function countCjk(value: string): number {
  return (value.match(/[\u3400-\u9fff]/gu) ?? []).length;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).length;
}

function sumMatches(values: string[], pattern: RegExp): number {
  return values.reduce((sum, value) => sum + countMatches(value, pattern), 0);
}

function slideNumber(name: string): number {
  const match = /slide(\d+)\.xml$/i.exec(name);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}
