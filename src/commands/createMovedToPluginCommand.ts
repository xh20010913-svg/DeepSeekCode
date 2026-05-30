import { createCommandAdapter } from "./compat.js";

const command = createCommandAdapter("createMovedToPluginCommand");

export default command;
export { command };