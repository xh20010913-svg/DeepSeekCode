export type CapabilityRisk = "low" | "medium" | "high";

export interface ToolCapability {
  name: string;
  category: "file" | "command" | "browser" | "document" | "pdf" | "office" | "spreadsheet" | "mcp" | "skill" | "remote" | "process" | "terminal";
  risk: CapabilityRisk;
  longRunning: boolean;
  remoteSafe: boolean;
  verification: string;
}

const CAPABILITIES: ToolCapability[] = [
  capability("read_file", "file", "low", false, true, "\u6587\u4ef6\u5b58\u5728\u4e14\u5185\u5bb9\u53ef\u8bfb\u53d6"),
  capability("list_files", "file", "low", false, true, "\u76ee\u5f55\u5b58\u5728\u4e14\u679a\u4e3e\u7ed3\u679c\u53ef\u4fe1"),
  capability("grep_files", "file", "low", false, true, "\u5339\u914d\u7ed3\u679c\u5e26\u8def\u5f84\u548c\u884c\u53f7"),
  capability("write_file", "file", "medium", false, false, "\u5199\u5165\u540e\u901a\u8fc7 read_file\u3001validate_artifact \u6216 verify_task \u9a8c\u8bc1"),
  capability("append_file", "file", "medium", false, false, "\u8ffd\u52a0\u540e\u68c0\u67e5\u6587\u4ef6\u5185\u5bb9\u548c\u8bed\u6cd5\u5b8c\u6574\u6027"),
  capability("apply_patch", "file", "medium", false, false, "patch \u6210\u529f\u540e\u6267\u884c\u76f8\u5173\u9a8c\u8bc1"),
  capability("run_command", "command", "high", false, false, "\u547d\u4ee4\u9000\u51fa\u7801\u4e3a 0\uff0cstderr/\u5173\u952e\u8f93\u51fa\u88ab\u6458\u8981"),
  capability("launch_project", "process", "high", true, false, "\u7aef\u53e3\u63a2\u6d4b\u3001URL\u3001\u622a\u56fe\u3001console/404/\u7a7a\u767d\u9875\u68c0\u67e5"),
  capability("list_project_processes", "process", "low", false, true, "\u8fd4\u56de runtime registry \u4e2d\u7684 pid/cwd/port/url"),
  capability("stop_project_process", "process", "medium", false, false, "\u505c\u6b62\u540e\u9a8c\u8bc1\u8fdb\u7a0b\u548c\u7aef\u53e3\u91ca\u653e"),
  capability("browser_screenshot", "browser", "medium", false, false, "\u622a\u56fe\u6587\u4ef6\u5b58\u5728\u4e14\u975e\u7a7a\u767d"),
  capability("browser_click", "browser", "medium", false, false, "\u70b9\u51fb\u540e\u72b6\u6001\u3001URL\u3001DOM \u6216\u622a\u56fe\u53d1\u751f\u9884\u671f\u53d8\u5316"),
  capability("create_docx", "office", "medium", false, false, "DOCX \u53ef\u6253\u5f00\u5e76\u53ef\u6e32\u67d3/\u6821\u9a8c\u7ed3\u6784"),
  capability("create_pptx", "office", "medium", false, false, "PPTX \u53ef\u6253\u5f00\u5e76\u5339\u914d\u9875\u6570/\u5185\u5bb9\u8981\u6c42"),
  capability("create_xlsx", "spreadsheet", "medium", false, false, "XLSX \u53ef\u6253\u5f00\u5e76\u6821\u9a8c\u5de5\u4f5c\u8868/\u516c\u5f0f/\u6570\u636e"),
  capability("create_pdf", "pdf", "medium", false, false, "PDF \u4ee5 %PDF- \u5f00\u5934\u3001\u9875\u6570\u53ef\u8bfb\u3001\u6587\u672c\u6216\u9884\u89c8\u9a8c\u8bc1"),
  capability("validate_artifact", "document", "low", false, true, "\u6309 expected_kind \u6821\u9a8c\u771f\u5b9e\u4ea7\u7269"),
  capability("verify_task", "document", "medium", false, true, "\u6839\u636e contract \u548c evidence \u8f93\u51fa\u901a\u8fc7/\u5931\u8d25/\u963b\u585e"),
  capability("search_skills", "skill", "low", false, true, "\u8fd4\u56de\u77ed skill \u7d22\u5f15"),
  capability("invoke_skill", "skill", "medium", false, false, "skill \u8fd0\u884c\u7ed3\u679c\u8fdb\u5165 run trace \u548c evidence"),
  capability("mcp_discover", "mcp", "medium", false, false, "\u5217\u51fa\u5de5\u5177/resources/prompts"),
  capability("mcp_call", "mcp", "high", false, false, "\u8c03\u7528\u7ed3\u679c\u548c\u5931\u8d25\u6458\u8981\u8fdb\u5165 evidence"),
  capability("terminal_reset", "terminal", "low", false, true, "\u53d1\u9001\u7ec8\u7aef\u6062\u590d\u5e8f\u5217"),
];

export class CapabilityRegistry {
  all(): ToolCapability[] {
    return [...CAPABILITIES];
  }

  get(name: string): ToolCapability | undefined {
    return CAPABILITIES.find((capability) => capability.name === name);
  }

  byCategory(category: ToolCapability["category"]): ToolCapability[] {
    return CAPABILITIES.filter((capability) => capability.category === category);
  }

  summarize(names: string[]): string {
    return names
      .map((name) => this.get(name))
      .filter((capability): capability is ToolCapability => Boolean(capability))
      .map((capability) => `${capability.name}:${capability.category}:risk=${capability.risk}:verify=${capability.verification}`)
      .join("\n");
  }
}

function capability(
  name: string,
  category: ToolCapability["category"],
  risk: CapabilityRisk,
  longRunning: boolean,
  remoteSafe: boolean,
  verification: string,
): ToolCapability {
  return { name, category, risk, longRunning, remoteSafe, verification };
}
