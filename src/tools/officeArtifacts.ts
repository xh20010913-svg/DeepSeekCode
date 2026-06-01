import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { z } from "zod";
import type { PlannedDocxActionSchema, PlannedPptxActionSchema } from "../protocol/actions.js";
import { safeJoin } from "./pathSafety.js";

type PlannedDocxAction = z.input<typeof PlannedDocxActionSchema>;
type PlannedPptxAction = z.input<typeof PlannedPptxActionSchema>;
type PptxShapeType = {
  rect: string;
  roundRect: string;
  line: string;
  arc: string;
};

interface PptxPresentation {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  lang: string;
  theme: Record<string, string>;
  ShapeType: PptxShapeType;
  addSlide(): PptxSlide;
  writeFile(props: { fileName: string; compression?: boolean }): Promise<string>;
}

interface PptxSlide {
  background: { color: string };
  addShape(shapeName: string, options: Record<string, unknown>): PptxSlide;
  addText(text: string, options: Record<string, unknown>): PptxSlide;
  addNotes(notes: string): PptxSlide;
}

type PptxConstructor = new () => PptxPresentation;
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs") as PptxConstructor;

const PPTX_THEME = {
  ink: "172033",
  muted: "667085",
  blue: "2563EB",
  cyan: "06B6D4",
  green: "16A34A",
  amber: "F59E0B",
  paper: "F8FAFC",
  white: "FFFFFF",
};
const DOCX_CONTENT_WIDTH_DXA = 9360;

export async function createDocxArtifact(root: string, input: PlannedDocxAction): Promise<string> {
  const target = ensureExtension(safeJoin(root, input.path), ".docx");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const sections = markdownToDocxChildren(input.markdown);
  const document = new Document({
    creator: "DeepSeekCode",
    title: path.basename(target, ".docx"),
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 24 },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "deepseek-bullets",
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "deepseek-numbers",
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: sections.length > 0 ? sections : [new Paragraph(" ")],
    }],
  });
  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(target, buffer);
  return target;
}

export async function createPptxArtifact(root: string, input: PlannedPptxAction): Promise<string> {
  const target = ensureExtension(safeJoin(root, input.path), ".pptx");
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DeepSeekCode";
  pptx.subject = input.subtitle ?? input.title;
  pptx.title = input.title;
  pptx.company = "DeepSeekCode";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  addTitleSlide(pptx, input.title, input.subtitle);
  input.slides.forEach((slide, index) => addContentSlide(pptx, slide, index, input.slides.length));

  await pptx.writeFile({ fileName: target, compression: true });
  return target;
}

function markdownToDocxChildren(markdown: string): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let tableBuffer: string[][] = [];

  const flushTable = () => {
    if (tableBuffer.length < 2) {
      tableBuffer = [];
      return;
    }
    const rows = tableBuffer.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())));
    if (rows.length > 0) children.push(markdownTable(rows));
    tableBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.includes("|") && line.startsWith("|") && line.endsWith("|")) {
      tableBuffer.push(line.slice(1, -1).split("|").map((cell) => cell.trim()));
      continue;
    }
    flushTable();
    if (!line) {
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      children.push(new Paragraph({
        text: headingMatch[2],
        heading: headingMatch[1].length === 1
          ? HeadingLevel.HEADING_1
          : headingMatch[1].length === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
      }));
      continue;
    }
    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      children.push(new Paragraph({
        children: inlineRuns(bulletMatch[1]),
        numbering: { reference: "deepseek-bullets", level: 0 },
        spacing: { after: 80 },
      }));
      continue;
    }
    const orderedMatch = /^\d+[.)]\s+(.+)$/.exec(line);
    if (orderedMatch) {
      children.push(new Paragraph({
        children: inlineRuns(orderedMatch[1]),
        numbering: { reference: "deepseek-numbers", level: 0 },
        spacing: { after: 80 },
      }));
      continue;
    }
    children.push(new Paragraph({
      children: inlineRuns(line),
      alignment: AlignmentType.BOTH,
      spacing: { after: 140, line: 320 },
    }));
  }
  flushTable();
  return children;
}

function markdownTable(rows: string[][]): Table {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const columnWidths = Array.from({ length: columnCount }, () => Math.floor(DOCX_CONTENT_WIDTH_DXA / columnCount));
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows: rows.map((row, rowIndex) =>
      new TableRow({
        children: columnWidths.map((width, columnIndex) =>
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            shading: rowIndex === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "EAF2FF" } : undefined,
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: inlineRuns(row[columnIndex] ?? "", { bold: rowIndex === 0 }),
              }),
            ],
          })),
      })),
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D0D5DD", size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: "D0D5DD", size: 1 },
      left: { style: BorderStyle.SINGLE, color: "D0D5DD", size: 1 },
      right: { style: BorderStyle.SINGLE, color: "D0D5DD", size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: "E4E7EC", size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: "E4E7EC", size: 1 },
    },
  });
}

function inlineRuns(text: string, defaults: { bold?: boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), bold: defaults.bold }));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), font: "Consolas", color: "344054" }));
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), bold: defaults.bold }));
  }
  return runs.length > 0 ? runs : [new TextRun("")];
}

