import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("logout/logout");

export default command;
export { command };