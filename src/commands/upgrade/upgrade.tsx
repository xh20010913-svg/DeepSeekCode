import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("upgrade/upgrade");

export default command;
export { command };