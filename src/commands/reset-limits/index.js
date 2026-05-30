export const command = {
  name: "reset-limits",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/reset-limits is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;