import React from "react";
import { Box, Text } from "ink";
import type { SkillSummary } from "../skills/discovery.js";
import type { LoadedSkill } from "../skills/loader.js";
import type { SkillValidationResult } from "../skills/manifest.js";
import type { SkillSearchResult } from "../services/skills/skillService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { ValidationErrorsList, type ValidationListError } from "./ValidationErrorsList.js";

export interface SkillPanelModel {
  title: string;
  subtitle: string;
  rows: SkillPanelRow[];
  preview?: string[];
  validationErrors?: ValidationListError[];
  footer: string;
}

export interface SkillPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function SkillPanel(props: {
  model: SkillPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="skills" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No skills discovered</Text>
          ) : props.model.rows.map((row) => (
            <SkillPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">skill preview</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <ValidationErrorsList errors={props.model.validationErrors ?? []} width={width - 2} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function skillListPanelModel(skills: SkillSummary[]): SkillPanelModel {
  return {
    title: "Skills",
    subtitle: `${skills.length} discovered skill${skills.length === 1 ? "" : "s"}`,
    rows: skills.map((skill) => skillRow(skill.name, skill.scope, skill.description, skill.path, false)),
    footer: "/skills show <name> | /skills run <name> <task> | /skills create <name> <description>",
  };
}

export function skillSearchPanelModel(skills: SkillSearchResult[], query: string): SkillPanelModel {
  return {
    title: "Skill search",
    subtitle: query ? `query: ${query}` : "all skills",
    rows: skills.map((skill) => skillRow(
      skill.name,
      skill.scope,
      skill.description,
      sourceNote(skill.path, skill.source?.sourcePath),
      skill.disableModelInvocation,
    )),
    footer: "/skills show <name> | /skills install <path> [name]",
  };
}

export function skillDetailPanelModel(skill: LoadedSkill): SkillPanelModel {
  return {
    title: `Skill: ${skill.name}`,
    subtitle: `${skill.scope} / ${skill.path}`,
    rows: [skillRow(
      skill.name,
      skill.scope,
      skill.frontmatter.description ?? skill.description,
      skill.path,
      Boolean(skill.frontmatter.disableModelInvocation),
    )],
    preview: previewLines(skill.prompt),
    footer: `/skills run ${skill.name} <task> | /skills validate ${skill.name}`,
  };
}

export function skillValidationPanelModel(results: SkillValidationResult[]): SkillPanelModel {
  return {
    title: "Skill validation",
    subtitle: `${results.length} validation result${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.ok ? "ok" : "failed",
      tone: result.ok ? "success" : "error",
      detail: result.path || "(missing)",
      note: [
        ...result.errors.map((error) => `error: ${error}`),
        ...result.warnings.map((warning) => `warning: ${warning}`),
      ].join("; "),
    })),
    validationErrors: results.flatMap((result) => [
      ...result.errors.map((error) => ({
        file: result.path || result.name,
        path: result.name,
        message: error,
        severity: "error" as const,
      })),
      ...result.warnings.map((warning) => ({
        file: result.path || result.name,
        path: result.name,
        message: warning,
        severity: "warning" as const,
      })),
    ]),
    footer: "/skills list | /skills show <name>",
  };
}

function SkillPanelRowView(props: {
  row: SkillPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(20, props.width - 38);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(20), 20)}</Text>
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

function skillRow(
  name: string,
  scope: SkillSummary["scope"],
  description: string,
  note: string,
  disableModelInvocation: boolean,
): SkillPanelRow {
  return {
    key: `${scope}/${name}`,
    name: `${scope}/${name}`,
    status: disableModelInvocation ? "local" : scope,
    tone: disableModelInvocation ? "warning" : toneForScope(scope),
    detail: description || "(no description)",
    note: disableModelInvocation ? `${note} / disable-model-invocation` : note,
  };
}

function toneForScope(scope: SkillSummary["scope"]): TerminalTone {
  if (scope === "project") return "success";
  if (scope === "user") return "brand";
  return "muted";
}

function sourceNote(path: string, sourcePath: string | undefined): string {
  return sourcePath ? `${path} source=${sourcePath}` : path;
}

function previewLines(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "---")
    .slice(0, 6);
}
