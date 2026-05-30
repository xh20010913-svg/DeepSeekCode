import React from "react";
import { Text } from "ink";

export function sessionBackgroundHintModel(input: {
  hasTranscript: boolean;
  hasAttachedRun: boolean;
  providerReady: boolean;
}): string {
  if (!input.providerReady) return "Run /doctor before starting a new DeepSeek session.";
  if (input.hasAttachedRun) return "Attached run is active; use /attach clear to return to normal chat.";
  if (!input.hasTranscript) return "Start with a goal, /help, or /cache plan <goal>.";
  return "Use /resume, /sessions, or /compact to manage this conversation.";
}

export function SessionBackgroundHint(props: {
  hasTranscript: boolean;
  hasAttachedRun: boolean;
  providerReady: boolean;
}): React.ReactElement {
  return <Text color="gray">{sessionBackgroundHintModel(props)}</Text>;
}
