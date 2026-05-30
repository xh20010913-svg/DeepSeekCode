export const command = {
  name: "ant-trace",
  description: "ClaudeCode command path adapter for DeepSeekCode.",
  execute() {
    return { message: "/ant-trace is present as a compatibility source path. Run /help for supported DeepSeekCode commands." };
  },
};

export default command;