import type { TemplateCard } from "@wecom/aibot-node-sdk";
import { compactOneLine } from "../redact.js";
import type { RemoteApprovalPrompt } from "../types.js";

export function approvalCard(input: RemoteApprovalPrompt): TemplateCard {
  return {
    card_type: "button_interaction",
    task_id: input.gateId,
    main_title: {
      title: "DeepSeekCode 需要权限确认",
      desc: compactOneLine(input.summary, 120),
    },
    sub_title_text: "确认后任务会从当前工具结果继续执行。",
    horizontal_content_list: [
      { keyname: "项目", value: compactOneLine(input.projectPath, 80) },
      { keyname: "风险", value: approvalRisk(input.summary) },
    ],
    button_list: [
      { text: "允许一次", style: 1, key: `approve_once:${input.gateId}` },
      { text: "本会话允许", style: 1, key: `approve_session:${input.gateId}` },
      { text: "拒绝", style: 2, key: `reject:${input.gateId}` },
      { text: "停止任务", style: 2, key: `cancel:${input.runId}` },
    ],
  };
}

export function decidedCard(input: {
  taskId: string;
  status: "approved" | "rejected" | "cancelled";
  summary?: string;
}): TemplateCard {
  return {
    card_type: "text_notice",
    task_id: input.taskId,
    main_title: {
      title: decisionTitle(input.status),
      desc: compactOneLine(input.summary ?? "", 120),
    },
  };
}

function approvalRisk(summary: string): string {
  if (/run_command|ssh_|mcp_call/i.test(summary)) return "shell/remote command";
  if (/write_file|append_file|apply_patch/i.test(summary)) return "file change";
  if (/browser/i.test(summary)) return "browser automation";
  return "manual approval";
}

function decisionTitle(status: "approved" | "rejected" | "cancelled"): string {
  if (status === "approved") return "已允许";
  if (status === "rejected") return "已拒绝";
  return "已停止";
}
