import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";
import { padRightCells, truncateCells } from "./design/textLayout.js";
import { isChineseUi, type UiLanguage } from "../services/ui/languageService.js";

export interface PromptHelpRow {
  key: string;
  action: string;
}

export interface PromptHelpSection {
  title: string;
  rows: PromptHelpRow[];
}

export function PromptHelpPanel(props: {
  width: number;
  busy: boolean;
  language?: UiLanguage;
}): React.ReactElement {
  const width = Math.max(46, Math.min(props.width - 2, 104));
  const sections = buildPromptHelpSections(props.busy, props.language);
  const columnWidth = width >= 92 ? Math.floor((width - 4) / 2) : width - 4;
  const columns = width >= 92 ? splitPromptHelpColumns(sections) : [sections];
  const zh = isChineseUi(props.language);

  return (
    <Box paddingX={1} paddingBottom={1}>
      <Pane title={zh ? "快捷键" : "Shortcuts"} tone="brand" width={width}>
        <Box flexDirection={columns.length > 1 ? "row" : "column"}>
          {columns.map((column, columnIndex) => (
            <Box
              key={`column-${columnIndex}`}
              flexDirection="column"
              marginRight={columnIndex === 0 && columns.length > 1 ? 2 : 0}
              width={columnWidth}
            >
              {column.map((section) => (
                <Box key={section.title} flexDirection="column" marginBottom={1}>
                  <Text color="cyan">{section.title}</Text>
                  {section.rows.map((row) => (
                    <Text key={`${section.title}:${row.key}`} color="gray">
                      <Text color="white">{padRightCells(row.key, 18)}</Text>
                      {truncateCells(row.action, Math.max(12, columnWidth - 18))}
                    </Text>
                  ))}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Text color="gray">{zh ? "按 Esc 或 ? 关闭。" : "Press Esc or ? to close."}</Text>
      </Pane>
    </Box>
  );
}

export function buildPromptHelpSections(busy: boolean, language?: UiLanguage): PromptHelpSection[] {
  const zh = isChineseUi(language);
  return [
    {
      title: zh ? "导航" : "Navigate",
      rows: [
        { key: "Ctrl+P", action: zh ? "打开命令面板" : "open command palette" },
        { key: "Ctrl+O", action: zh ? "快速打开文件，Enter 添加 @file" : "quick open files, Enter adds @file" },
        { key: "Ctrl+R", action: zh ? "搜索输入历史" : "search prompt history" },
        { key: "Up / Down", action: zh ? "无选择器时滚动对话记录" : "scroll transcript when no picker is open" },
        { key: "PageUp / PageDown", action: zh ? "大步滚动对话记录" : "scroll transcript by a larger step" },
        { key: "?", action: zh ? "显示或隐藏快捷键" : "show or hide this shortcut panel" },
      ],
    },
    {
      title: zh ? "编辑" : "Edit",
      rows: [
        { key: "Tab", action: zh ? "补全选中的 slash 命令" : "complete selected slash command" },
        { key: "Shift+Enter", action: zh ? "插入换行" : "insert newline" },
        { key: "Ctrl+Up / Ctrl+Down", action: zh ? "切换输入历史" : "cycle prompt history" },
        { key: "Ctrl+A / Ctrl+E", action: zh ? "移动到开头或结尾" : "move to start or end" },
        { key: "Ctrl+U / Ctrl+K", action: zh ? "清除光标前或后的内容" : "clear before or after cursor" },
        { key: "Ctrl+W", action: zh ? "删除光标前一个词" : "delete word before cursor" },
        { key: "Esc Esc", action: zh ? "二次确认后清空输入" : "clear current input after confirm" },
      ],
    },
    {
      title: zh ? "运行" : "Run",
      rows: [
        { key: "Enter", action: busy ? (zh ? "工作中追加下一条" : "queue next prompt while working") : (zh ? "发送输入" : "send prompt") },
        { key: "/cancel", action: zh ? "取消或查看运行中的任务" : "cancel or inspect a running task" },
        { key: "/status", action: zh ? "显示项目、provider、缓存、权限" : "show project, provider, cache, gates" },
        { key: "/queue", action: zh ? "查看持久任务队列" : "inspect durable task queue" },
      ],
    },
    {
      title: "DeepSeek",
      rows: [
        { key: "/model", action: zh ? "打开模型选择器；Up/Down 选择，Enter 切换" : "open model selector; Up/Down and Enter switch" },
        { key: "/language", action: zh ? "切换界面语言：zh 或 en" : "switch UI language: zh or en" },
        { key: "/cache plan", action: zh ? "预览缓存友好的 prompt 块" : "preview cache-safe prompt blocks" },
        { key: "/cache doctor", action: zh ? "诊断缓存命中率和漂移" : "diagnose cache hit rate and drift" },
        { key: "/permissions", action: zh ? "切换 shell/browser 权限" : "change shell/browser profile" },
      ],
    },
  ];
}

export function splitPromptHelpColumns(sections: PromptHelpSection[]): PromptHelpSection[][] {
  const midpoint = Math.ceil(sections.length / 2);
  return [sections.slice(0, midpoint), sections.slice(midpoint)];
}
