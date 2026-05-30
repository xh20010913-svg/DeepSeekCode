import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("memory/index");

export default command;
export { command };