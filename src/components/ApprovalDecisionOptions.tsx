import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { SelectList } from "./design/SelectList.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ApprovalDecisionOptionModel {
  label: string;
  command: string;
  description: string;
  tone: "allow" | "reject" | "inspect" | "neutral";
}

export function ApprovalDecisionOptions(props: {
  gateId: string;
  subjectType: string;
  status: string;
  summary: string;
}): React.ReactElement | null {
  const options = approvalDecisionOptionsModel(props);
  if (options.length === 0) return null;

  return (
    <Box flexDirection="column">
      <Text color="gray">options</Text>
      <SelectList
        selectedIndex={0}
        visibleCount={5}
        width={104}
        options={options.map((option) => ({
          id: option.command,
          label: option.label,
          detail: option.command,
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
        command: `/question show ${input.gateId}`,
        description: "read the prompt and choices",
        tone: "inspect",
      },
      {
        label: "answer",
        command: `/question answer ${input.gateId} <answer>`,
        description: "resume with your answer",
        tone: "allow",
      },
      {
        label: "reject",
        command: `/question reject ${input.gateId} <reason>`,
        description: "send it back with feedback",
        tone: "reject",
      },
    ];
  }

  if (input.subjectType === "plan") {
    return [
      {
        label: "approve",
        command: `/plan approve ${input.gateId} <reason>`,
        description: "let the planned run continue",
        tone: "allow",
      },
      {
        label: "reject",
        command: `/plan reject ${input.gateId} <reason>`,
        description: "request a different plan",
        tone: "reject",
      },
      {
        label: "cancel",
        command: `/plan cancel ${input.gateId} <reason>`,
        description: "close the plan gate",
        tone: "neutral",
      },
    ];
  }

  const options: ApprovalDecisionOptionModel[] = [
    {
      label: "approve once",
      command: `/approval approve ${input.gateId} <reason>`,
      description: "allow this exact action fingerprint",
      tone: "allow",
    },
    {
      label: "reject",
      command: `/approval reject ${input.gateId} <reason>`,
      description: "block and send feedback",
      tone: "reject",
    },
    {
      label: "cancel",
      command: `/approval cancel ${input.gateId} <reason>`,
      description: "close without approving",
      tone: "neutral",
    },
  ];

  const diffCommand = diffCommandForSummary(input.summary);
  if (diffCommand) {
    options.push({
      label: "inspect diff",
      command: diffCommand,
      description: "run after retrying the approved edit",
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

function decisionTone(tone: ApprovalDecisionOptionModel["tone"]): TerminalTone {
  if (tone === "allow") return "success";
  if (tone === "reject") return "error";
  if (tone === "inspect") return "brand";
  return "muted";
}
