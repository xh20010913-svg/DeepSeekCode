import React from "react";
import { Box, Text } from "ink";

export function QueuedPromptPanel(props: {
  prompts: string[];
  width: number;
}): React.ReactElement | null {
  const visible = visibleQueuedPrompts(props.prompts, 3);
  if (visible.length === 0) return null;
  const previewWidth = Math.max(16, Math.min(props.width - 18, 80));
  const hidden = props.prompts.length - visible.length;

  return (
    <Box flexDirection="column" paddingX={1} width={props.width}>
      <Text color="gray">
        {`queued ${props.prompts.length} ${props.prompts.length === 1 ? "prompt" : "prompts"}`}
      </Text>
      {visible.map((prompt, index) => (
        <Text key={`${index}-${prompt}`} color="gray">
          {`  ${index + 1}. ${formatQueuedPromptPreview(prompt, previewWidth)}`}
        </Text>
      ))}
      {hidden > 0 && <Text color="gray">{`  +${hidden} more`}</Text>}
    </Box>
  );
}

export function visibleQueuedPrompts(prompts: string[], limit: number): string[] {
  return prompts.slice(0, Math.max(0, limit));
}

export function formatQueuedPromptPreview(value: string, width: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const max = Math.max(4, width);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}
