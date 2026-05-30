import test from "node:test";
import assert from "node:assert/strict";
import { advisorMessageText } from "./AdvisorMessage.js";
import { redactedThinkingLabel } from "./AssistantRedactedThinkingMessage.js";
import { attachmentLabel } from "./AttachmentMessage.js";
import { collapsedReadSearchSummary } from "./CollapsedReadSearchContent.js";
import { compactBoundaryLabel } from "./CompactBoundaryMessage.js";
import { nullRenderingAttachments } from "./nullRenderingAttachments.js";
import { shutdownMessageText } from "./ShutdownMessage.js";
import { snipBoundaryText } from "./SnipBoundaryMessage.js";
import { taskAssignmentText } from "./TaskAssignmentMessage.js";
import { teamMemCollapsedLabel } from "./teamMemCollapsed.js";
import { teamMemSavedText } from "./teamMemSaved.js";
import { userAgentNotificationText } from "./UserAgentNotificationMessage.js";
import { userCommandText } from "./UserCommandMessage.js";
import { forkBoilerplateText } from "./UserForkBoilerplateMessage.js";
import { githubWebhookText } from "./UserGitHubWebhookMessage.js";
import { userImageLabel } from "./UserImageMessage.js";
import { memoryInputText } from "./UserMemoryInputMessage.js";
import { resourceUpdateText } from "./UserResourceUpdateMessage.js";
import { userToolResultStatus } from "./UserToolResultMessage/utils.js";

test("message adapters keep compact ClaudeCode-style labels", () => {
  assert.equal(advisorMessageText("  cache first "), "cache first");
  assert.equal(redactedThinkingLabel(), "thinking hidden");
  assert.equal(attachmentLabel("diff.patch", 12), "diff.patch (12 bytes)");
  assert.equal(collapsedReadSearchSummary(2, "read"), "2 reads collapsed");
  assert.equal(compactBoundaryLabel(4), "compact +4");
  assert.deepEqual(nullRenderingAttachments(["a"]), ["a"]);
});

test("message adapters summarize local session events", () => {
  assert.equal(shutdownMessageText("done"), "Shutdown: done");
  assert.equal(snipBoundaryText(30), "... 30 chars hidden ...");
  assert.equal(taskAssignmentText("reviewer", "check diff"), "reviewer <- check diff");
  assert.equal(teamMemCollapsedLabel(1), "1 memory entry collapsed");
  assert.equal(teamMemSavedText("memory.md"), "memory saved: memory.md");
});

test("user message adapters normalize command and resource messages", () => {
  assert.equal(userAgentNotificationText("tester", "ready"), "tester ready");
  assert.equal(userCommandText("status"), "/status");
  assert.equal(forkBoilerplateText("main"), "forked from main");
  assert.equal(githubWebhookText("pull_request", "repo/name"), "pull_request | repo/name");
  assert.equal(userImageLabel("shot.png"), "image: shot.png");
  assert.equal(memoryInputText("rule"), "memory: rule");
  assert.equal(resourceUpdateText("file", "changed"), "file changed");
});

test("tool result status helper classifies local outcomes", () => {
  assert.equal(userToolResultStatus("ok"), "success");
  assert.equal(userToolResultStatus("failed"), "error");
  assert.equal(userToolResultStatus("rejected by user"), "rejected");
});
