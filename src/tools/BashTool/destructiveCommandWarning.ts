import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("BashTool/destructiveCommandWarning");

export default tool;
export { tool };