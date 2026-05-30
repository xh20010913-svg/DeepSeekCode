import React from "react";
import { Box, Text } from "ink";
import type { LoadedAgent } from "../../agents/loader.js";
import { Pane } from "../design/Pane.js";
import { StatusBadge } from "../design/StatusBadge.js";
import { truncateCells } from "../design/textLayout.js";
import { agentPathLabel } from "./agentFileUtils.js";
import { agentScopeTone, compactAgentDescription, summarizeAgentTools } from "./utils.js";

export interface AgentDetailRow {
  label: string;
  value: string;
}

export interface AgentDetailModel {
  title: string;
  status: string;
  rows: AgentDetailRow[];
  promptPreview: string[];
}

export function agentDetailModel(input: {
  agent: LoadedAgent;
  projectPath?: string;
  width?: number;
}): AgentDetailModel {
  const width = input.width ?? 88;
  const agent = input.agent;
  const promptPreview = agent.prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => truncateCells(line, width));
  return {
    title: agent.name,
    status: agent.scope,
    rows: [
      { label: "scope", value: agent.scope },
      { label: "model", value: agent.model || "inherit" },
      { label: "tools", value: summarizeAgentTools(agent.tools) },
      { label: "skills", value: summarizeAgentTools(agent.skills, 3) },
      { label: "path", value: agentPathLabel(agent.path, input.projectPath) },
      { label: "description", value: compactAgentDescription(agent.description, width) },
    ],
    promptPreview,
  };
}

export function AgentDetail(props: {
  agent: LoadedAgent | null;
  projectPath?: string;
  width: number;
}): React.ReactElement {
  if (!props.agent) {
    return (
      <Pane width={props.width} title="Agent detail" tone="muted">
        <Text color="gray">No agent selected</Text>
      </Pane>
    );
  }
  const model = agentDetailModel({ agent: props.agent, projectPath: props.projectPath, width: props.width - 4 });
  return (
    <Pane width={props.width} title={model.title} tone={agentScopeTone(props.agent.scope)}>
      <Box flexDirection="column">
        <Box>
          <StatusBadge label={model.status} tone={agentScopeTone(props.agent.scope)} />
        </Box>
        {model.rows.map((row) => (
          <Box key={row.label}>
            <Text color="gray">{row.label.padEnd(12)}</Text>
            <Text>{truncateCells(row.value, Math.max(12, props.width - 16))}</Text>
          </Box>
        ))}
        {model.promptPreview.length ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">prompt</Text>
            {model.promptPreview.map((line, index) => (
              <Text key={`${index}:${line}`}>{line}</Text>
            ))}
          </Box>
        ) : null}
      </Box>
    </Pane>
  );
}
