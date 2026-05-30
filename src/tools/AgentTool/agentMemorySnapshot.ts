import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("AgentTool/agentMemorySnapshot");

export default tool;
export { tool };