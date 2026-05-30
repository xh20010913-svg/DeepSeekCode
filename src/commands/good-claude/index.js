export const command = {
  name: "good-claude",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/good-claude is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;