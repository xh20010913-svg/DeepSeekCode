export const command = {
  name: "bughunter",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/bughunter is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;