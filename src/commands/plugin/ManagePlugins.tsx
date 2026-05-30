import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("plugin/ManagePlugins");

export default command;
export { command };