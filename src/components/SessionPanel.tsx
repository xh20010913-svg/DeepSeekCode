import React from "react";
import { Box, Text } from "ink";
import type { TranscriptRecord } from "../services/session/sessionStorage.js";
import type { SessionMetadata } from "../services/session/sessionMetadata.js";
import type { ResumeSessionPreview } from "../services/session/resumeService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor } from "./design/terminalTheme.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { MessageSelector, messageSelectorModel, type MessageSelectorModel } from "./MessageSelector.js";
import { SessionPreview, sessionPreviewModel, type SessionPreviewModel } from "./SessionPreview.js";
import { TagTabs } from "./TagTabs.js";

export interface SessionFileSummary {
  sessionId: string;
  path: string;
  updatedAtMs: number;
  bytes: number;
}

export interface SessionPanelModel {
  title: string;
  subtitle: string;
  rows: SessionPanelRow[];
  timeline?: SessionTimelineRow[];
  timelineSummary?: string;
  selector?: MessageSelectorModel;
  preview?: SessionPreviewModel;
  tags?: string[];
  footer: string;
}

export interface SessionPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export interface SessionTimelineRow {
  key: string;
  role: string;
  tone: TerminalTone;
  marker: string;
  text: string;
  note: string;
  selected: boolean;
}

export function SessionPanel(props: {
  model: SessionPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  const timeline = props.model.timeline ?? [];
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="sessions" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box marginTop={1}>
          <Tabs selectedId={timeline.length > 0 ? "timeline" : "records"} title="view" tabs={sessionPanelTabs(props.model)} width={width} />
        </Box>
        {props.model.tags?.length ? (
          <Box marginTop={1}>
            <TagTabs tags={props.model.tags} selectedIndex={0} availableWidth={width - 4} />
          </Box>
        ) : null}
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">records</Text>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No persisted sessions</Text>
          ) : (
            <SelectList options={sessionPanelRowOptions(props.model)} selectedIndex={0} visibleCount={6} width={width} />
          )}
        </Box>
        {timeline.length > 0 ? (
          <SessionTimelineBlock rows={timeline} summary={props.model.timelineSummary} width={width} />
        ) : null}
        {props.model.selector ? (
          <MessageSelector model={props.model.selector} width={width} />
        ) : null}
        {props.model.preview ? (
          <SessionPreview model={props.model.preview} width={width} />
        ) : null}
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={sessionPanelCommandOptions(props.model)} selectedIndex={0} visibleCount={4} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function sessionListPanelModel(
  sessions: SessionFileSummary[],
  metadata: Record<string, SessionMetadata>,
  currentSessionId?: string,
): SessionPanelModel {
  return {
    title: "Sessions",
    subtitle: `${sessions.length} persisted session${sessions.length === 1 ? "" : "s"}`,
    tags: sessionTagsFromMetadata(Object.values(metadata)),
    rows: sessions.map((session) => {
      const info = metadata[session.sessionId];
      const isCurrent = session.sessionId === currentSessionId;
      return {
        key: session.sessionId,
        name: session.sessionId,
        status: isCurrent ? "current" : "saved",
        tone: isCurrent ? "success" : "muted",
        detail: info?.title || "(untitled)",
        note: [
          `${Math.round(session.bytes / 1024)}KB`,
          info?.tags?.length ? info.tags.map((tag) => `#${tag}`).join(" ") : "",
          session.path,
        ].filter(Boolean).join(" "),
      };
    }),
    footer: "/resume <session-id> | /sessions show <session-id> | /tag <tag>",
  };
}

export function sessionTranscriptPanelModel(sessionId: string, records: TranscriptRecord[]): SessionPanelModel {
  const timeline = sessionTimelineRows(records);
  return {
    title: `Session: ${sessionId}`,
    subtitle: `${records.length} transcript record${records.length === 1 ? "" : "s"}`,
    rows: records.slice(-12).map((record) => ({
      key: record.id,
      name: record.role,
      status: record.role,
      tone: toneForRole(record.role),
      detail: record.text,
      note: record.runId ? `run=${record.runId}` : "",
    })),
    timeline,
    timelineSummary: timelineSummary(records, timeline.length),
    selector: messageSelectorModel(records, { title: "transcript selector" }),
    preview: sessionPreviewModel(records, "transcript preview"),
    tags: [],
    footer: "/resume <session-id> | /rename <title>",
  };
}

export function sessionResumePanelModel(preview: ResumeSessionPreview): SessionPanelModel {
  const timeline = sessionTimelineRows(preview.records);
  return {
    title: `Resumed: ${preview.sessionId}`,
    subtitle: [
      preview.title || "(untitled)",
      preview.tags?.length ? preview.tags.map((tag) => `#${tag}`).join(" ") : "",
    ].filter(Boolean).join(" "),
    tags: preview.tags,
    rows: preview.records.slice(-12).map((record) => ({
      key: record.id,
      name: record.role,
      status: record.role,
      tone: toneForRole(record.role),
      detail: record.text,
      note: record.runId ? `run=${record.runId}` : "",
    })),
    timeline,
    timelineSummary: timelineSummary(preview.records, timeline.length),
    selector: messageSelectorModel(preview.records, { title: "resume selector" }),
    preview: sessionPreviewModel(preview.records, "resume preview"),
    footer: "/rename <title> | /tag <tag> | /sessions show <session-id>",
  };
}

