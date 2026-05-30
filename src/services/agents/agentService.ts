import fs from "node:fs";
import path from "node:path";
import { discoverAgents, type AgentSummary } from "../../agents/discovery.js";
import { loadAgent, type LoadedAgent } from "../../agents/loader.js";
import {
  normalizeAgentName,
  renderAgentDocument,
  validateAgentDocument,
  type AgentValidationResult,
} from "../../agents/manifest.js";
import { baseTools } from "../../tools/registry.js";

export class AgentService {
  constructor(
    private readonly projectPath: string,
    private readonly dataDir: string,
  ) {}

  list(): AgentSummary[] {
    return discoverAgents(this.projectPath, this.dataDir);
  }

  load(name: string): LoadedAgent | null {
    return loadAgent(this.projectPath, this.dataDir, name);
  }

  createProjectAgent(input: {
    name: string;
    description: string;
    body?: string;
    model?: string;
    tools?: string[];
    disallowedTools?: string[];
    color?: string;
    maxTurns?: number;
    overwrite?: boolean;
  }): LoadedAgent {
    const name = normalizeAgentName(input.name);
    if (!name) throw new Error("agent name is empty");
    const description = input.description.trim();
    if (!description) throw new Error("agent description is empty");
    const agentPath = path.join(this.projectPath, ".deepseekcode", "agents", `${name}.md`);
    if (fs.existsSync(agentPath) && !input.overwrite) {
      throw new Error(`agent already exists: ${name}`);
    }
    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, renderAgentDocument({
      name,
      description,
      body: input.body,
      model: input.model,
      tools: input.tools,
      disallowedTools: input.disallowedTools,
      color: input.color,
      maxTurns: input.maxTurns,
    }), "utf8");
    const agent = this.load(name);
    if (!agent) throw new Error(`failed to load created agent: ${name}`);
    return agent;
  }

  validate(name?: string): AgentValidationResult[] {
    const agents = name
      ? this.list().filter((candidate) => candidate.name === name)
      : this.list();
    if (name && agents.length === 0) {
      return [{
        name,
        path: "",
        ok: false,
        errors: [`agent not found: ${name}`],
        warnings: [],
      }];
    }
    const knownTools = baseTools.map((tool) => tool.name);
    return agents.map((agent) => validateAgentDocument(
      agent.name,
      agent.path,
      fs.existsSync(agent.path) ? fs.readFileSync(agent.path, "utf8") : null,
      knownTools,
    ));
  }
}
