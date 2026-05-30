import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("AgentTool/forkSubagent");

export default tool;
export { tool };