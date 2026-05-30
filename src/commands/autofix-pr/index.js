export const command = {
  name: "autofix-pr",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/autofix-pr is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;