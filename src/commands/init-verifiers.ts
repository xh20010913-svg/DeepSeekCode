import { createCommandAdapter } from "./compat.js";

const command = createCommandAdapter("init-verifiers");

export default command;
export { command };