import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("heapdump/index");

export default command;
export { command };