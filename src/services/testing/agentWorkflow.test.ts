import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAgentDashboardSnapshot } from "../agents/agentDashboardModel.js";
import {
  AgentWorkflowService,
  buildCleanSubtasksV3,
  buildCleanWorkflowPlanV3,
  normalizeTaskCompletionContract,
} from "../agents/agentWorkflow.js";
import { StateStore } from "../../state/sqlite.js";

const complexChineseObjective = "做一个雷霆战机小游戏网站，前后端数据库完整，GSAP 动效，并生成 PDF 项目文档";

test("clean workflow fallback creates task-specific Chinese middle roles", () => {
  const contract = normalizeTaskCompletionContract({
    objective: complexChineseObjective,
    expectedOutputs: [
      { kind: "web", description: "可打开的小游戏网站和手机端页面", required: true },
      { kind: "code", description: "前后端代码和启动脚本", required: true },
      { kind: "data", description: "数据库 schema 和 seed 数据", required: true },
      { kind: "pdf", description: "PDF 项目开发文档", required: true },
    ],
    acceptanceCriteria: ["按钮和键盘有真实响应", "必须截图验收", "PDF 不能用 DOCX 或 Markdown 冒充"],
    verificationHints: ["launch_project", "browser_screenshot", "validate_artifact expected_kind=pdf"],
  }, complexChineseObjective);

  const plan = buildCleanWorkflowPlanV3(undefined, complexChineseObjective, contract);
  const middleRoles = plan.roles.filter((role) => role.role !== "Planner" && role.role !== "AcceptanceReviewer");
  const roleNames = middleRoles.map((role) => role.role);
  const skillText = middleRoles.flatMap((role) => role.preloadedSkills).join(" ");

  assert.equal(plan.roles[0]?.role, "Planner");
  assert.equal(plan.roles.at(-1)?.role, "AcceptanceReviewer");
  assert.ok(middleRoles.length >= 3 && middleRoles.length <= 5, `middle roles=${roleNames.join(",")}`);
  assert.ok(roleNames.every((role) => /[\u4e00-\u9fa5]/.test(role)), roleNames.join(","));
  assert.ok(!roleNames.some((role) => /ImplementationSpecialist|Builder|Worker|Frontend|Backend|Tester/i.test(role)), roleNames.join(","));
  assert.match(roleNames.join(" "), /玩法|界面|动效|PDF|后端|数据/);
  assert.match(skillText, /gsap-core/);
  assert.match(skillText, /pdf/);
});

test("workflow subtasks and dashboard snapshot expose ready queue, evidence, and layout model", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-"));
  const state = new StateStore(path.join(projectPath, ".deepseekcode", "state.sqlite"));
  try {
    const runId = state.createRun({ projectPath, model: "test-model", message: complexChineseObjective });
    const rawContract = {
      objective: complexChineseObjective,
      expectedOutputs: [
        { kind: "web" as const, description: "小游戏网站", required: true },
        { kind: "pdf" as const, description: "PDF 项目开发文档", required: true },
      ],
      acceptanceCriteria: ["真实产物和截图 evidence 必须存在"],
    };
    const contract = normalizeTaskCompletionContract(rawContract, complexChineseObjective);
    const service = new AgentWorkflowService(state, projectPath);
    const workflow = service.start({ runId, objective: complexChineseObjective, contract: rawContract });
    const subtasks = buildCleanSubtasksV3(complexChineseObjective, contract, workflow.roles);

    assert.ok(subtasks.length >= 2);
    assert.ok(subtasks.some((subtask) => subtask.dependencies.length === 0));
    assert.ok(subtasks.every((subtask) => subtask.title && !subtask.title.includes("瀛愴换")));
    assert.ok(workflow.roles.some((role) => /PDF/.test(role.role) && role.preloadedSkills.includes("pdf")));

    state.appendEvent(runId, "agent_kernel_evidence", {
      evidenceId: "evidence_test_1",
      kind: "pdf",
      summary: "生成并校验 PDF 项目文档",
      role: "PDF产物工程师",
      subtaskId: "subtask_1",
      path: path.join(projectPath, "docs", "project.pdf"),
    });
    const snapshot = buildAgentDashboardSnapshot({ state, projectPath, runId });

    assert.ok(snapshot.readyQueue.length >= 1);
    assert.ok(snapshot.evidence.some((item) => item.evidenceId === "evidence_test_1"));
    assert.equal(snapshot.layoutModel.desktop, "split-ops-room");
    assert.equal(snapshot.layoutModel.mobile, "summary-drawer");
    assert.ok(Object.keys(snapshot.layoutModel.roleLocations).includes("Planner"));
    assert.ok(Object.values(snapshot.layoutModel.roleLocations).some((location) => location === "dispatch" || location === "lounge"));
  } finally {
    state.close();
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});
