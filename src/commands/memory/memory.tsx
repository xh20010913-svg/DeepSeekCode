import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("memory/memory");

export default command;
export { command };