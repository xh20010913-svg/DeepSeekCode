import React from "react";
import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { MemoryUpdateNotification } from "./MemoryUpdateNotification.js";

export interface ProjectMemoryPanelModel {
  title: string;
  subtitle: string;
  lines: string[];
  footer: string;
}

export function ProjectMemoryPanel(props: {
  model: ProjectMemoryPanelModel;
  updated?: boolean;
  projectPath?: string;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="memory" tone="brand" paddingX={1}>
        {props.updated && (
          <MemoryUpdateNotification
            memoryPath={props.model.subtitle}
            projectPath={props.projectPath}
            width={width - 4}
          />
        )}
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.lines.length}`} tone={props.model.lines.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.lines.length === 0 ? (
            <Text color="gray">Project memory is empty</Text>
          ) : props.model.lines.slice(-12).map((line, index) => (
            <Text key={`${index}-${line}`} color="gray">{truncateCells(line, Math.max(24, width - 4))}</Text>
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function projectMemoryPanelModel(memory: string, path: string): ProjectMemoryPanelModel {
  const lines = memory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    title: "Project memory",
    subtitle: path,
    lines,
    footer: "/memory add <text> | /memory path",
  };
}