export function sessionFocusPanelModel(input: {
  sessionId?: string;
  action: "current" | "cleared";
  title?: string;
  tags?: string[];
}): SessionPanelModel {
  const tags = input.tags?.length ? input.tags.map((tag) => `#${tag}`).join(" ") : "(none)";
  return {
    title: input.action === "cleared" ? "Session focus cleared" : "Current session",
    subtitle: input.sessionId ?? "No resumed session",
    tags: input.tags,
    rows: input.sessionId ? [{
      key: input.sessionId,
      name: input.sessionId,
      status: input.action,
      tone: input.action === "cleared" ? "muted" : "success",
      detail: input.title || "(untitled)",
      note: `tags=${tags}`,
    }] : [],
    footer: "/resume <session-id> | /sessions | /tag current",
  };
}

export function sessionMetadataPanelModel(
  record: SessionMetadata,
  action: "renamed" | "tagged" | "cleared" | "current",
): SessionPanelModel {
  const tags = record.tags?.length ? record.tags.map((tag) => `#${tag}`).join(" ") : "(none)";
  return {
    title: action === "renamed" ? "Session renamed" : "Session tags",
    subtitle: record.sessionId,
    tags: record.tags,
    rows: [
      {
        key: "title",
        name: record.sessionId,
        status: action,
        tone: action === "cleared" ? "muted" : "success",
        detail: record.title || "(untitled)",
        note: `tags=${tags}`,
      },
    ],
    footer: "/sessions | /resume current | /tag list",
  };
}

function sessionTagsFromMetadata(records: SessionMetadata[]): string[] {
  const tags = new Set<string>();
  for (const record of records) {
    for (const tag of record.tags ?? []) {
      if (tag.trim()) tags.add(tag.trim());
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function sessionPanelTabs(model: SessionPanelModel): TabItem[] {
  return [
    { id: "records", title: "records", count: model.rows.length, tone: model.rows.length > 0 ? "brand" : "muted" },
    { id: "timeline", title: "timeline", count: model.timeline?.length ?? 0, tone: model.timeline?.length ? "brand" : "muted" },
    { id: "commands", title: "commands", count: sessionPanelCommandOptions(model).length, tone: "muted" },
  ];
}

export function sessionPanelRowOptions(model: SessionPanelModel): SelectListOption[] {
  return model.rows.map((row, index) => ({
    id: row.key,
    label: row.name,
    detail: `${row.status} | ${firstLine(row.detail, 48)}`,
    description: row.note,
    selected: index === 0,
    tone: row.tone,
  }));
}

export function sessionPanelCommandOptions(model: SessionPanelModel): SelectListOption[] {
  const lowerTitle = model.title.toLowerCase();
  if (lowerTitle.startsWith("session:")) {
    return [
      commandOption("resume", "/resume <session-id>", "set this transcript as the current session", "brand"),
      commandOption("rename", "/rename <title>", "rename the current session", "success"),
      commandOption("tag", "/tag <tag>", "add or remove a searchable session tag", "warning"),
      commandOption("sessions", "/sessions", "return to session list", "muted"),
    ];
  }
  if (lowerTitle.startsWith("resumed:")) {
    return [
      commandOption("rename", "/rename <title>", "name this resumed conversation", "brand"),
      commandOption("tag", "/tag <tag>", "label this session for search", "success"),
      commandOption("show", "/sessions show <session-id>", "open transcript timeline", "muted"),
    ];
  }
  if (lowerTitle.includes("focus") || lowerTitle.includes("current")) {
    return [
      commandOption("sessions", "/sessions", "browse saved transcript sessions", "brand"),
      commandOption("resume", "/resume <session-id>", "switch current session focus", "success"),
      commandOption("tag", "/tag current", "show tags for current session", "muted"),
    ];
  }
  return [
    commandOption("resume", "/resume <session-id>", "continue from a saved transcript", "brand"),
    commandOption("show", "/sessions show <session-id>", "inspect recent messages before resuming", "success"),
    commandOption("tag", "/tag <tag>", "mark sessions for later search", "warning"),
  ];
}

function SessionTimelineBlock(props: {
  rows: SessionTimelineRow[];
  summary?: string;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{props.summary ?? "timeline"}</Text>
      {props.rows.map((row) => (
        <Box flexDirection="row">
          <Text color={toneColor(row.selected ? "brand" : "muted")}>{row.marker} </Text>
          <StatusBadge label={row.role} tone={row.tone} />
          <Text color="gray"> </Text>
          <Text color={toneColor(row.tone)}>{truncateCells(row.text, Math.max(16, props.width - 34))}</Text>
          {row.note ? <Text color="gray">{truncateCells(` ${row.note}`, 20)}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}

export function sessionTimelineRows(records: TranscriptRecord[], limit = 8): SessionTimelineRow[] {
  const visible = records.slice(-Math.max(1, limit));
  return visible.map((record, index) => {
    const selected = index === visible.length - 1;
    return {
      key: record.id,
      role: record.role,
      tone: toneForRole(record.role),
      marker: selected ? ">" : " ",
      text: firstLine(record.text, 120),
      note: record.runId ? `run=${shortId(record.runId)}` : relativeRecordTime(record.createdAtMs),
      selected,
    };
  });
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

function timelineSummary(records: TranscriptRecord[], visibleCount: number): string {
  if (records.length === 0) return "timeline empty";
  const hidden = Math.max(0, records.length - visibleCount);
  return hidden > 0 ? `timeline last ${visibleCount} / +${hidden} older` : `timeline ${visibleCount} message${visibleCount === 1 ? "" : "s"}`;
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, Math.max(0, max - 3))}...` : line;
}

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

function relativeRecordTime(createdAtMs: number): string {
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function toneForRole(role: TranscriptRecord["role"]): TerminalTone {
  if (role === "assistant") return "success";
  if (role === "user") return "brand";
  if (role === "error") return "error";
  if (role === "tool") return "warning";
  return "muted";
}
