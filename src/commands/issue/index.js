export const command = {
  name: "issue",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/issue is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;