export const command = {
  name: "debug-tool-call",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/debug-tool-call is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;