import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("plugin/DiscoverPlugins");

export default command;
export { command };