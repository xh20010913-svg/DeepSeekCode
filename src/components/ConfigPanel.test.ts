import test from "node:test";
import assert from "node:assert/strict";
import { configPanelModel } from "./ConfigPanel.js";

test("config panel model redacts provider secrets and summarizes runtime settings", () => {
  const model = configPanelModel({
    config: {
      projectPath: "D:\\project",
      dataDir: "D:\\data",
      stateDbPath: "D:\\data\\state.sqlite",
      model: "deepseek-v4-flash",
      provider: {
        name: "deepseek-default",
        kind: "open_ai_compatible",
        baseUrl: "https://api.deepseek.com",
        apiKey: "super-private-token",
        model: "deepseek-v4-flash",
        timeoutSecs: 45,
        reasoningEffort: "high",
        maxOutputTokens: 1200,
      },
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    outputStyle: {
      name: "deepseek",
      scope: "builtin",
      description: "Default DeepSeekCode style",
      prompt: "answer clearly",
    },
    inference: {
      effort: "high",
      actionContextChars: 18_000,
      actionDynamicChars: 24_000,
      sideQuestionContextChars: 12_000,
      sideQuestionDynamicChars: 16_000,
      maxOutputTokens: 1200,
    },
    permissions: {
      allowShell: false,
      allowBrowser: false,
      profile: "safe",
    },
  });

  assert.equal(model.title, "DeepSeekCode runtime config");
  assert.equal(model.rows.find((row) => row.key === "provider")?.status, "ready");
  assert.match(model.rows.find((row) => row.key === "provider")?.note ?? "", /apiKey=\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(model), /super-private-token/);
  assert.equal(model.rows.find((row) => row.key === "permissions")?.tone, "success");
});

test("config panel model explains missing provider setup", () => {
  const model = configPanelModel({
    config: {
      projectPath: "D:\\project",
      dataDir: "D:\\data",
      stateDbPath: "D:\\data\\state.sqlite",
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    outputStyle: {
      name: "deepseek",
      scope: "builtin",
      description: "Default DeepSeekCode style",
      prompt: "answer clearly",
    },
    inference: {
      effort: "auto",
      actionContextChars: 18_000,
      actionDynamicChars: 24_000,
      sideQuestionContextChars: 12_000,
      sideQuestionDynamicChars: 16_000,
      maxOutputTokens: 1200,
    },
    permissions: {
      allowShell: true,
      allowBrowser: false,
      profile: "dev",
    },
  });

  const provider = model.rows.find((row) => row.key === "provider");
  const permissions = model.rows.find((row) => row.key === "permissions");
  assert.equal(provider?.status, "missing");
  assert.match(provider?.note ?? "", /DEEPSEEK_API_KEY/);
  assert.equal(permissions?.tone, "warning");
});
