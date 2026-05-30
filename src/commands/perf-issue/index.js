export const command = {
  name: "perf-issue",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/perf-issue is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;