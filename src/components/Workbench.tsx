import React, { useEffect, useMemo, useState } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import { getCommands } from "../commands/index.js";
import { buildRepositoryMap } from "../context/repositoryMap.js";
import {
  isBackspaceInput,
  isDeleteInput,
  isPrintableInput,
} from "../keybindings/inputKeys.js";
import type { DeepSeekProviderClient } from "../protocol/provider.js";
import {
  commandPaletteInsertText,
  getCommandPaletteItems,
} from "../prompt/commandPalette.js";
import {
  getHistorySearchItems,
  historySearchInsertText,
} from "../prompt/historySearch.js";
import {
  getQuickOpenItems,
  quickOpenMentionText,
  quickOpenPathText,
  type QuickOpenFile,
} from "../prompt/quickOpen.js";
import {
  completeSlashCommand,
  getSlashCommandSuggestions,
} from "../prompt/commandSuggestions.js";
import type { StateStore } from "../state/sqlite.js";
import { QueryEngine } from "../query/QueryEngine.js";
import { SessionStorage } from "../services/session/sessionStorage.js";
import { setCurrentSessionId } from "../services/session/resumeService.js";
import { ThemeService } from "../services/theme/themeService.js";
import { useInputHistory } from "../hooks/useInputHistory.js";
import { usePromptEditor } from "../hooks/usePromptEditor.js";
import { useRuntimePermissions } from "../hooks/useRuntimePermissions.js";
import { Composer } from "./Composer.js";
import { CommandPalette } from "./CommandPalette.js";
import { Footer } from "./Footer.js";
import { Header } from "./Header.js";
import { HistorySearchPanel } from "./HistorySearchPanel.js";
import { MemoryUsageIndicator } from "./MemoryUsageIndicator.js";
import { PendingGatePanel } from "./PendingGatePanel.js";
import { PromptHelpPanel } from "./PromptHelpPanel.js";
import { PromptNoticePanel } from "./PromptNoticePanel.js";
import { QuickOpenPanel } from "./QuickOpenPanel.js";
import { QueuedPromptPanel } from "./QueuedPromptPanel.js";
import { SidePanel } from "./SidePanel.js";
import { Transcript, type TranscriptItem } from "./Transcript.js";
import { setActiveTerminalTheme } from "./design/terminalTheme.js";

