import test from "node:test";
import assert from "node:assert/strict";
import { autoUpdaterStatus } from "./AutoUpdater.js";
import { imageRefLabel } from "./ClickableImageRef.js";
import { feedbackTarget } from "./Feedback.js";
import { teammateViewHeaderText } from "./TeammateViewHeader.js";
import { teleportStashLabel } from "./TeleportStash.js";
import { feedbackScoreLabel } from "./FeedbackSurvey/utils.js";
import { submitTranscriptShare } from "./FeedbackSurvey/submitTranscriptShare.js";
import { useDebouncedDigitInput } from "./FeedbackSurvey/useDebouncedDigitInput.js";
import { useFrustrationDetection } from "./FeedbackSurvey/useFrustrationDetection.js";
import { managedSettingsSecurityLabel } from "./ManagedSettingsSecurityDialog/utils.js";

test("remaining top-level adapters expose local-safe labels", () => {
  assert.match(autoUpdaterStatus("0.1.0"), /0.1.0/);
  assert.equal(imageRefLabel("shot.png"), "image shot.png");
  assert.match(feedbackTarget(), /GitHub/);
  assert.equal(teammateViewHeaderText("reviewer"), "agent reviewer");
  assert.equal(teleportStashLabel(2), "2 stashed changes");
});

test("remaining survey and settings adapters stay local-only", () => {
  assert.equal(feedbackScoreLabel(7), "5/5");
  assert.equal(submitTranscriptShare().ok, false);
  assert.equal(useDebouncedDigitInput("a4b"), "4");
  assert.equal(useFrustrationDetection(["删除不了"]), true);
  assert.equal(managedSettingsSecurityLabel(false), "local settings");
});
