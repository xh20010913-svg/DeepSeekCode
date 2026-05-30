import test from "node:test";
import assert from "node:assert/strict";
import {
  agentDetailPanelModel,
  agentDrainPanelModel,
  agentPanelCommandOptions,
  agentPanelGroupOptions,
  agentPanelRowOptions,
  agentPanelTabs,
  agentListPanelModel,
  agentRunDetailPanelModel,
  agentRunsPanelModel,
  agentStepPanelModel,
  agentValidationPanelModel,
  agentWizardPanelModel,
} from "./AgentPanel.js";

test("agent list panel groups agents by scope", () => {
  const model = agentListPanelModel([{
    name: "builder",
    scope: "project",
    path: "D:\\project\\.deepseekcode\\agents\\builder.md",
    description: "Build focused changes",
  }]);

  assert.equal(model.title, "Agents");
  assert.equal(model.rows[0]?.name, "project/builder");
  assert.equal(model.rows[0]?.status, "project");
  assert.equal(model.rows[0]?.tone, "success");
});

test("agent panel exposes source groups, selectable rows, and commands", () => {
  const model = agentListPanelModel([
    {
      name: "builder",
      scope: "project",
      path: "D:\\project\\.deepseekcode\\agents\\builder.md",
      description: "Build focused changes",
    },
    {
      name: "reviewer",
      scope: "user",
      path: "C:\\Users\\me\\.deepseekcode\\agents\\reviewer.md",
      description: "Review patches",
    },
  ]);

  const groups = agentPanelGroupOptions(model);
  assert.deepEqual(groups.map((group) => group.id), ["project", "user"]);
  assert.equal(groups[0]?.selected, true);
  assert.equal(groups[0]?.detail, "1 row");

  const rows = agentPanelRowOptions(model, "project");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.label, "project/builder");
  assert.match(rows[0]?.detail ?? "", /Build focused changes/);

  assert.equal(agentPanelTabs(model)[0]?.count, 2);
  assert.equal(agentPanelCommandOptions(model)[0]?.id, "show");
});

test("agent detail panel shows model tools and prompt preview", () => {
  const model = agentDetailPanelModel({
    name: "tester",
    scope: "project",
    path: "D:\\project\\.deepseekcode\\agents\\tester.md",
    description: "Run checks",
    frontmatter: {
      description: "Run checks",
      model: "inherit",
      tools: ["read_file", "run_command"],
      disallowedTools: ["write_file"],
      maxTurns: 3,
    },
    prompt: "Inspect changes.\nRun focused tests.\nReport evidence.",
    model: "inherit",
    tools: ["read_file", "run_command"],
  });

  assert.equal(model.rows[0]?.status, "inherit");
  assert.match(model.rows[0]?.note ?? "", /tools=read_file,run_command/);
  assert.match(model.rows[0]?.note ?? "", /deny=write_file/);
  assert.deepEqual(model.preview?.slice(0, 2), ["Inspect changes.", "Run focused tests."]);
  assert.equal(agentPanelCommandOptions(model)[0]?.id, "show");
});

test("agent validation panel surfaces errors and warnings", () => {
  const model = agentValidationPanelModel([{
    name: "broken",
    path: "D:\\project\\.deepseekcode\\agents\\broken.md",
    ok: false,
    errors: ["empty agent system prompt"],
    warnings: ["unknown tool 'foo'"],
  }]);

  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
  assert.match(model.rows[0]?.note ?? "", /empty agent system prompt/);
});

test("agent wizard panel includes tool policy and rationale", () => {
  const model = agentWizardPanelModel({
    name: "ui-checker",
    description: "Agent for frontend QA",
    tools: ["read_file", "browser_screenshot"],
    disallowedTools: ["run_command"],
    maxTurns: 2,
    color: "cyan",
    prompt: "Inspect UI.\nCapture screenshots.",
    rationale: ["browser screenshot is included for UI work."],
  });

  assert.equal(model.rows[0]?.status, "2 turns");
  assert.match(model.rows[0]?.detail ?? "", /browser_screenshot/);
  assert.equal(model.preview?.[0], "browser screenshot is included for UI work.");
});

