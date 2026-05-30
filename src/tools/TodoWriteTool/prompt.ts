import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("TodoWriteTool/prompt");

export default tool;
export { tool };