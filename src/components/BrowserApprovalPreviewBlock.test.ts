import test from "node:test";
import assert from "node:assert/strict";
import { browserApprovalPreviewModel } from "./BrowserApprovalPreviewBlock.js";

test("browser approval preview summarizes click gates", () => {
  assert.deepEqual(browserApprovalPreviewModel("browser_click url=https://example.com selector=#buy"), {
    action: "browser_click",
    title: "Browser click",
    url: "https://example.com",
    targetLabel: "selector",
    target: "#buy",
    risk: "high",
    note: "may trigger navigation, form actions, purchases, or other state changes",
  });
});

test("browser approval preview redacts typed content by design", () => {
  assert.deepEqual(browserApprovalPreviewModel("browser_type url=https://example.com selector=input[name=q] textChars=12"), {
    action: "browser_type",
    title: "Browser typing",
    url: "https://example.com",
    targetLabel: "selector",
    target: "input[name=q]",
    risk: "high",
    note: "typed text is redacted from the gate summary; 12 chars",
  });
});

test("browser approval preview ignores non-browser gates", () => {
  assert.equal(browserApprovalPreviewModel("run_command command=git status cwd=."), null);
});
