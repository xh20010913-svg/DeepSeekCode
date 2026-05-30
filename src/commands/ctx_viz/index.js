export const command = {
  name: "ctx_viz",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/ctx_viz is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;