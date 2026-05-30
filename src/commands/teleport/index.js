export const command = {
  name: "teleport",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/teleport is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;