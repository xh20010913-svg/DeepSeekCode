import React from "react";
import { Box, Text } from "ink";
import { isChineseUi } from "../services/ui/languageService.js";
import { SelectList } from "./design/SelectList.js";

export type StartupShellChoice = "enable" | "ask";

export const startupShellChoices: StartupShellChoice[] = ["enable", "ask"];

export function StartupShellPromptPanel(props: {
  selectedIndex: number;
  projectPath: string;
  language: string;
  width: number;
}): React.ReactElement {
  const zh = isChineseUi(props.language);
  const width = Math.max(48, Math.min(104, props.width - 4));
  const options = zh
    ? [
        {
          id: "enable",
          label: "开启本会话 shell",
          detail: "Enter / Y",
          description: "允许 DeepSeekCode 在当前项目目录中运行构建、测试和验证命令。",
          tone: "success" as const,
        },
        {
          id: "ask",
          label: "保持关闭",
          detail: "N / Esc",
          description: "文件工具照常可用；需要 shell 时再弹出权限选择。",
          tone: "muted" as const,
        },
      ]
    : [
        {
          id: "enable",
          label: "Enable shell for this session",
          detail: "Enter / Y",
          description: "Allow DeepSeekCode to run build, test, and validation commands in this project.",
          tone: "success" as const,
        },
        {
          id: "ask",
          label: "Keep shell off",
          detail: "N / Esc",
          description: "File tools remain available; command execution will ask later when needed.",
          tone: "muted" as const,
        },
      ];

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1} width={width}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan" bold>
              {zh ? "启动权限确认" : "Startup Permission"}
            </Text>
            <Text color="yellow">shell</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">
              {zh
                ? "是否为本次 TUI 会话开启 shell 执行权限？"
                : "Enable shell execution for this TUI session?"}
            </Text>
            <Text color="gray">
              {zh ? `项目 ${props.projectPath}` : `Project ${props.projectPath}`}
            </Text>
          </Box>
          <Box marginTop={1}>
            <SelectList
              selectedIndex={props.selectedIndex}
              visibleCount={2}
              width={Math.max(40, width - 6)}
              options={options}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              {zh
                ? "方向键选择，Enter 确认。这个选择只影响当前会话，不写入全局配置。"
                : "Use Up/Down and Enter. This choice affects this session only."}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
