export const command = {
  name: "backfill-sessions",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/backfill-sessions is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;