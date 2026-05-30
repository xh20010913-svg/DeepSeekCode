import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("heapdump/heapdump");

export default command;
export { command };