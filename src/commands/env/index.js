export const command = {
  name: "env",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/env is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;