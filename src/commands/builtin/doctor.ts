import React from "react";
import type { Command } from "../../types/command.js";
import { DiagnosticsDisplay, diagnosticsDisplayModel } from "../../components/DiagnosticsDisplay.js";
import { baseTools } from "../../tools/registry.js";
import { SkillService } from "../../services/skills/skillService.js";
import { PluginService } from "../../services/plugins/pluginService.js";
import { getTencentMemoryService } from "../../services/memory/tencentMemoryService.js";
import { hasWeComRemoteConfig } from "../../remote/wecom/config.js";
import { hasWeChatOpenClawLogin } from "../../remote/wechat/config.js";
import type { JobRecord } from "../../state/sqlite.js";

export const doctorCommand: Command = {
  name: "doctor",
  description: "Check project, provider, native tool calling, skills/plugins, cache, and permission status.",
  execute(_args, context) {
    const provider = context.config.provider;
    const runs = context.state.listRuns(5);
    const jobs = context.state.listJobs({ limit: 20 });
    const skills = new SkillService(context.config.projectPath, context.config.dataDir).list();
    const plugins = new PluginService(context.config.projectPath, context.config.dataDir).list();
    const usage = context.state.usageTotals();
    const cacheTotal = usage.cacheHitTokens + usage.cacheMissTokens;
    const cacheRate = cacheTotal > 0 ? `${Math.round((usage.cacheHitTokens / cacheTotal) * 1000) / 10}%` : "n/a";
    const promptAudit = process.env.DEEPSEEKCODE_PROMPT_AUDIT_DIR?.trim();
    const tdai = getTencentMemoryService(context.config, context.provider, context.state).status;
    return {
      message: [
        "DeepSeekCode doctor",
        `project: ${context.config.projectPath}`,
        `data: ${context.config.dataDir}`,
        `state: ${context.config.stateDbPath}`,
        `model: ${context.config.model}`,
        `provider: ${provider ? `${provider.name} (${provider.baseUrl})` : "missing DEEPSEEK_API_KEY"}`,
        `native tool calling: required (${context.provider ? "provider configured" : "provider missing"})`,
        `tool registry: ${baseTools.length} local tools`,
        `TencentDB-Agent-Memory: ${tdai.enabled ? "on" : "off"} initialized=${tdai.initialized} store=${tdai.config.storeBackend} embedding=${tdai.config.embeddingProvider} tools=${tdai.tools.join(", ") || "pending"}`,
        `persistent jobs: ${jobs.length} recent (${summarizeJobs(jobs)})`,
        `skills: ${skills.length} discovered at .deepseekcode/.claude/user/cache paths`,
        `plugins: ${plugins.length} discovered at .deepseekcode/.claude/user/cache paths`,
        `wecom remote: ${hasWeComRemoteConfig() ? "configured" : "not configured"} (use --wecom or /remote-control start)`,
        `wechat openclaw: ${hasWeChatOpenClawLogin(context.config) ? "logged-in" : "needs login"} (use --wechat-login or /remote-control wechat login)`,
        `prompt audit: ${promptAudit || "off"} (set DEEPSEEKCODE_PROMPT_AUDIT_DIR to enable)`,
        `usage snapshots: ${usage.snapshots} cache=${cacheRate} hit=${usage.cacheHitTokens} miss=${usage.cacheMissTokens}`,
        `permission profile: ${context.permissions.profile ?? context.config.permissionProfile}`,
        `shell: ${context.permissions.allowShell ? "on" : "off"}`,
        `browser: ${context.permissions.allowBrowser ? "on" : "off"}`,
      ].join("\n"),
      display: React.createElement(DiagnosticsDisplay, {
        model: diagnosticsDisplayModel({
          config: context.config,
          providerReady: Boolean(context.provider),
          providerName: provider?.name,
          permissions: context.permissions,
          runs,
        }),
      }),
    };
  },
};

function summarizeJobs(jobs: JobRecord[]): string {
  if (jobs.length === 0) return "none";
  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(", ");
}
