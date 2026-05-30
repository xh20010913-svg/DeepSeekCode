import { createCommandAdapter } from "./compat.js";

const command = createCommandAdapter("init");

export default command;
export { command };