function addTitleSlide(pptx: PptxPresentation, title: string, subtitle?: string): void {
  const slide = pptx.addSlide();
  slide.background = { color: PPTX_THEME.paper };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: PPTX_THEME.paper },
    line: { color: PPTX_THEME.paper },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.55,
    y: 0.55,
    w: 0.12,
    h: 5.7,
    fill: { color: PPTX_THEME.blue },
    line: { color: PPTX_THEME.blue },
  });
  slide.addText(title, {
    x: 0.85,
    y: 1.35,
    w: 10.9,
    h: 1.25,
    fontFace: "Microsoft YaHei",
    fontSize: 34,
    bold: true,
    color: PPTX_THEME.ink,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText(subtitle ?? "Generated by DeepSeekCode", {
    x: 0.9,
    y: 2.7,
    w: 9.9,
    h: 0.5,
    fontFace: "Microsoft YaHei",
    fontSize: 15,
    color: PPTX_THEME.muted,
    fit: "shrink",
  });
  addVisualSystem(slide, pptx, 1);
}

function addContentSlide(
  pptx: PptxPresentation,
  content: PlannedPptxAction["slides"][number],
  index: number,
  total: number,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: PPTX_THEME.white };
  slide.addText(content.title, {
    x: 0.55,
    y: 0.35,
    w: 11.4,
    h: 0.55,
    fontFace: "Microsoft YaHei",
    fontSize: 23,
    bold: true,
    color: PPTX_THEME.ink,
    fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 1.02,
    w: 12.1,
    h: 0,
    line: { color: "E4E7EC", width: 1 },
  });

  const bullets = (content.bullets ?? []).slice(0, 6);
  bullets.forEach((bullet, bulletIndex) => {
    const y = 1.38 + bulletIndex * 0.62;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.75,
      y: y + 0.08,
      w: 0.28,
      h: 0.28,
      rectRadius: 0.05,
      fill: { color: bulletColor(bulletIndex) },
      line: { color: bulletColor(bulletIndex) },
    });
    slide.addText(bullet, {
      x: 1.18,
      y,
      w: content.visual ? 6.8 : 10.9,
      h: 0.48,
      fontFace: "Microsoft YaHei",
      fontSize: 14,
      color: PPTX_THEME.ink,
      fit: "shrink",
      breakLine: false,
    });
  });

  if (content.visual) {
    addVisualCard(slide, pptx, content.visual, index);
  } else {
    addVisualSystem(slide, pptx, index + 2);
  }
  slide.addText(`${index + 1}/${total}`, {
    x: 11.85,
    y: 7.05,
    w: 0.75,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 8,
    color: "98A2B3",
    align: "right",
  });
  if (content.speaker_notes) slide.addNotes(content.speaker_notes);
}

function addVisualCard(
  slide: PptxSlide,
  pptx: PptxPresentation,
  visual: string,
  index: number,
): void {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.35,
    y: 1.45,
    w: 4.15,
    h: 4.55,
    rectRadius: 0.09,
    fill: { color: "F2F4F7" },
    line: { color: "D0D5DD", width: 1 },
  });
  const accents = [PPTX_THEME.blue, PPTX_THEME.cyan, PPTX_THEME.green, PPTX_THEME.amber];
  for (let i = 0; i < 4; i += 1) {
    slide.addShape(pptx.ShapeType.arc, {
      x: 8.75 + i * 0.72,
      y: 2.05 + i * 0.35,
      w: 1.2,
      h: 1.2,
      line: { color: accents[(index + i) % accents.length], width: 2 },
      adjustPoint: 0.35,
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: 9.15,
    y: 4.55,
    w: 2.55,
    h: -1.7,
    line: { color: PPTX_THEME.blue, width: 1.5, beginArrowType: "none", endArrowType: "triangle" },
  });
  slide.addText(visual, {
    x: 8.75,
    y: 5.35,
    w: 3.35,
    h: 0.44,
    fontFace: "Microsoft YaHei",
    fontSize: 11,
    color: PPTX_THEME.muted,
    align: "center",
    fit: "shrink",
  });
}

function addVisualSystem(slide: PptxSlide, pptx: PptxPresentation, seed: number): void {
  const colors = [PPTX_THEME.blue, PPTX_THEME.cyan, PPTX_THEME.green, PPTX_THEME.amber];
  for (let i = 0; i < 4; i += 1) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.55 + i * 0.78,
      y: 4.6 - i * 0.38,
      w: 0.55 + i * 0.15,
      h: 0.55 + i * 0.15,
      rectRadius: 0.08,
      fill: { color: colors[(seed + i) % colors.length], transparency: 8 },
      line: { color: colors[(seed + i) % colors.length] },
      rotate: i * 8,
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: 7.35,
    y: 5.6,
    w: 3.6,
    h: -2.25,
    line: { color: "CBD5E1", width: 1.2, beginArrowType: "none", endArrowType: "triangle" },
  });
}

function bulletColor(index: number): string {
  return [PPTX_THEME.blue, PPTX_THEME.green, PPTX_THEME.cyan, PPTX_THEME.amber][index % 4];
}

function ensureExtension(target: string, ext: ".docx" | ".pptx"): string {
  return target.toLowerCase().endsWith(ext) ? target : `${target}${ext}`;
}
