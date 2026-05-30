import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("doctor/doctor");

export default command;
export { command };