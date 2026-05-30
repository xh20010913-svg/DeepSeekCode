export const command = {
  name: "mock-limits",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/mock-limits is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;