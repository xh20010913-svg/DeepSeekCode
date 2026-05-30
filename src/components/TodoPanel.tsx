import React from "react";
import { Box, Text } from "ink";
import type { TodoItem } from "../services/todos/todoService.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface TodoPanelModel {
  empty: boolean;
  summary: string;
  ratio: number;
  tone: TerminalTone;
  badges: TodoPanelBadge[];
  rows: TodoPanelRow[];
  hiddenSummary: string;
}

export interface TodoPanelBadge {
  label: string;
  tone: TerminalTone;
}

export interface TodoPanelRow {
  key: string;
  marker: string;
  tone: TerminalTone;
  text: string;
  detail: string;
  active: boolean;
  completed: boolean;
}

export function TodoPanel(props: { todos: TodoItem[]; limit?: number; width?: number }): React.ReactElement {
  const model = todoPanelModel(props.todos, { limit: props.limit });
  const width = props.width ?? 32;
  if (model.empty) {
    return <Text color="gray">No todos</Text>;
  }
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {model.badges.map((badge) => (
          <React.Fragment key={badge.label}>
            <StatusBadge label={badge.label} tone={badge.tone} />
            <Text> </Text>
          </React.Fragment>
        ))}
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Text color="gray">{truncateCells(model.summary.padEnd(12), 12)}</Text>
        <ProgressBar ratio={model.ratio} width={Math.max(8, Math.min(16, width - 18))} filledTone={model.tone} showPercent />
      </Box>
      {model.rows.map((row) => (
        <Box key={row.key} flexDirection="column">
          <Box flexDirection="row">
            <Text color={toneColor(row.tone)}>{row.marker} </Text>
            <Text color={toneColor(row.tone)} bold={row.active} strikethrough={row.completed}>
              {truncateCells(row.text, Math.max(12, width - 4))}
            </Text>
          </Box>
          {row.detail ? (
            <Text color="gray">{truncateCells(`  ${row.detail}`, Math.max(12, width - 2))}</Text>
          ) : null}
        </Box>
      ))}
      {model.hiddenSummary ? <Text color="gray">{truncateCells(model.hiddenSummary, Math.max(12, width))}</Text> : null}
    </Box>
  );
}

export function todoPanelModel(todos: TodoItem[], options: { limit?: number } = {}): TodoPanelModel {
  const limit = Math.max(1, Math.trunc(options.limit ?? 5));
  if (todos.length === 0) {
    return {
      empty: true,
      summary: "0 todos",
      ratio: 0,
      tone: "muted",
      badges: [],
      rows: [],
      hiddenSummary: "",
    };
  }

  const completed = todos.filter((todo) => todo.status === "completed").length;
  const active = todos.filter((todo) => todo.status === "in_progress").length;
  const pending = todos.filter((todo) => todo.status === "pending").length;
  const sorted = [...todos].sort(compareTodoForDisplay);
  const visible = sorted.slice(0, limit);
  const hidden = sorted.slice(limit);
  const badges: TodoPanelBadge[] = [];
  if (active > 0) badges.push({ label: `active ${active}`, tone: "warning" });
  if (pending > 0) badges.push({ label: `pending ${pending}`, tone: "brand" });
  if (completed > 0) badges.push({ label: `done ${completed}`, tone: "success" });

  return {
    empty: false,
    summary: `${completed}/${todos.length} done`,
    ratio: completed / todos.length,
    tone: active > 0 ? "warning" : completed === todos.length ? "success" : "brand",
    badges,
    rows: visible.map(todoRow),
    hiddenSummary: hidden.length > 0 ? hiddenTodoSummary(hidden) : "",
  };
}

function todoRow(todo: TodoItem): TodoPanelRow {
  return {
    key: todo.id,
    marker: markerForStatus(todo.status),
    tone: toneForStatus(todo.status),
    text: todo.status === "in_progress" ? todo.activeForm : todo.content,
    detail: todo.status === "in_progress" && todo.activeForm !== todo.content ? todo.content : "",
    active: todo.status === "in_progress",
    completed: todo.status === "completed",
  };
}

function compareTodoForDisplay(left: TodoItem, right: TodoItem): number {
  const rankDiff = statusRank(left.status) - statusRank(right.status);
  if (rankDiff !== 0) return rankDiff;
  return left.id.localeCompare(right.id);
}

function statusRank(status: TodoItem["status"]): number {
  if (status === "in_progress") return 0;
  if (status === "pending") return 1;
  return 2;
}

function markerForStatus(status: TodoItem["status"]): string {
  if (status === "completed") return "x";
  if (status === "in_progress") return ">";
  return ".";
}

function toneForStatus(status: TodoItem["status"]): TerminalTone {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  return "brand";
}

function hiddenTodoSummary(hidden: TodoItem[]): string {
  const pending = hidden.filter((todo) => todo.status === "pending").length;
  const active = hidden.filter((todo) => todo.status === "in_progress").length;
  const completed = hidden.filter((todo) => todo.status === "completed").length;
  return [
    `+${hidden.length} hidden`,
    active > 0 ? `${active} active` : "",
    pending > 0 ? `${pending} pending` : "",
    completed > 0 ? `${completed} done` : "",
  ].filter(Boolean).join(" | ");
}
