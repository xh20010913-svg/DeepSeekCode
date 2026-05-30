import { createToolAdapter } from "../compat.js";

const tool = createToolAdapter("shared/gitOperationTracking");

export default tool;
export { tool };