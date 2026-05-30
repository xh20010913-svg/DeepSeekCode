import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("diff/diff");

export default command;
export { command };