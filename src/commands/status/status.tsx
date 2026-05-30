import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("status/status");

export default command;
export { command };