export function Workbench(props: {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
}): React.ReactElement {
  setActiveTerminalTheme(new ThemeService(props.config.projectPath).current().theme);
  const app = useApp();
  const { stdout } = useStdout();
  const height = stdout.rows ? Math.max(8, stdout.rows - 7) : 18;
  const columns = stdout.columns ?? 100;
  const showSidePanel = process.env.DEEPSEEKCODE_SIDE_PANEL === "1" || columns >= 150;
  const mainWidth = showSidePanel ? Math.max(48, columns - 38) : columns;
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSelected, setPaletteSelected] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySelected, setHistorySelected] = useState(0);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [quickOpenFiles, setQuickOpenFiles] = useState<QuickOpenFile[]>([]);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenSelected, setQuickOpenSelected] = useState(0);
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [clearPromptPending, setClearPromptPending] = useState(false);
  const editor = usePromptEditor();
  const history = useInputHistory();
  const { permissions } = useRuntimePermissions({
    allowShell: props.config.shellEnabled,
    allowBrowser: props.config.browserEnabled,
    profile: props.config.permissionProfile,
  });
  const engine = useMemo(
    () =>
      new QueryEngine({
        config: props.config,
        state: props.state,
        provider: props.provider,
        permissions,
        requestExit: () => app.exit(),
        requestClear: () => setItems([]),
      }),
    [props.config, props.provider, props.state, permissions, app],
  );
  const commands = useMemo(
    () => getCommands(engine.commandContext()),
    [engine],
  );
  const suggestions = useMemo(
    () => paletteOpen ? [] : getSlashCommandSuggestions(commands, editor.value, editor.cursor, 5),
    [commands, editor.cursor, editor.value, paletteOpen],
  );
  const paletteItems = useMemo(
    () => getCommandPaletteItems(commands, paletteQuery, 9),
    [commands, paletteQuery],
  );
  const historyItems = useMemo(
    () => getHistorySearchItems(historyEntries, historyQuery, 9),
    [historyEntries, historyQuery],
  );
  const quickOpenItems = useMemo(
    () => getQuickOpenItems(quickOpenFiles, quickOpenQuery, 9),
    [quickOpenFiles, quickOpenQuery],
  );
  const sessionStorage = useMemo(
    () => new SessionStorage(props.config.dataDir),
    [props.config.dataDir],
  );

  useEffect(() => {
    setCurrentSessionId(props.state, props.config.projectPath, sessionStorage.sessionId);
  }, [props.state, props.config.projectPath, sessionStorage.sessionId]);

  useEffect(() => {
    setSelectedSuggestion((previous) => Math.min(previous, Math.max(0, suggestions.length - 1)));
  }, [suggestions.length]);

  useEffect(() => {
    setPaletteSelected((previous) => Math.min(previous, Math.max(0, paletteItems.length - 1)));
  }, [paletteItems.length]);

  useEffect(() => {
    setHistorySelected((previous) => Math.min(previous, Math.max(0, historyItems.length - 1)));
  }, [historyItems.length]);

  useEffect(() => {
    setQuickOpenSelected((previous) => Math.min(previous, Math.max(0, quickOpenItems.length - 1)));
  }, [quickOpenItems.length]);

  useEffect(() => {
    if (busy || queuedPrompts.length === 0) return;
    const nextPrompt = queuedPrompts[0];
    if (!nextPrompt) return;
    setQueuedPrompts((previous) => previous.slice(1));
    void submit(nextPrompt, { resetEditor: false });
  }, [busy, queuedPrompts]);

  useEffect(() => {
    if (!clearPromptPending) return;
    const timeout = setTimeout(() => setClearPromptPending(false), 900);
    return () => clearTimeout(timeout);
  }, [clearPromptPending]);

  useInput((character, key) => {
    if (key.ctrl && character === "c") {
      app.exit();
      return;
    }
    if (helpOpen) {
      if (key.escape || (character === "?" && editor.value.length === 0)) {
        setHelpOpen(false);
        return;
      }
      if (isPrintableInput(character, key) || key.return || key.tab) {
        setHelpOpen(false);
      }
    }
    if (quickOpenOpen) {
      if (key.escape) {
        closeQuickOpen();
        return;
      }
      if (key.return) {
        insertQuickOpenFile(true);
        return;
      }
      if (key.tab) {
        insertQuickOpenFile(false);
        return;
      }
      if (key.upArrow) {
        setQuickOpenSelected((previous) => (
          quickOpenItems.length === 0 ? 0 : (previous - 1 + quickOpenItems.length) % quickOpenItems.length
        ));
        return;
      }
      if (key.downArrow) {
        setQuickOpenSelected((previous) => (
          quickOpenItems.length === 0 ? 0 : (previous + 1) % quickOpenItems.length
        ));
        return;
      }
      if (isBackspaceInput(character, key)) {
        handleBackspaceInput();
        return;
      }
      if (isDeleteInput(character, key)) {
        handleDeleteInput();
        return;
      }
      if (key.ctrl && character === "u") {
        setQuickOpenQuery("");
        setQuickOpenSelected(0);
        return;
      }
      if (isPrintableInput(character, key)) {
        setQuickOpenQuery((previous) => previous + character);
        setQuickOpenSelected(0);
      }
      return;
    }
    if (historyOpen) {
      if (key.escape) {
        closeHistorySearch();
        return;
      }
      if (key.return || key.tab) {
        insertHistoryPrompt();
        return;
      }
      if (key.upArrow) {
        setHistorySelected((previous) => (
          historyItems.length === 0 ? 0 : (previous - 1 + historyItems.length) % historyItems.length
        ));
        return;
      }
      if (key.downArrow) {
        setHistorySelected((previous) => (
          historyItems.length === 0 ? 0 : (previous + 1) % historyItems.length
        ));
        return;
      }
      if (isBackspaceInput(character, key)) {
        handleBackspaceInput();
        return;
      }
      if (isDeleteInput(character, key)) {
        handleDeleteInput();
        return;
      }
      if (key.ctrl && character === "u") {
        setHistoryQuery("");
        setHistorySelected(0);
        return;
      }
      if (isPrintableInput(character, key)) {
        setHistoryQuery((previous) => previous + character);
        setHistorySelected(0);
      }
      return;
    }
    if (paletteOpen) {
      if (key.escape) {
        closePalette();
        return;
      }
      if (key.return || key.tab) {
        insertPaletteCommand();
        return;
      }
      if (key.upArrow) {
        setPaletteSelected((previous) => (
          paletteItems.length === 0 ? 0 : (previous - 1 + paletteItems.length) % paletteItems.length
        ));
        return;
      }
      if (key.downArrow) {
        setPaletteSelected((previous) => (
          paletteItems.length === 0 ? 0 : (previous + 1) % paletteItems.length
        ));
        return;
      }
      if (isBackspaceInput(character, key)) {
        handleBackspaceInput();
        return;
      }
      if (isDeleteInput(character, key)) {
        handleDeleteInput();
        return;
      }
      if (key.ctrl && character === "u") {
        setPaletteQuery("");
        setPaletteSelected(0);
        return;
      }
      if (isPrintableInput(character, key)) {
        setPaletteQuery((previous) => previous + character);
        setPaletteSelected(0);
      }
      return;
    }
    if (clearPromptPending && !key.escape) {
      setClearPromptPending(false);
    }
    if (key.escape) {
      if (editor.value.length > 0) {
        if (clearPromptPending) {
          editor.reset();
          setClearPromptPending(false);
        } else {
          setClearPromptPending(true);
        }
      }
      return;
    }
    if (key.ctrl && character === "o") {
      setHelpOpen(false);
      setClearPromptPending(false);
      openQuickOpen();
      return;
    }
    if (key.ctrl && character === "r") {
      setHelpOpen(false);
      setClearPromptPending(false);
      setHistoryEntries(history.snapshot({ newestFirst: true }));
      setHistoryQuery(editor.value);
      setHistorySelected(0);
      setHistoryOpen(true);
      return;
    }
    if (key.ctrl && character === "p") {
      setHelpOpen(false);
      setClearPromptPending(false);
      setPaletteQuery(editor.value.startsWith("/") ? editor.value.slice(1) : "");
      setPaletteSelected(0);
      setPaletteOpen(true);
      return;
    }
    if (character === "?" && editor.value.length === 0 && !key.ctrl && !key.meta) {
      setHelpOpen(true);
      setClearPromptPending(false);
      return;
    }
    if (key.return && key.shift) {
      editor.dispatch({ type: "insert", text: "\n" });
      return;
    }
    if (key.tab && suggestions.length > 0) {
      const index = key.shift
        ? (selectedSuggestion - 1 + suggestions.length) % suggestions.length
        : selectedSuggestion;
      const completion = completeSlashCommand(editor.value, editor.cursor, suggestions[index]!);
      editor.set(completion.value, completion.cursor);
      setSelectedSuggestion(0);
      return;
    }
    if (key.return) {
      if (busy) {
        queuePrompt(editor.value);
      } else {
        void submit(editor.value);
      }
      return;
    }
    if (isBackspaceInput(character, key)) {
      handleBackspaceInput();
      return;
    }
    if (isDeleteInput(character, key)) {
      handleDeleteInput();
      return;
    }
    if (key.leftArrow) {
      editor.dispatch({ type: "moveLeft" });
      return;
    }
    if (key.rightArrow) {
      editor.dispatch({ type: "moveRight" });
      return;
    }
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((previous) => (previous - 1 + suggestions.length) % suggestions.length);
        return;
      }
      const previous = history.previous(editor.value);
      if (previous !== null) editor.set(previous, "end");
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((previous) => (previous + 1) % suggestions.length);
        return;
      }
      const next = history.next();
      if (next !== null) editor.set(next, "end");
      return;
    }
    if (key.ctrl && character === "a") {
      editor.dispatch({ type: "moveStart" });
      return;
    }
    if (key.ctrl && character === "e") {
      editor.dispatch({ type: "moveEnd" });
      return;
    }
    if (key.ctrl && character === "u") {
      editor.dispatch({ type: "clearBefore" });
      return;
    }
    if (key.ctrl && character === "k") {
      editor.dispatch({ type: "clearAfter" });
      return;
    }
    if (key.ctrl && character === "w") {
      editor.dispatch({ type: "deleteWordBefore" });
      return;
    }
    if (isPrintableInput(character, key)) {
      editor.dispatch({ type: "insert", text: character });
      setSelectedSuggestion(0);
    }
  });

  function handleBackspaceInput(): void {
    if (quickOpenOpen) {
      setQuickOpenQuery((previous) => previous.slice(0, -1));
      return;
    }
    if (historyOpen) {
      setHistoryQuery((previous) => previous.slice(0, -1));
      return;
    }
    if (paletteOpen) {
      setPaletteQuery((previous) => previous.slice(0, -1));
      return;
    }
    editor.dispatch({ type: "backspace" });
  }

  function handleDeleteInput(): void {
    if (quickOpenOpen) {
      setQuickOpenQuery((previous) => previous.slice(0, -1));
      return;
    }
    if (historyOpen) {
      setHistoryQuery((previous) => previous.slice(0, -1));
      return;
    }
    if (paletteOpen) {
      setPaletteQuery((previous) => previous.slice(0, -1));
      return;
    }
    editor.dispatch({ type: "delete" });
  }

  function closePalette(): void {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteSelected(0);
  }

  function insertPaletteCommand(): void {
    const item = paletteItems[paletteSelected];
    if (!item) return;
    const text = commandPaletteInsertText(item);
    editor.set(text, "end");
    closePalette();
  }

  function closeHistorySearch(): void {
    setHistoryOpen(false);
    setHistoryQuery("");
    setHistorySelected(0);
  }

  function insertHistoryPrompt(): void {
    const item = historyItems[historySelected];
    if (!item) return;
    editor.set(historySearchInsertText(item), "end");
    closeHistorySearch();
  }

  function openQuickOpen(): void {
    try {
      setQuickOpenFiles(buildRepositoryMap(props.config.projectPath, 800).files);
    } catch {
      setQuickOpenFiles([]);
    }
    const mentionMatch = /@([^\s]*)$/.exec(editor.value.slice(0, editor.cursor));
    setQuickOpenQuery(mentionMatch?.[1] ?? "");
    setQuickOpenSelected(0);
    setQuickOpenOpen(true);
  }

  function closeQuickOpen(): void {
    setQuickOpenOpen(false);
    setQuickOpenQuery("");
    setQuickOpenSelected(0);
  }

  function insertQuickOpenFile(asMention: boolean): void {
    const item = quickOpenItems[quickOpenSelected];
    if (!item) return;
    const text = asMention ? quickOpenMentionText(item) : quickOpenPathText(item);
    const beforeCursor = editor.value.slice(0, editor.cursor);
    const afterCursor = editor.value.slice(editor.cursor);
    const mentionMatch = /@([^\s]*)$/.exec(beforeCursor);
    if (mentionMatch) {
      const start = beforeCursor.length - mentionMatch[0].length;
      const nextValue = `${beforeCursor.slice(0, start)}${text}${afterCursor}`;
      editor.set(nextValue, start + text.length);
    } else {
      const nextValue = `${beforeCursor}${text}${afterCursor}`;
      editor.set(nextValue, beforeCursor.length + text.length);
    }
    closeQuickOpen();
  }

  function queuePrompt(value: string): void {
    const text = value.trim();
    if (!text) return;
    setQueuedPrompts((previous) => [...previous, text]);
    editor.reset();
    setClearPromptPending(false);
    setSelectedSuggestion(0);
  }

  async function submit(value: string, options: { resetEditor?: boolean } = {}): Promise<void> {
    const text = value.trim();
    if (!text) return;
    if (options.resetEditor ?? true) editor.reset();
    setClearPromptPending(false);
    history.add(text);
    setBusy(true);
    let streamingAssistant = "";
    try {
      for await (const event of engine.submit(text)) {
        if (event.type === "user") {
          sessionStorage.append({ role: "user", text: event.text });
          setItems((previous) => [...previous, { role: "user", text: event.text, timestamp: Date.now() }]);
        } else if (event.type === "assistant_delta") {
          streamingAssistant += event.text;
          setItems((previous) => replaceStreamingAssistant(previous, streamingAssistant, props.config.model));
        } else if (event.type === "assistant") {
          streamingAssistant = "";
          sessionStorage.append({ role: "assistant", text: event.text });
          setItems((previous) => replaceFinalAssistant(previous, event.text, props.config.model));
        } else if (event.type === "reasoning_delta") {
          setItems((previous) => replaceThinkingLine(previous, event.text.slice(-240)));
        } else if (event.type === "tool_start") {
          setItems((previous) => [...previous, { role: "tool-start", text: event.text, timestamp: Date.now() }]);
        } else if (event.type === "tool_result") {
          setItems((previous) => [...previous, { role: "tool", text: event.text, timestamp: Date.now() }]);
        } else if (event.type === "command") {
          sessionStorage.append({ role: "system", text: event.text });
          setItems((previous) => [...previous, { role: "system", text: event.text, timestamp: Date.now() }]);
        } else if (event.type === "command_display") {
          sessionStorage.append({ role: "system", text: event.fallbackText ?? "[command display]" });
          setItems((previous) => [
            ...previous,
            { role: "display", text: event.fallbackText ?? "", display: event.display, timestamp: Date.now() },
          ]);
        } else if (event.type === "error") {
          sessionStorage.append({ role: "error", text: event.text });
          setItems((previous) => [...previous, { role: "error", text: event.text, timestamp: Date.now() }]);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column">
      <Header config={props.config} provider={props.provider} />
      <Box>
        <Box flexGrow={1} flexDirection="column" marginRight={showSidePanel ? 1 : 0}>
          <Transcript
            items={items}
            height={height}
            width={mainWidth}
            providerReady={Boolean(props.provider)}
            model={props.config.model}
            projectPath={props.config.projectPath}
            permissionProfile={permissions.profile ?? props.config.permissionProfile}
            shellEnabled={permissions.allowShell}
            browserEnabled={permissions.allowBrowser}
          />
        </Box>
        {showSidePanel && (
          <SidePanel
            config={props.config}
            state={props.state}
            busy={busy}
            permissions={permissions}
          />
        )}
      </Box>
      <PendingGatePanel projectPath={props.config.projectPath} state={props.state} />
      {helpOpen && (
        <PromptHelpPanel
          width={columns}
          busy={busy}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          commands={commands}
          query={paletteQuery}
          selectedIndex={paletteSelected}
          width={columns}
        />
      )}
      {historyOpen && (
        <HistorySearchPanel
          entries={historyEntries}
          query={historyQuery}
          selectedIndex={historySelected}
          width={columns}
        />
      )}
      {quickOpenOpen && (
        <QuickOpenPanel
          projectPath={props.config.projectPath}
          files={quickOpenFiles}
          query={quickOpenQuery}
          selectedIndex={quickOpenSelected}
          width={columns}
        />
      )}
      <QueuedPromptPanel prompts={queuedPrompts} width={columns} />
      <MemoryUsageIndicator width={columns} />
      {clearPromptPending && (
        <PromptNoticePanel kind="clear-pending" width={columns} />
      )}
      <Composer
        value={editor.value}
        cursor={editor.cursor}
        busy={busy}
        queuedCount={queuedPrompts.length}
        width={columns}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
      />
      <Footer
        busy={busy}
        queuedCount={queuedPrompts.length}
        permissions={permissions}
        config={props.config}
        state={props.state}
        providerReady={Boolean(props.provider)}
        width={columns}
        compact={!showSidePanel}
      />
    </Box>
  );
}

function replaceStreamingAssistant(items: TranscriptItem[], text: string, model: string): TranscriptItem[] {
  const previousStreaming = items.at(-1);
  const timestamp = previousStreaming?.role === "assistant" && previousStreaming.streaming
    ? previousStreaming.timestamp
    : Date.now();
  const cleaned = dropStreamingAssistant(items);
  return [...cleaned, { role: "assistant", text, timestamp, model, streaming: true }];
}

function replaceFinalAssistant(items: TranscriptItem[], text: string, model: string): TranscriptItem[] {
  const previousStreaming = items.at(-1);
  const timestamp = previousStreaming?.role === "assistant" && previousStreaming.streaming
    ? previousStreaming.timestamp
    : Date.now();
  const cleaned = dropStreamingAssistant(items);
  return [...cleaned, { role: "assistant", text, timestamp, model }];
}

function dropStreamingAssistant(items: TranscriptItem[]): TranscriptItem[] {
  const last = items.at(-1);
  if (last?.role !== "assistant" || !last.streaming) return items;
  return items.slice(0, -1);
}

function replaceThinkingLine(items: TranscriptItem[], text: string): TranscriptItem[] {
  const normalized = text.trim() || "thinking...";
  if (items.at(-1)?.role === "thinking") {
    return [...items.slice(0, -1), { role: "thinking", text: normalized }];
  }
  return [...items, { role: "thinking", text: normalized }];
}
