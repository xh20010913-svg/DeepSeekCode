import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("config/config");

export default command;
export { command };