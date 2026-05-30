import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { flattenCellText, truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { QuestionRecord } from "../services/questions/questionService.js";

export interface QuestionOptionModel {
  label: string;
  description: string;
  preview: string;
}

export interface QuestionItemModel {
  header: string;
  question: string;
  multiSelect: boolean;
  options: QuestionOptionModel[];
}

export interface QuestionPanelCommand {
  label: string;
  command: string;
  description: string;
  tone: "allow" | "reject" | "inspect";
}

export interface QuestionPanelModel {
  title: string;
  gateId: string;
  runId: string;
  status: string;
  answer: string;
  questions: QuestionItemModel[];
  commands: QuestionPanelCommand[];
}

export function QuestionPanel(props: {
  record: QuestionRecord;
  title?: string;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(42, Math.min(104, columns - 4));
  const model = questionPanelModel(props.record, props.title);
  return (
    <Pane width={width} title={model.title} tone={toneForStatus(model.status)} paddingX={1}>
      <Text>
        <StatusBadge label={model.status} tone={toneForStatus(model.status)} />
        {" "}
        <Text color="gray">{model.gateId}</Text>
      </Text>
      <QuestionRow label="run" value={model.runId} />
      {model.answer ? <QuestionRow label="answer" value={model.answer} color="green" /> : null}
      {model.questions.map((question, index) => (
        <Box key={`${index}-${question.question}`} flexDirection="column" marginTop={1}>
          <Text>
            <Text color="cyan">{`${index + 1}. ${question.header}`}</Text>
            {" "}
            <Text>{question.question}</Text>
            {question.multiSelect ? <Text color="gray"> multi</Text> : null}
          </Text>
          {question.options.map((option) => (
            <Box key={option.label} flexDirection="column" paddingLeft={2}>
              <Text>
                <Text color="gray">{option.label.padEnd(10)}</Text>
                <Text color="gray">{option.description}</Text>
              </Text>
              {option.preview ? <Text color="gray">{`preview ${option.preview}`}</Text> : null}
            </Box>
          ))}
        </Box>
      ))}
      <QuestionCommandRows commands={model.commands} />
    </Pane>
  );
}

export function questionPanelModel(record: QuestionRecord, title = "Question"): QuestionPanelModel {
  return {
    title,
    gateId: record.gateId,
    runId: record.runId,
    status: record.status,
    answer: record.answer ?? "",
    questions: record.questions.map((question) => ({
      header: question.header,
      question: truncateCells(flattenCellText(question.question), 120),
      multiSelect: Boolean(question.multiSelect),
      options: question.options.map((option) => ({
        label: truncateCells(flattenCellText(option.label), 32),
        description: truncateCells(flattenCellText(option.description), 120),
        preview: option.preview ? truncateCells(flattenCellText(option.preview), 120) : "",
      })),
    })),
    commands: questionCommands(record),
  };
}

function questionCommands(record: QuestionRecord): QuestionPanelCommand[] {
  const commands: QuestionPanelCommand[] = [
    {
      label: "show",
      command: `/question show ${record.gateId}`,
      description: "print the full prompt",
      tone: "inspect",
    },
  ];
  if (record.status === "pending") {
    commands.push(
      {
        label: "answer",
        command: `/question answer ${record.gateId} <answer>`,
        description: "resume the paused run",
        tone: "allow",
      },
      {
        label: "reject",
        command: `/question reject ${record.gateId} <reason>`,
        description: "ask DeepSeekCode to revise",
        tone: "reject",
      },
    );
  }
  return commands;
}

function QuestionCommandRows(props: {
  commands: QuestionPanelCommand[];
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">commands</Text>
      {props.commands.map((command, index) => (
        <Box key={`${command.label}-${command.command}`} flexDirection="row">
          <Text color={commandTone(command.tone)}>{` ${index + 1}. ${command.label.padEnd(8)} `}</Text>
          <Text color="gray">{command.command}</Text>
          <Text color="gray">{`  ${command.description}`}</Text>
        </Box>
      ))}
    </Box>
  );
}

function QuestionRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color={props.color ?? "gray"}>{props.value}</Text>
    </Box>
  );
}

function toneForStatus(status: string): TerminalTone {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "cancelled") return "muted";
  return "error";
}

function commandTone(tone: QuestionPanelCommand["tone"]): string {
  if (tone === "allow") return "green";
  if (tone === "reject") return "red";
  return "cyan";
}
