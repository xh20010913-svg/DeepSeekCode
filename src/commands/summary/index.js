export const command = {
  name: "summary",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/summary is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;