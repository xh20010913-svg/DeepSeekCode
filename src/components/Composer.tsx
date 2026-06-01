import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import { Divider } from "./design/Divider.js";
import { PromptInputModeIndicator } from "./PromptInputModeIndicator.js";
import { PromptInputFooterSuggestions } from "./PromptInputFooterSuggestions.js";
import { Spinner, spinnerLabel, type SpinnerMode } from "./Spinner.js";
import TextInput from "./TextInput.js";
import { isChineseUi, type UiLanguage } from "../services/ui/languageService.js";
import type { RunActivityView } from "../types/activity.js";

export interface ComposerLayoutModel {
  busyLabel: string;
  promptWidth: number;
  hint: string;
  placeholder: string;
  spinnerMode: SpinnerMode;
  spinnerLabel: string | undefined;
  spinnerDetail: string;
}

export function Composer(props: {
  value: string;
  cursor: number;
  busy: boolean;
  queuedCount: number;
  width: number;
  suggestions: SlashCommandSuggestion[];
  selectedSuggestion: number;
  activePromptHint?: string;
  language?: UiLanguage;
  activity?: RunActivityView | null;
  activityNowMs?: number;
}): React.ReactElement {
  const model = composerLayoutModel(props);

  return (
    <Box flexDirection="column">
      <PromptInputFooterSuggestions
        suggestions={props.suggestions}
        selectedSuggestion={props.selectedSuggestion}
        width={props.width}
      />
      {model.hint ? (
        <Box paddingX={1}>
          <Text color="gray" wrap="truncate">{model.hint}</Text>
        </Box>
      ) : null}
      <Divider width={props.width} tone={props.busy ? "warning" : "brand"} />
      <Box paddingX={1} minHeight={1} width={props.width}>
        <PromptInputModeIndicator mode="chat" busy={props.busy} />
        <TextInput
          value={props.value}
          cursor={props.cursor}
          width={model.promptWidth}
          placeholder={model.placeholder}
        />
        {props.busy && (
          <>
            <Text> </Text>
            <Spinner
              mode={model.spinnerMode}
              label={model.spinnerLabel}
              detail={model.spinnerDetail}
              width={28}
              inline
            />
          </>
        )}
      </Box>
    </Box>
  );
}

export function composerLayoutModel(input: {
  busy: boolean;
  queuedCount: number;
  width: number;
  activePromptHint?: string;
  language?: UiLanguage;
  activity?: RunActivityView | null;
  activityNowMs?: number;
}): ComposerLayoutModel {
  const zh = isChineseUi(input.language);
  const spinnerMode = activitySpinnerMode(input.activity);
  const activityLabelText = activitySpinnerLabel(input.activity, zh);
  const spinnerDetail = busyDetail(input.queuedCount, input.activity, input.activityNowMs, zh);
  const busyLabel = input.busy
    ? ` - ${spinnerLabel(spinnerMode, activityLabelText, spinnerDetail, 28)}`
    : "";
  return {
    busyLabel,
    promptWidth: Math.max(8, input.width - 6 - busyLabel.length),
    hint: input.activePromptHint ?? "",
    placeholder: input.activePromptHint ? (zh ? "在这里输入，或使用上方快捷键" : "Type here or use shortcuts above") : "",
    spinnerMode,
    spinnerLabel: activityLabelText,
    spinnerDetail,
  };
}

function busyDetail(
  queuedCount: number,
  activity: RunActivityView | null | undefined,
  activityNowMs: number | undefined,
  zh: boolean,
): string {
  const parts: string[] = [];
  if (activity?.detail) parts.push(compact(activity.detail.replace(/\s+/g, " "), 18));
  if (activity) {
    const idleSeconds = Math.max(0, Math.floor(((activityNowMs ?? Date.now()) - activity.updatedAtMs) / 1000));
    if (idleSeconds >= 8) parts.push(zh ? `静默${idleSeconds}s` : `silent ${idleSeconds}s`);
  }
  if (queuedCount > 0) parts.push(`queue ${queuedCount}`);
  return parts.join(" ");
}

function activitySpinnerMode(activity: RunActivityView | null | undefined): SpinnerMode {
  if (!activity) return "working";
  if (activity.phase === "planning" || activity.phase === "classifying" || activity.phase === "cache_guard") {
    return "thinking";
  }
  if (activity.phase === "tool" || activity.phase === "validating") return "tool";
  if (activity.phase === "waiting_user") return "queued";
  return "working";
}

function activitySpinnerLabel(activity: RunActivityView | null | undefined, zh: boolean): string | undefined {
  if (!activity) return undefined;
  if (!zh) {
    return {
      starting: "starting",
      command: "command",
      classifying: "classifying",
      cache_guard: "cache",
      planning: "thinking",
      chatting: "replying",
      tool: "tool",
      validating: "validating",
      waiting_user: "waiting",
      finishing: "finishing",
    }[activity.phase];
  }
  return {
    starting: "启动中",
    command: "命令中",
    classifying: "分类中",
    cache_guard: "缓存检查",
    planning: "思考中",
    chatting: "回复中",
    tool: "工具中",
    validating: "验证中",
    waiting_user: "等你确认",
    finishing: "收尾中",
  }[activity.phase];
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
