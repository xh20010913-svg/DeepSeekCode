import { createCommandAdapter } from "./compat.js";

const command = createCommandAdapter("commit");

export default command;
export { command };