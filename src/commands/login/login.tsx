import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("login/login");

export default command;
export { command };