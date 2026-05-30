export const command = {
  name: "onboarding",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/onboarding is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;