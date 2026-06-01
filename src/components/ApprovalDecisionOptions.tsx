import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { SelectList } from "./design/SelectList.js";
import { gateDecisionOptions, type GateDecisionOption } from "../services/approval/gateDecisionOptions.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ApprovalDecisionOptionModel {
  label: string;
  command: string;
  description: string;
  shortcut?: string;
  tone: "allow" | "reject" | "inspect" | "neutral";
}

export function ApprovalDecisionOptions(props: {
  gateId: string;
  subjectType: string;
  status: string;
  summary: string;
  gate?: ApprovalGateRecord;
  projectPath?: string;
  selectedIndex?: number;
}): React.ReactElement | null {
  const options = props.gate
    ? gateDecisionOptions({ gate: props.gate, projectPath: props.projectPath })
    : approvalDecisionOptionsModel(props);
  if (options.length === 0) return null;

  return (
    <Box flexDirection="column">
      <Text color="gray">choices</Text>
      <SelectList
        selectedIndex={props.selectedIndex ?? 0}
        visibleCount={5}
        width={104}
        options={options.map((option) => ({
          id: option.command,
          label: option.label,
          detail: option.shortcut ?? option.command,
          description: option.description,
          tone: decisionTone(option.tone),
        }))}
      />
    </Box>
  );
}

export function approvalDecisionOptionsModel(input: {
  gateId: string;
  subjectType: string;
  status: string;
  summary: string;
}): ApprovalDecisionOptionModel[] {
  if (input.status !== "pending") return [];
  if (input.subjectType === "question") {
    return [
      {
        label: "inspect",
        command: "/question show latest",
        description: "read the prompt and choices",
        shortcut: "Enter",
        tone: "inspect",
      },
      {
        label: "answer",
        command: "/question answer latest <answer>",
        description: "resume with your answer",
        shortcut: "type answer",
        tone: "allow",
      },
      {
        label: "reject",
        command: "/question reject latest <reason>",
        description: "send it back with feedback",
        shortcut: "N",
        tone: "reject",
      },
    ];
  }

  if (input.subjectType === "plan") {
    return [
      {
        label: "approve",
        command: "/plan approve latest <reason>",
        description: "let the planned run continue",
        shortcut: "Enter / Y",
        tone: "allow",
      },
      {
        label: "reject",
        command: "/plan reject latest <reason>",
        description: "request a different plan",
        shortcut: "N",
        tone: "reject",
      },
      {
        label: "cancel",
        command: "/plan cancel latest <reason>",
        description: "close the plan gate",
        shortcut: "Esc",
        tone: "neutral",
      },
    ];
  }

  const options: ApprovalDecisionOptionModel[] = [
    {
      label: "approve once",
      command: "/approval approve latest <reason>",
      description: "allow this exact action fingerprint",
      shortcut: "Enter / Y",
      tone: "allow",
    },
    {
      label: "reject",
      command: "/approval reject latest <reason>",
      description: "block and send feedback",
      shortcut: "N",
      tone: "reject",
    },
    {
      label: "cancel",
      command: "/approval cancel latest <reason>",
      description: "close without approving",
      shortcut: "Esc",
      tone: "neutral",
    },
  ];

  const diffCommand = diffCommandForSummary(input.summary);
  if (diffCommand) {
    options.push({
      label: "inspect diff",
      command: diffCommand,
      description: "run after retrying the approved edit",
      shortcut: "D",
      tone: "inspect",
    });
  }

  return options;
}

function diffCommandForSummary(summary: string): string {
  const parsed = parseActionSummary(summary);
  if (!parsed || (parsed.action !== "write_file" && parsed.action !== "apply_patch")) return "";
  const path = parsed.fields.find((field) => field.key === "path")?.value.trim();
  if (!path || path === "(unknown)") return "/diff git";
  return `/diff git ${path}`;
}

function decisionTone(tone: GateDecisionOption["tone"]): TerminalTone {
  if (tone === "allow") return "success";
  if (tone === "reject") return "error";
  if (tone === "inspect") return "brand";
  return "muted";
}
