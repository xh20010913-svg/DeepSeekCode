import React from "react";
import { InterruptedByUser } from "./InterruptedByUser.js";
import { MessageResponse } from "./MessageResponse.js";

export function FallbackToolUseRejectedMessage(): React.ReactElement {
  return (
    <MessageResponse height={1} tone="warning">
      <InterruptedByUser />
    </MessageResponse>
  );
}

export function isFallbackToolUseRejectedText(text: string): boolean {
  return /<tool_use_rejected\b|tool use rejected|user rejected|interrupted by user/i.test(text);
}
