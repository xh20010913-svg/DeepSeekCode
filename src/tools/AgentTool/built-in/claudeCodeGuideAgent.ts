import { createToolAdapter } from "../../compat.js";

const tool = createToolAdapter("AgentTool/built-in/claudeCodeGuideAgent");

export default tool;
export { tool };