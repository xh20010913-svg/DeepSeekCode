import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("PowerShellTool/destructiveCommandWarning");

export default tool;
export { tool };