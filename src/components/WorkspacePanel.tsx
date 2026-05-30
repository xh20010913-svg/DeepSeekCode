import React from "react";
import { Box, Text } from "ink";
import type { RunRecord } from "../state/sqlite.js";
import type {
  CheckpointDiffSummary,
  CheckpointRestoreResult,
  CheckpointSummary,
  WorkspaceCheckpoint,
} from "../services/rewind/workspaceCheckpointService.js";
import type { AttachedRunSnapshot } from "../services/attach/attachService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface WorkspacePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  rows: WorkspacePanelRow[];
  footer: string;
}

export interface WorkspacePanelRow {
  key: string;
  label: string;
  value: string;
  tone: TerminalTone;
  note?: string;
}

const CHECKPOINT_FILE_PREVIEW_LIMIT = 12;
const DIFF_PREVIEW_LIMIT = 10;

export function WorkspacePanel(props: {
  model: WorkspacePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(116, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="workspace" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box marginTop={1}>
          <Tabs selectedId="records" title="view" tabs={workspacePanelTabs(props.model)} width={width} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">records</Text>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No workspace records</Text>
          ) : (
            <SelectList options={workspacePanelRowOptions(props.model)} selectedIndex={0} visibleCount={8} width={width} />
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={workspacePanelCommandOptions(props.model)} selectedIndex={0} visibleCount={4} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function checkpointListPanelModel(checkpoints: CheckpointSummary[], checkpointDir: string): WorkspacePanelModel {
  return {
    title: "Checkpoints",
    subtitle: checkpointDir,
    badge: checkpoints.length ? `${checkpoints.length}` : "none",
    badgeTone: checkpoints.length ? "brand" : "muted",
    rows: checkpoints.map((checkpoint) => ({
      key: checkpoint.id,
      label: checkpoint.truncated ? "partial" : "complete",
      value: checkpoint.id,
      tone: checkpoint.truncated ? "warning" : "success",
      note: `${checkpoint.fileCount} files | ${checkpoint.totalBytes} bytes | ${formatTime(checkpoint.createdAtMs)} | ${checkpoint.label}`,
    })),
    footer: "/rewind create [label] | /rewind show <id> | /rewind restore <id>",
  };
}

export function checkpointCreatedPanelModel(checkpoint: WorkspaceCheckpoint): WorkspacePanelModel {
  return checkpointDetailPanelModel(checkpoint, "Checkpoint created");
}

export function checkpointDetailPanelModel(
  checkpoint: WorkspaceCheckpoint,
  title = "Checkpoint detail",
): WorkspacePanelModel {
  const fileRows = checkpoint.files.slice(0, CHECKPOINT_FILE_PREVIEW_LIMIT).map((file) => ({
    key: file.path,
    label: "file",
    value: file.path,
    tone: "muted" as TerminalTone,
    note: `${file.size} bytes | ${file.sha256.slice(0, 12)}`,
  }));
  const clipped = checkpoint.files.length > CHECKPOINT_FILE_PREVIEW_LIMIT
    ? [{
      key: "clipped",
      label: "more",
      value: `${checkpoint.files.length - CHECKPOINT_FILE_PREVIEW_LIMIT} more files`,
      tone: "warning" as TerminalTone,
    }]
    : [];
  return {
    title,
    subtitle: checkpoint.label,
    badge: checkpoint.truncated ? "partial" : "complete",
    badgeTone: checkpoint.truncated ? "warning" : "success",
    rows: [
      {
        key: "summary",
        label: "summary",
        value: checkpoint.id,
        tone: "brand",
        note: `${checkpoint.fileCount} files | ${checkpoint.totalBytes} bytes | ${formatTime(checkpoint.createdAtMs)}`,
      },
      ...fileRows,
      ...clipped,
    ],
    footer: "/rewind diff <id> | /rewind restore <id> [--delete-new]",
  };
}

export function checkpointDiffPanelModel(id: string, diff: CheckpointDiffSummary): WorkspacePanelModel {
  const lines = diff.diff
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, DIFF_PREVIEW_LIMIT);
  return {
    title: "Checkpoint diff",
    subtitle: id,
    badge: diff.changed ? "changed" : "clean",
    badgeTone: diff.changed ? "warning" : "success",
    rows: [
      {
        key: "summary",
        label: "summary",
        value: `changed=${diff.changed} added=${diff.added} removed=${diff.removed}`,
        tone: diff.changed ? "warning" : "success",
      },
      ...lines.map((line, index) => ({
        key: `line-${index}`,
        label: diffLineLabel(line),
        value: line,
        tone: diffLineTone(line),
      })),
    ],
    footer: "/diff git | /rewind restore <id> | /export status",
  };
}

export function checkpointRestorePanelModel(
  id: string,
  result: CheckpointRestoreResult,
  deleteNew: boolean,
): WorkspacePanelModel {
  return {
    title: "Checkpoint restore",
    subtitle: id,
    badge: "restored",
    badgeTone: result.restored || result.deleted ? "success" : "brand",
    rows: [
      { key: "restored", label: "restored", value: String(result.restored), tone: "success" },
      { key: "deleted", label: "deleted", value: String(result.deleted), tone: deleteNew ? "warning" : "muted" },
      { key: "skipped", label: "skipped", value: String(result.skipped), tone: "muted" },
    ],
    footer: "/diff git | /rewind list | /validation",
  };
}

export function checkpointPathPanelModel(checkpointDir: string): WorkspacePanelModel {
  return {
    title: "Checkpoint path",
    subtitle: checkpointDir,
    badge: "path",
    badgeTone: "brand",
    rows: [{ key: "path", label: "path", value: checkpointDir, tone: "brand" }],
    footer: "/rewind list | /rewind create [label]",
  };
}

export function attachListPanelModel(runs: RunRecord[], currentRunId?: string): WorkspacePanelModel {
  return {
    title: "Attachable runs",
    subtitle: currentRunId ? `current=${currentRunId}` : "No attached run",
    badge: runs.length ? `${runs.length}` : "none",
    badgeTone: runs.length ? "brand" : "muted",
    rows: runs.map((run) => runRow(run, currentRunId === run.id ? "current" : run.status)),
    footer: "/attach latest | /attach use <run-id> | /attach clear",
  };
}

export function attachCurrentPanelModel(snapshot: AttachedRunSnapshot): WorkspacePanelModel {
  if (!snapshot.runId) {
    return {
      title: "Attached run",
      subtitle: "No attached run",
      badge: "none",
      badgeTone: "muted",
      rows: [],
      footer: "/attach list | /attach latest",
    };
  }
  if (!snapshot.run) {
    return {
      title: "Attached run",
      subtitle: snapshot.runId,
      badge: "missing",
      badgeTone: "warning",
      rows: [{ key: "missing", label: "missing", value: snapshot.runId, tone: "warning" }],
      footer: "/attach clear | /runs",
    };
  }
  return {
    title: "Attached run",
    subtitle: snapshot.run.id,
    badge: snapshot.run.status,
    badgeTone: runTone(snapshot.run.status),
    rows: [runRow(snapshot.run, "current")],
    footer: "/tasks attached | /queue attached | /trace attached",
  };
}

export function attachActionPanelModel(run: RunRecord, action: "attached" | "cleared"): WorkspacePanelModel {
  return {
    title: action === "attached" ? "Run attached" : "Attached run cleared",
    subtitle: run.id,
    badge: action,
    badgeTone: action === "attached" ? "success" : "muted",
    rows: [runRow(run, action)],
    footer: action === "attached" ? "/tasks attached | /trace attached | /attach clear" : "/attach list | /runs",
  };
}

export function attachClearedPanelModel(runId?: string): WorkspacePanelModel {
  return {
    title: "Attached run cleared",
    subtitle: runId ?? "No previous run",
    badge: "cleared",
    badgeTone: "muted",
    rows: runId ? [{ key: "cleared", label: "cleared", value: runId, tone: "muted" }] : [],
    footer: "/attach list | /attach latest",
  };
}

export function workspacePanelTabs(model: WorkspacePanelModel): TabItem[] {
  return [
    { id: "records", title: "records", count: model.rows.length, tone: model.rows.length > 0 ? "brand" : "muted" },
    { id: "commands", title: "commands", count: workspacePanelCommandOptions(model).length, tone: "muted" },
  ];
}

export function workspacePanelRowOptions(model: WorkspacePanelModel): SelectListOption[] {
  return model.rows.map((row, index) => ({
    id: row.key,
    label: row.label,
    detail: row.value,
    description: row.note,
    selected: index === 0,
    tone: row.tone,
  }));
}

export function workspacePanelCommandOptions(model: WorkspacePanelModel): SelectListOption[] {
  const lowerTitle = model.title.toLowerCase();
  if (lowerTitle.includes("checkpoint diff")) {
    return [
      commandOption("restore", "/rewind restore <id>", "restore files from this checkpoint", "warning"),
      commandOption("diff", "/diff git", "compare current workspace state", "brand"),
      commandOption("list", "/rewind list", "return to checkpoint list", "muted"),
    ];
  }
  if (lowerTitle.includes("checkpoint restore")) {
    return [
      commandOption("diff", "/diff git", "inspect workspace after restore", "brand"),
      commandOption("list", "/rewind list", "return to checkpoint list", "success"),
      commandOption("validation", "/validation", "check artifact validation gates", "muted"),
    ];
  }
  if (lowerTitle.includes("checkpoint")) {
    return [
      commandOption("show", "/rewind show <id>", "inspect checkpoint file snapshot", "brand"),
      commandOption("diff", "/rewind diff <id>", "preview changes before restore", "success"),
      commandOption("restore", "/rewind restore <id>", "restore tracked text files", "warning"),
      commandOption("create", "/rewind create [label]", "capture a new checkpoint", "muted"),
    ];
  }
  if (lowerTitle.includes("attachable")) {
    return [
      commandOption("latest", "/attach latest", "focus the most recent unfinished run", "brand"),
      commandOption("use", "/attach use <run-id>", "focus a specific run", "success"),
      commandOption("clear", "/attach clear", "clear attached run focus", "muted"),
    ];
  }
  if (lowerTitle.includes("attached") || lowerTitle.includes("run attached")) {
    return [
      commandOption("tasks", "/tasks attached", "show attached run tasks", "brand"),
      commandOption("queue", "/queue attached", "show runnable task queue", "success"),
      commandOption("trace", "/trace attached", "inspect attached run events", "warning"),
      commandOption("clear", "/attach clear", "clear attached focus", "muted"),
    ];
  }
  return [
    commandOption("rewind", "/rewind list", "browse workspace checkpoints", "brand"),
    commandOption("attach", "/attach list", "browse attachable runs", "success"),
  ];
}

function commandOption(id: string, detail: string, description: string, tone: TerminalTone): SelectListOption {
  return {
    id,
    label: id,
    detail,
    description,
    tone,
  };
}

function runRow(run: RunRecord, label: string): WorkspacePanelRow {
  return {
    key: run.id,
    label,
    value: run.id,
    tone: label === "current" || label === "attached" ? "success" : runTone(run.status),
    note: `${run.status} | actions=${run.actionCount} artifacts=${run.artifactCount} events=${run.eventCount} | ${run.message || "(no message)"}`,
  };
}

function runTone(status: string): TerminalTone {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "paused") return "warning";
  return "muted";
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function diffLineLabel(line: string): string {
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("file ")) return "file";
  return "diff";
}

function diffLineTone(line: string): TerminalTone {
  if (line.startsWith("+")) return "success";
  if (line.startsWith("-")) return "error";
  if (line.startsWith("@@")) return "brand";
  if (line.startsWith("file ")) return "warning";
  return "muted";
}
