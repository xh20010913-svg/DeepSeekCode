import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Box, Text } from "ink";
import { flattenCellText, truncateCells } from "./design/textLayout.js";
import type { QuestionRecord } from "../services/questions/questionService.js";

export interface QuestionApprovalPreviewModel {
  title: string;
  status: string;
  questions: Array<{
    header: string;
    question: string;
    multiSelect: boolean;
    options: Array<{
      label: string;
      description: string;
      preview: string;
    }>;
  }>;
}

export function QuestionApprovalPreviewBlock(props: {
  projectPath?: string;
  gateId: string;
  width?: number;
}): React.ReactElement | null {
  const model = questionApprovalPreviewModel(props.projectPath, props.gateId, props.width ?? 96);
  if (!model) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="cyan">{model.title}</Text>
        {" "}
        <Text color="gray">{model.status}</Text>
      </Text>
      {model.questions.map((question, index) => (
        <Box key={`${index}:${question.header}`} flexDirection="column" paddingLeft={1}>
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
    </Box>
  );
}

export function questionApprovalPreviewModel(
  projectPath: string | undefined,
  gateId: string,
  width = 96,
): QuestionApprovalPreviewModel | null {
  if (!projectPath) return null;
  const record = readQuestionApprovalRecord(projectPath, gateId);
  if (!record) return null;
  return questionApprovalPreviewModelFromRecord(record, width);
}

export function questionApprovalPreviewModelFromRecord(
  record: QuestionRecord,
  width = 96,
): QuestionApprovalPreviewModel {
  const questionWidth = Math.max(24, width - 16);
  const optionWidth = Math.max(24, width - 18);
  return {
    title: "Question preview",
    status: record.status,
    questions: record.questions.map((question) => ({
      header: truncateCells(flattenCellText(question.header), 18),
      question: truncateCells(flattenCellText(question.question), questionWidth),
      multiSelect: Boolean(question.multiSelect),
      options: question.options.map((option) => ({
        label: truncateCells(flattenCellText(option.label), 28),
        description: truncateCells(flattenCellText(option.description), optionWidth),
        preview: option.preview ? truncateCells(flattenCellText(option.preview), optionWidth) : "",
      })),
    })),
  };
}

function readQuestionApprovalRecord(projectPath: string, gateId: string): QuestionRecord | null {
  const filePath = path.join(projectPath, ".deepseekcode", "questions", `${safeName(gateId)}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as QuestionRecord;
  } catch {
    return null;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-") || "question";
}
