import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("LSPTool/symbolContext");

export default tool;
export { tool };