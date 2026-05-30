import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("AgentTool/runAgent");

export default tool;
export { tool };