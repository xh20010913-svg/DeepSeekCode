import React from "react";
import { Box, Text } from "ink";
import type { ContextBundle } from "../context/contextBundle.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { ContextSuggestions, type ContextSuggestion } from "./ContextSuggestions.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ContextPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export interface ContextPanelModel {
  title: string;
  subtitle: string;
  rows: ContextPanelRow[];
  suggestions?: ContextSuggestion[];
  preview?: string[];
  footer: string;
}

export function ContextPanel(props: {
  model: ContextPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="context" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No context files</Text>
          ) : props.model.rows.map((row) => (
            <ContextPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <ContextSuggestions suggestions={props.model.suggestions} width={width} />
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">prompt preview</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function contextMapPanelModel(bundle: ContextBundle): ContextPanelModel {
  return {
    title: "Repository map",
    subtitle: `${bundle.repositoryMap.files.length} files / approx ${bundle.approxTokens} prompt tokens`,
    rows: bundle.repositoryMap.files.slice(0, 24).map((file) => ({
      key: file.path,
      name: file.path,
      status: file.ext || "file",
      tone: toneForExt(file.ext),
      detail: `${file.size} bytes`,
      note: bundle.selectedFiles.some((selected) => selected.path === file.path) ? "selected for prompt" : "",
      })),
    suggestions: contextMapSuggestions(bundle),
    footer: "/context files | /context prompt | /files <goal>",
  };
}

export function contextFilesPanelModel(bundle: ContextBundle, goal = ""): ContextPanelModel {
  return {
    title: "Selected context",
    subtitle: `${bundle.selectedFiles.length} files / approx ${bundle.approxTokens} tokens${goal ? ` / goal: ${goal}` : ""}`,
    rows: bundle.selectedFiles.map((file) => ({
      key: file.path,
      name: file.path,
      status: `score ${file.score}`,
      tone: file.truncated ? "warning" : "success",
      detail: `${file.content.length} chars`,
      note: file.truncated ? "truncated excerpt" : "full excerpt",
    })),
    suggestions: contextFilesSuggestions(bundle, goal),
    footer: "/context prompt | /cache plan <goal>",
  };
}

export function contextPromptPanelModel(bundle: ContextBundle, prompt: string): ContextPanelModel {
  return {
    title: "Prompt context",
    subtitle: `${bundle.selectedFiles.length} files / approx ${bundle.approxTokens} tokens`,
    rows: bundle.selectedFiles.slice(0, 12).map((file) => ({
      key: file.path,
      name: file.path,
      status: file.truncated ? "truncated" : "included",
      tone: file.truncated ? "warning" : "success",
      detail: `${file.content.length} chars`,
      note: `score=${file.score}`,
    })),
    suggestions: contextPromptSuggestions(bundle),
    preview: promptPreview(prompt),
    footer: "/cache plan <goal> | /files <goal>",
  };
}

function contextMapSuggestions(bundle: ContextBundle): ContextSuggestion[] {
  const suggestions: ContextSuggestion[] = [];
  if (bundle.repositoryMap.truncated) {
    suggestions.push({
      severity: "warning",
      title: "Repository map is clipped",
      detail: "The scan hit its file limit. Use /files <goal> so DeepSeekCode can rank a smaller, cache-stable slice.",
      command: "/files <goal>",
    });
  }
  if (bundle.selectedFiles.length === 0) {
    suggestions.push({
      severity: "info",
      title: "No prompt files selected",
      detail: "Build a focused prompt bundle before a costly model call to improve DeepSeek prefix reuse.",
      command: "/files <goal>",
    });
  }
  return suggestions;
}

function contextFilesSuggestions(bundle: ContextBundle, goal: string): ContextSuggestion[] {
  const suggestions = sharedContextSuggestions(bundle);
  if (bundle.selectedFiles.length === 0) {
    suggestions.unshift({
      severity: "info",
      title: "No prompt files selected",
      detail: "Pick a narrow goal so the same stable project prefix can be reused across follow-up turns.",
      command: goal ? `/files ${goal}` : "/files <goal>",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      severity: "success",
      title: "Context shape is cache friendly",
      detail: "Selected excerpts are small enough to keep stable instructions and cache pins near the front.",
    });
  }
  return suggestions;
}

function contextPromptSuggestions(bundle: ContextBundle): ContextSuggestion[] {
  return sharedContextSuggestions(bundle);
}

function sharedContextSuggestions(bundle: ContextBundle): ContextSuggestion[] {
  const suggestions: ContextSuggestion[] = [];
  if (bundle.selectedFiles.some((file) => file.truncated)) {
    suggestions.push({
      severity: "warning",
      title: "Some excerpts are truncated",
      detail: "The model may miss tail-end code. Narrow the goal or pin the exact files before asking for edits.",
      command: "/files <goal>",
    });
  }
  const large = largeContextSuggestion(bundle.approxTokens);
  if (large) suggestions.push(large);
  return suggestions;
}

function largeContextSuggestion(approxTokens: number): ContextSuggestion | undefined {
  if (approxTokens >= 50_000) {
    return {
      severity: "error",
      title: "Context is too large",
      detail: "DeepSeek cache reuse drops when dynamic file excerpts dominate the prefix. Plan a smaller stable bundle first.",
      savingsTokens: Math.round(approxTokens * 0.45),
      command: "/cache plan <goal>",
    };
  }
  if (approxTokens >= 20_000) {
    return {
      severity: "warning",
      title: "Context is getting expensive",
      detail: "Move stable facts into cache pins and keep changing file excerpts later in the prompt.",
      savingsTokens: Math.round(approxTokens * 0.3),
      command: "/cache plan <goal>",
    };
  }
  return undefined;
}

function ContextPanelRowView(props: {
  row: ContextPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(18, props.width - 46);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(28), 28)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box flexDirection="row">
          <Text color="gray">  </Text>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function toneForExt(ext: string): TerminalTone {
  if (ext === ".ts" || ext === ".tsx") return "brand";
  if (ext === ".md") return "success";
  if (ext === ".json" || ext === ".toml" || ext === ".yml" || ext === ".yaml") return "warning";
  return "muted";
}

function promptPreview(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}
