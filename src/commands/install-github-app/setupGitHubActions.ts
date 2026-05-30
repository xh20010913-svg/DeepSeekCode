import { createCommandAdapter } from "../compat.js";

const command = createCommandAdapter("install-github-app/setupGitHubActions");

export default command;
export { command };