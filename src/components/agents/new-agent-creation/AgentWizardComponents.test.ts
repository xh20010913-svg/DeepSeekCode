import test from "node:test";
import assert from "node:assert/strict";
import { agentEditorModel } from "../AgentEditor.js";
import { createAgentWizardModel } from "./CreateAgentWizard.js";
import { defaultAgentCreationState } from "./types.js";
import { colorStepOptions } from "./wizard-steps/ColorStep.js";
import { confirmStepModel } from "./wizard-steps/ConfirmStep.js";
import { descriptionStepModel } from "./wizard-steps/DescriptionStep.js";
import { generateStepModel } from "./wizard-steps/GenerateStep.js";
import { memoryStepOptions } from "./wizard-steps/MemoryStep.js";
import { methodStepOptions } from "./wizard-steps/MethodStep.js";
import { modelStepOptions } from "./wizard-steps/ModelStep.js";
import { promptStepModel } from "./wizard-steps/PromptStep.js";
import { toolsStepOptions } from "./wizard-steps/ToolsStep.js";
import { typeStepOptions } from "./wizard-steps/TypeStep.js";

test("agent editor previews markdown and validation state", () => {
  const model = agentEditorModel({
    name: "reviewer",
    description: "Review diffs",
    model: "deepseek-v4-flash",
    color: "green",
    tools: ["read_file"],
    prompt: "Review code.",
    maxTurns: 2,
  });

  assert.equal(model.ready, true);
  assert.match(model.markdownPreview.join("\n"), /deepseek-v4-flash/);
});

test("create agent wizard tracks active step and filename", () => {
  const state = {
    ...defaultAgentCreationState("review code"),
    name: "Code Reviewer",
    description: "Review code changes",
    prompt: "Find blocking issues first.",
  };
  const model = createAgentWizardModel({ state, activeStep: "tools" });

  assert.equal(model.activeStep, "tools");
  assert.equal(model.filename, "code-reviewer.md");
  assert.equal(model.ready, true);
});

test("wizard step option helpers mark selected choices", () => {
  assert.equal(methodStepOptions("generate")[0]?.selected, true);
  assert.equal(typeStepOptions("tester").find((option) => option.id === "tester")?.selected, true);
  assert.equal(memoryStepOptions(false).find((option) => option.id === "disabled")?.selected, true);
  assert.equal(colorStepOptions("green").find((option) => option.id === "green")?.selected, true);
  assert.equal(modelStepOptions("deepseek-v4-flash").find((option) => option.id === "deepseek-v4-flash")?.selected, true);
  assert.equal(toolsStepOptions(["read_file"], ["read_file"])[0]?.selected, true);
});

test("wizard text steps surface readiness", () => {
  assert.equal(descriptionStepModel("short").ready, false);
  assert.equal(descriptionStepModel("Review changes carefully").ready, true);
  assert.equal(promptStepModel("").ready, false);
  assert.equal(promptStepModel("Check bugs").lines[0], "Check bugs");
});

test("generate and confirm models emphasize cache-friendly flash drafts", () => {
  const state = {
    ...defaultAgentCreationState("review risky changes"),
    name: "reviewer",
    description: "Review risky changes",
    prompt: "Return blocking issues first.",
    tools: ["read_file"],
  };

  const generate = generateStepModel(state);
  const confirm = confirmStepModel(state);

  assert.equal(generate.ready, true);
  assert.match(generate.hints.join("\n"), /Flash/);
  assert.equal(confirm.ready, true);
  assert.equal(confirm.filename, "reviewer.md");
});
