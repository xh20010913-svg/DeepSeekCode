import React from "react";
import { Box, Text, useStdout } from "ink";
import type { Command } from "../types/command.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";

interface HelpCategory {
  title: string;
  description: string;
  names: string[];
}

const CATEGORIES: HelpCategory[] = [
  {
    title: "Start Here",
    description: "Setup, diagnostics, and current runtime state.",
    names: ["doctor", "init", "status", "model", "config", "version", "help"],
  },
  {
    title: "Conversation",
    description: "Sessions, transcripts, tags, and context compaction.",
    names: ["resume", "rename", "sessions", "tag", "compact", "clear", "export"],
  },
  {
    title: "Context And Cache",
    description: "Project files, extra workspaces, memory, DeepSeek cache planning.",
    names: ["files", "context", "add-dir", "memory", "cache", "effort", "usage", "stats", "cost"],
  },
  {
    title: "Workflows",
    description: "Plans, todos, task queues, run control, and side questions.",
    names: ["plan", "question", "todos", "todo", "tasks", "runs", "attach", "queue", "pause", "run-resume", "cancel", "btw"],
  },
  {
    title: "Code Review",
    description: "Git state, diffs, review prompts, and validation gates.",
    names: ["branch", "diff", "review", "security-review", "validation", "trace", "events", "logs"],
  },
  {
    title: "Tools And Extensions",
    description: "Agents, skills, plugins, hooks, MCP, browser, SSH, and permissions.",
    names: ["tools", "cmd", "shell", "agents", "skills", "plugins", "hooks", "mcp", "browser", "ssh", "permissions", "approval", "multi"],
  },
];

export function HelpPanel(props: { commands: Command[] }): React.ReactElement {
  const { stdout } = useStdout();
  const width = Math.max(64, Math.min(stdout.columns ?? 100, 118));
  const commands = visibleUniqueCommands(props.commands);
  const commandByName = new Map(commands.map((command) => [command.name, command]));
  const categorized = new Set<string>();
  const custom = commands.filter((command) => !CATEGORIES.some((category) => category.names.includes(command.name)));

  return (
    <Pane width={width} title="DeepSeekCode help" tone="brand" paddingX={1}>
      <Box justifyContent="space-between" paddingTop={1}>
        <Box>
          <StatusBadge label={`${commands.length} commands`} tone="brand" />
          <Text color="gray">  Type /command or use /help to browse.</Text>
        </Box>
        <Text color="gray">Esc/Ctrl+C exits the TUI</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {CATEGORIES.map((category) => {
          const sectionCommands = category.names
            .map((name) => commandByName.get(name))
            .filter((command): command is Command => Boolean(command));
          for (const command of sectionCommands) categorized.add(command.name);
          return (
            <HelpSection
              key={category.title}
              title={category.title}
              description={category.description}
              commands={sectionCommands}
              width={width}
            />
          );
        })}
        {custom.length > 0 && (
          <HelpSection
            title="Project Commands"
            description="Commands discovered from project, user, cache, or plugins."
            commands={custom.filter((command) => !categorized.has(command.name))}
            width={width}
          />
        )}
      </Box>
    </Pane>
  );
}

function HelpSection(props: {
  title: string;
  description: string;
  commands: Command[];
  width: number;
}): React.ReactElement | null {
  if (props.commands.length === 0) return null;
  const commandWidth = props.width >= 96 ? 29 : 24;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>{props.title}</Text>
        <Text color="gray">{`  ${props.description}`}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        {props.commands.map((command) => (
          <Box key={command.name}>
            <Text color="cyan">{padRight(formatUsage(command), commandWidth)}</Text>
            <Text color="gray">{truncate(command.description, Math.max(24, props.width - commandWidth - 6))}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function visibleUniqueCommands(commands: Command[]): Command[] {
  const seen = new Set<string>();
  const visible: Command[] = [];
  for (const command of commands) {
    if (command.hidden || seen.has(command.name)) continue;
    seen.add(command.name);
    visible.push(command);
  }
  return visible.sort((a, b) => a.name.localeCompare(b.name));
}

function formatUsage(command: Command): string {
  return `/${command.name}${command.usage ? ` ${command.usage}` : ""}`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return `${value.slice(0, width - 3)}...`;
  return `${value}${" ".repeat(width - value.length)}`;
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 3))}...`;
}
