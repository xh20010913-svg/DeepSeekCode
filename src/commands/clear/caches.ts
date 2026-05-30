import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("clear/caches");

export default command;
export { command };