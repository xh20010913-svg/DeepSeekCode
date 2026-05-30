export const command = {
  name: "share",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/share is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;