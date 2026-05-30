import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("rename/generateSessionName");

export default command;
export { command };