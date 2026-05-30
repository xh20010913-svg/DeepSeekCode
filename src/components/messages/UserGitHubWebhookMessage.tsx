import React from "react";
import { Text } from "ink";

export function githubWebhookText(event: string, repo?: string): string {
  return [event || "github", repo].filter(Boolean).join(" | ");
}

export function UserGitHubWebhookMessage(props: { event: string; repo?: string }): React.ReactElement {
  return <Text color="cyan">{githubWebhookText(props.event, props.repo)}</Text>;
}
