import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("vim/vim");

export default command;
export { command };