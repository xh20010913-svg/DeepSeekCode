export const command = {
  name: "break-cache",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/break-cache is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;