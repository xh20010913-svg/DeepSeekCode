import React from "react";
import { Box, Text } from "ink";
import { diffLineColor } from "./StructuredDiff.js";
import { padRightCells, truncateCells } from "./design/textLayout.js";

export type HighlightedCodeLanguage =
  | "diff"
  | "json"
  | "typescript"
  | "javascript"
  | "shell"
  | "markdown"
  | "plain";

export type HighlightedCodeLine = {
  number: number;
  gutter: string;
  text: string;
  color?: string;
  dim?: boolean;
};

export type HighlightedCodeModel = {
  language: HighlightedCodeLanguage;
  gutterWidth: number;
  contentWidth: number;
  lines: HighlightedCodeLine[];
};

export function HighlightedCode(props: {
  code: string;
  filePath: string;
  width?: number;
  dim?: boolean;
  showLineNumbers?: boolean;
}): React.ReactElement {
  const model = highlightedCodeModel(props.code, props.filePath, props.width ?? 96, {
    showLineNumbers: props.showLineNumbers ?? true,
  });
  const dim = props.dim ?? false;

  return (
    <Box flexDirection="column">
      {model.lines.map((line) => (
        <Box key={`${line.number}:${line.text}`} flexDirection="row">
          {model.gutterWidth > 0 ? (
            <Text color="gray">{line.gutter}</Text>
          ) : null}
          <Text color={line.color} dimColor={dim || line.dim}>
            {line.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function highlightedCodeModel(
  code: string,
  filePath: string,
  width = 96,
  options: { showLineNumbers?: boolean } = {},
): HighlightedCodeModel {
  const language = inferCodeLanguage(filePath);
  const rawLines = code.length > 0 ? code.split(/\r?\n/) : [""];
  const gutterWidth = options.showLineNumbers === false ? 0 : `${rawLines.length}`.length + 2;
  const contentWidth = Math.max(8, width - gutterWidth);
  const lines = rawLines.map((line, index) => {
    const classified = classifyHighlightedCodeLine(line, language);
    return {
      number: index + 1,
      gutter: gutterWidth > 0 ? padRightCells(`${index + 1}`, gutterWidth) : "",
      text: truncateCells(line.length > 0 ? line : " ", contentWidth),
      color: classified.color,
      dim: classified.dim,
    };
  });

  return {
    language,
    gutterWidth,
    contentWidth,
    lines,
  };
}

export function inferCodeLanguage(filePathOrLanguage: string): HighlightedCodeLanguage {
  const value = filePathOrLanguage.trim().toLowerCase();
  const extension = value.includes(".") ? value.split(".").pop() ?? value : value;

  if (["diff", "patch"].includes(extension)) return "diff";
  if (["json", "jsonc"].includes(extension)) return "json";
  if (["ts", "tsx", "typescript"].includes(extension)) return "typescript";
  if (["js", "jsx", "mjs", "cjs", "javascript"].includes(extension)) return "javascript";
  if (["sh", "bash", "zsh", "fish", "ps1", "powershell", "shell"].includes(extension)) return "shell";
  if (["md", "markdown"].includes(extension)) return "markdown";
  return "plain";
}

export function classifyHighlightedCodeLine(
  line: string,
  language: HighlightedCodeLanguage,
): { color?: string; dim?: boolean } {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { color: "gray", dim: true };
  if (/^(error|fatal|failed)\b/i.test(trimmed)) return { color: "red" };

  if (language === "diff") {
    return { color: diffLineColor(line) };
  }

  if (language === "json") {
    if (/^[{}[\],]+$/.test(trimmed)) return { color: "gray" };
    if (/^"[^"]+"\s*:/.test(trimmed)) return { color: "cyan" };
    if (/:\s*"(?:[^"\\]|\\.)*"/.test(trimmed)) return { color: "green" };
    if (/:\s*(true|false|null|\d+)/.test(trimmed)) return { color: "yellow" };
  }

  if (language === "typescript" || language === "javascript") {
    if (/^(\/\/|\/\*|\*)/.test(trimmed)) return { color: "gray", dim: true };
    if (/^(import|export|type|interface|class|function|async function)\b/.test(trimmed)) return { color: "cyan" };
    if (/^(const|let|var|return|if|else|for|while|try|catch|await)\b/.test(trimmed)) return { color: "yellow" };
    if (/["'`]/.test(trimmed)) return { color: "green" };
  }

  if (language === "shell") {
    if (trimmed.startsWith("#")) return { color: "gray", dim: true };
    if (/^(npm|node|git|pnpm|yarn|python|tsx|npx|cd|ls|dir|powershell)\b/i.test(trimmed)) return { color: "cyan" };
  }

  if (language === "markdown") {
    if (trimmed.startsWith("#")) return { color: "cyan" };
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) return { color: "yellow" };
    if (trimmed.startsWith(">")) return { color: "gray" };
  }

  return {};
}
