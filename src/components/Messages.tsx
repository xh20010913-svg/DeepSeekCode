import React from "react";
import { Transcript, type TranscriptItem } from "./Transcript.js";

export type MessageListItem = TranscriptItem;

export function Messages(props: {
  items: TranscriptItem[];
  height: number;
  width: number;
  providerReady: boolean;
  model: string;
  projectPath: string;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
}): React.ReactElement {
  return <Transcript {...props} />;
}