test("agent runs panel summarizes task counts", () => {
  const now = 1;
  const model = agentRunsPanelModel([{
    run: {
      id: "run_1",
      projectPath: "D:\\project",
      model: "deepseek",
      status: "running",
      message: "agent:builder fix bug",
      createdAtMs: now,
      updatedAtMs: now,
      actionCount: 0,
      artifactCount: 0,
      eventCount: 0,
    },
    tasks: [{
      id: "task_1",
      runId: "run_1",
      parentTaskId: null,
      agent: "builder",
      title: "fix bug",
      status: "queued",
      detail: "queued agent task",
      createdAtMs: now,
      updatedAtMs: now,
    }],
  }]);

  assert.equal(model.rows[0]?.status, "running");
  assert.match(model.rows[0]?.note ?? "", /queued=1/);
  assert.equal(model.progress?.[0]?.agent, "builder");
  assert.equal(model.progress?.[0]?.status, "queued");
  assert.equal(agentPanelTabs(model)[1]?.count, 1);
  assert.equal(agentPanelCommandOptions(model)[0]?.id, "detail");
});

test("agent run detail panel lists tasks and recent events", () => {
  const now = 1;
  const model = agentRunDetailPanelModel({
    run: {
      id: "run_2",
      projectPath: "D:\\project",
      model: "deepseek",
      status: "succeeded",
      message: "agent:tester run tests",
      createdAtMs: now,
      updatedAtMs: now,
      actionCount: 2,
      artifactCount: 0,
      eventCount: 1,
    },
    tasks: [{
      id: "task_2",
      runId: "run_2",
      parentTaskId: null,
      agent: "tester",
      title: "run tests",
      status: "succeeded",
      detail: "done",
      createdAtMs: now,
      updatedAtMs: now,
    }],
    events: [{
      kind: "agent_turn_completed",
      payload: { task_id: "task_2" },
      createdAtMs: now,
    }],
  });

  assert.equal(model.rows[0]?.status, "succeeded");
  assert.equal(model.progress?.[0]?.agent, "tester");
  assert.equal(model.progress?.[0]?.activity, "done");
  assert.match(model.preview?.join("\n") ?? "", /agent_turn_completed/);
});

test("agent step panel shows task progress", () => {
  const now = 1;
  const model = agentStepPanelModel({
    runId: "run_4",
    status: "succeeded",
    message: "agent task completed",
    task: {
      id: "task_4",
      runId: "run_4",
      parentTaskId: null,
      agent: "builder",
      title: "ship UI",
      status: "running",
      detail: "running tool loop",
      createdAtMs: now,
      updatedAtMs: now + 2_000,
    },
  });

  assert.equal(model.progress?.[0]?.agent, "builder");
  assert.equal(model.progress?.[0]?.status, "succeeded");
  assert.equal(model.progress?.[0]?.activity, "agent task completed");
});

test("agent drain panel previews step outcomes", () => {
  const now = 1;
  const model = agentDrainPanelModel({
    runId: "run_3",
    status: "max_steps",
    message: "stopped after 2 agent steps",
    steps: [{
      runId: "run_3",
      status: "succeeded",
      message: "ok",
      task: {
        id: "task_3",
        runId: "run_3",
        parentTaskId: null,
        agent: "tester",
        title: "run smoke",
        status: "running",
        detail: "running checks",
        createdAtMs: now,
        updatedAtMs: now + 1_000,
      },
    }],
  });

  assert.equal(model.rows[0]?.status, "max_steps");
  assert.equal(model.rows[0]?.tone, "warning");
  assert.equal(model.progress?.[0]?.agent, "tester");
  assert.match(model.preview?.[0] ?? "", /succeeded/);
});
