import React from "react";
import { Box, Text } from "ink";
import { Pane } from "../design/Pane.js";
import { StatusBadge } from "../design/StatusBadge.js";
import { truncateCells } from "../design/textLayout.js";
import { generateAgentMarkdown } from "./generateAgent.js";
import type { AgentDraft } from "./types.js";
import { validateAgentDraft } from "./validateAgent.js";

export interface AgentEditorModel {
  title: string;
  rows: Array<{ label: string; value: string }>;
  errors: string[];
  warnings: string[];
  markdownPreview: string[];
  ready: boolean;
}

export function agentEditorModel(draft: AgentDraft, width = 88): AgentEditorModel {
  const validation = validateAgentDraft(draft);
  const markdownPreview = generateAgentMarkdown(draft)
    .split(/\r?\n/)
    .slice(0, 12)
    .map((line) => truncateCells(line, width));
  return {
    title: draft.name.trim() || "New agent",
    rows: [
      { label: "description", value: draft.description.trim() || "No description" },
      { label: "model", value: draft.model.trim() || "inherit" },
      { label: "color", value: draft.color.trim() || "cyan" },
      { label: "tools", value: draft.tools.length ? draft.tools.join(", ") : "all tools" },
      { label: "max turns", value: String(draft.maxTurns || 1) },
    ],
    errors: validation.errors,
    warnings: validation.warnings,
    markdownPreview,
    ready: validation.ok,
  };
}

export function AgentEditor(props: {
  draft: AgentDraft;
  width: number;
}): React.ReactElement {
  const model = agentEditorModel(props.draft, Math.max(16, props.width - 4));
  return (
    <Pane width={props.width} title={model.title} tone={model.ready ? "success" : "warning"}>
      <Box flexDirection="column">
        <Box>
          <StatusBadge label={model.ready ? "ready" : "draft"} tone={model.ready ? "success" : "warning"} />
        </Box>
        {model.rows.map((row) => (
          <Box key={row.label}>
            <Text color="gray">{row.label.padEnd(13)}</Text>
            <Text>{truncateCells(row.value, Math.max(12, props.width - 17))}</Text>
          </Box>
        ))}
        {model.errors.map((error) => (
          <Text key={`error:${error}`} color="red">error: {error}</Text>
        ))}
        {model.warnings.map((warning) => (
          <Text key={`warning:${warning}`} color="yellow">warning: {warning}</Text>
        ))}
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">markdown</Text>
          {model.markdownPreview.map((line, index) => (
            <Text key={`${index}:${line}`}>{line || " "}</Text>
          ))}
        </Box>
      </Box>
    </Pane>
  );
}
