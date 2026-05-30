import { createCommandAdapter } from "./compat.js";

const command = createCommandAdapter("commit-push-pr");

export default command;
export { command };