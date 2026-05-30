import test from "node:test";
import assert from "node:assert/strict";
import { normalizePromptPaste, pastedLineCount } from "./inputPaste.js";
import { normalizePromptInputMode, promptInputModePrefix } from "./inputModes.js";
import { issueFlagBannerText } from "./IssueFlagBanner.js";
import { promptNotificationLines } from "./Notifications.js";
import { promptInputStashNoticeText } from "./PromptInputStashNotice.js";
import { sandboxPromptFooterHint } from "./SandboxPromptFooterHint.js";
import { shimmeredInputText } from "./ShimmeredInput.js";
import { promptInputLabel, truncatePromptForFooter } from "./utils.js";
import { useMaybeTruncateInput } from "./useMaybeTruncateInput.js";
import { usePromptInputPlaceholder } from "./usePromptInputPlaceholder.js";
import { useShowFastIconHint } from "./useShowFastIconHint.js";
import { useSwarmBanner } from "./useSwarmBanner.js";
import { voiceIndicatorLabel } from "./VoiceIndicator.js";

test("prompt input mode and paste helpers mirror the fixed editor behavior", () => {
  assert.equal(normalizePromptInputMode("shell"), "shell");
  assert.equal(normalizePromptInputMode("unknown"), "prompt");
  assert.equal(promptInputModePrefix("agent"), "@");
  assert.equal(normalizePromptPaste("a\r\nb\rc"), "a\nb\nc");
  assert.equal(pastedLineCount("a\nb"), 2);
});

test("prompt input footer helpers keep labels compact", () => {
  assert.equal(promptInputLabel("shell"), "$ shell");
  assert.equal(truncatePromptForFooter(" hello   world ", 20), "hello world");
  assert.equal(useMaybeTruncateInput("abcdef", 3), "abc");
  assert.equal(sandboxPromptFooterHint(false, false), "safe mode");
  assert.equal(promptInputStashNoticeText(2), "2 stashed prompts");
});

test("prompt input small hooks expose predictable display decisions", () => {
  assert.equal(usePromptInputPlaceholder("agent", true), "Delegate to an agent");
  assert.equal(usePromptInputPlaceholder("prompt", false), "Run /doctor to configure provider");
  assert.equal(useShowFastIconHint("deepseek-v4-flash"), true);
  assert.equal(useSwarmBanner(3), "3 agents available");
  assert.equal(voiceIndicatorLabel(false), "voice off");
});

test("prompt input notices and shimmer helpers are stable", () => {
  assert.match(issueFlagBannerText(true), /doctor/);
  assert.deepEqual(promptNotificationLines([" a ", "", " b "]), ["a", "b"]);
  assert.equal(shimmeredInputText("working", true), "working...");
});
