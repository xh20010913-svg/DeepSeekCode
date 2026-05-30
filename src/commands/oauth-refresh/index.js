export const command = {
  name: "oauth-refresh",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/oauth-refresh is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;