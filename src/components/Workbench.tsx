import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import { getCommands, runSlashCommand } from "../commands/index.js";
import { buildRepositoryMap } from "../context/repositoryMap.js";
import {
  isBackspaceInput,
  isDeleteInput,
  isPrintableInput,
} from "../keybindings/inputKeys.js";
import type { DeepSeekProviderClient, UsageSnapshot } from "../protocol/provider.js";
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
import { isChineseUi, normalizeUiLanguage } from "../services/ui/languageService.js";
import { useInputHistory } from "../hooks/useInputHistory.js";
import { useApprovals } from "../hooks/useApprovals.js";
import { usePromptEditor } from "../hooks/usePromptEditor.js";
import { useRuntimePermissions } from "../hooks/useRuntimePermissions.js";
import { gateDecisionOptions, type GateDecisionOption } from "../services/approval/gateDecisionOptions.js";
import { DeepSeekClient } from "../services/deepseek/client.js";
import { DEEPSEEK_MODEL_OPTIONS } from "../services/deepseek/models.js";
import { Composer } from "./Composer.js";
import { CommandPalette } from "./CommandPalette.js";
import { Footer } from "./Footer.js";
import { Header } from "./Header.js";
import { HistorySearchPanel } from "./HistorySearchPanel.js";
import { MemoryUsageIndicator } from "./MemoryUsageIndicator.js";
import { ModelPicker, modelPickerModel } from "./ModelPicker.js";
import { currentSessionPendingGates, PendingGatePanel } from "./PendingGatePanel.js";
import { PromptHelpPanel } from "./PromptHelpPanel.js";
import { PromptNoticePanel } from "./PromptNoticePanel.js";
import { QuickOpenPanel } from "./QuickOpenPanel.js";
import { QueuedPromptPanel } from "./QueuedPromptPanel.js";
import { SidePanel } from "./SidePanel.js";
import { groupTranscriptItems, Transcript, type TranscriptItem } from "./Transcript.js";
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
  const [activeConfig, setActiveConfig] = useState(props.config);
  const [activeProvider, setActiveProvider] = useState(props.provider);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [transcriptScrollOffset, setTranscriptScrollOffset] = useState(0);
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
  const [lastTurnUsage, setLastTurnUsage] = useState<UsageSnapshot>({});
  const [sessionUsage, setSessionUsage] = useState<UsageSnapshot>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [clearPromptPending, setClearPromptPending] = useState(false);
  const [sessionStartedAtMs] = useState(() => Date.now());
  const [gateSelectedIndex, setGateSelectedIndex] = useState(0);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelSelectedIndex, setModelSelectedIndex] = useState(0);
  const editor = usePromptEditor();
  const history = useInputHistory();
  const { permissions } = useRuntimePermissions({
    allowShell: activeConfig.shellEnabled,
    allowBrowser: activeConfig.browserEnabled,
    profile: activeConfig.permissionProfile,
  });
  const sessionStorage = useMemo(
    () => new SessionStorage(activeConfig.dataDir),
    [activeConfig.dataDir],
  );
  const switchModel = useCallback((model: string): boolean => {
    if (busy) {
      const text = isChineseUi(activeConfig.language)
        ? "请先完成或取消当前任务，再切换模型。"
        : "Finish or cancel the current run before switching models.";
      sessionStorage.append({ role: "system", text });
      setItems((previous) => [...previous, { role: "system", text, timestamp: Date.now() }]);
      return false;
    }
    const providerConfig = activeConfig.provider
      ? { ...activeConfig.provider, model }
      : null;
    setActiveConfig((previous) => ({
      ...previous,
      model,
      provider: providerConfig,
    }));
    setActiveProvider(providerConfig ? new DeepSeekClient(providerConfig) : null);
    setModelSelectorOpen(false);
    const text = isChineseUi(activeConfig.language) ? `模型已切换到 ${model}` : `Model switched to ${model}`;
    sessionStorage.append({ role: "system", text });
    setItems((previous) => [...previous, { role: "system", text, timestamp: Date.now(), model }]);
    return true;
  }, [activeConfig, busy, sessionStorage]);
  const switchLanguage = useCallback((language: string): boolean => {
    const normalized = normalizeUiLanguage(language);
    if (!normalized) return false;
    setActiveConfig((previous) => ({
      ...previous,
      language: normalized,
    }));
    const text = isChineseUi(normalized) ? "界面语言已切换为中文。" : "UI language switched to English.";
    sessionStorage.append({ role: "system", text });
    setItems((previous) => [...previous, { role: "system", text, timestamp: Date.now() }]);
    return true;
  }, [sessionStorage]);
  const openModelSelector = useCallback(() => {
    const current = DEEPSEEK_MODEL_OPTIONS.findIndex((option) => option.id === activeConfig.model);
    setModelSelectedIndex(Math.max(0, current));
    setModelSelectorOpen(true);
    setPaletteOpen(false);
    setHistoryOpen(false);
    setQuickOpenOpen(false);
    setHelpOpen(false);
    setClearPromptPending(false);
  }, [activeConfig.model]);
  const engine = useMemo(
    () =>
      new QueryEngine({
        config: activeConfig,
        state: props.state,
        provider: activeProvider,
        permissions,
        requestExit: () => app.exit(),
        requestClear: () => setItems([]),
        requestModelSelector: openModelSelector,
        switchModel,
        switchLanguage,
        awaitUserDecisions: true,
        sessionPersistence: "external",
      }),
    [activeConfig, activeProvider, props.state, permissions, app, openModelSelector, switchModel, switchLanguage],
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
  const transcriptEntryCount = useMemo(
    () => groupTranscriptItems(items).length,
    [items],
  );
  const maxTranscriptScrollOffset = Math.max(0, transcriptEntryCount - 1);
  const pendingGates = useApprovals(props.state, "pending", 20);
  const visiblePendingGates = useMemo(
    () => currentSessionPendingGates(pendingGates, sessionStartedAtMs),
    [pendingGates, sessionStartedAtMs],
  );
  const activeGate = visiblePendingGates[0];
  const activeGateOptions = useMemo(
    () => activeGate
      ? gateDecisionOptions({ gate: activeGate, projectPath: activeConfig.projectPath })
      : [],
    [activeGate, activeConfig.projectPath],
  );

  useEffect(() => {
    setCurrentSessionId(props.state, activeConfig.projectPath, sessionStorage.sessionId);
  }, [props.state, activeConfig.projectPath, sessionStorage.sessionId]);

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
    setGateSelectedIndex((previous) => Math.min(previous, Math.max(0, activeGateOptions.length - 1)));
  }, [activeGate?.id, activeGateOptions.length]);

  useEffect(() => {
    setTranscriptScrollOffset((previous) => Math.min(previous, maxTranscriptScrollOffset));
  }, [maxTranscriptScrollOffset]);

  useEffect(() => {
    setModelSelectedIndex((previous) => Math.min(previous, Math.max(0, DEEPSEEK_MODEL_OPTIONS.length - 1)));
  }, []);

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
      if (busy && engine.cancelActiveRun()) {
        setQueuedPrompts([]);
        const text = isChineseUi(activeConfig.language) ? "正在取消当前任务..." : "Cancelling current run...";
        setItems((previous) => [
          ...previous,
          { role: "system", text, timestamp: Date.now() },
        ]);
        return;
      }
      app.exit();
      return;
    }
    if (handleModelSelectorInput(character, key)) {
      return;
    }
    if (handleGatePromptInput(character, key)) {
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
    if (editor.value === "/model" && (key.return || key.tab)) {
      openModelSelector();
      editor.reset();
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
    if (key.return && suggestions.length > 0 && shouldCompleteSelectedSuggestion(editor.value, suggestions[selectedSuggestion]?.name)) {
      const completion = completeSlashCommand(editor.value, editor.cursor, suggestions[selectedSuggestion]!);
      editor.set(completion.value, completion.cursor);
      setSelectedSuggestion(0);
      return;
    }
    if (isPageUpKey(key)) {
      scrollTranscript(10);
      return;
    }
    if (isPageDownKey(key)) {
      scrollTranscript(-10);
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
      if (key.ctrl) {
        const previous = history.previous(editor.value);
        if (previous !== null) editor.set(previous, "end");
        return;
      }
      scrollTranscript(1);
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((previous) => (previous + 1) % suggestions.length);
        return;
      }
      if (key.ctrl) {
        const next = history.next();
        if (next !== null) editor.set(next, "end");
        return;
      }
      scrollTranscript(-1);
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

  function handleGatePromptInput(
    character: string,
    key: {
      upArrow?: boolean;
      downArrow?: boolean;
      return?: boolean;
      tab?: boolean;
      shift?: boolean;
      escape?: boolean;
      ctrl?: boolean;
      meta?: boolean;
    },
  ): boolean {
    if (!activeGate || activeGateOptions.length === 0) return false;
    if (quickOpenOpen || historyOpen || paletteOpen || helpOpen) return false;
    const typedAnswerCommand = gateTypedQuestionAnswerCommand(activeGate.subjectType, editor.value);

    if (editor.value.trim()) {
      if (key.return && typedAnswerCommand) {
        editor.reset();
        setClearPromptPending(false);
        void applyGateCommand(typedAnswerCommand);
        return true;
      }
      return false;
    }

    if (key.upArrow) {
      setGateSelectedIndex((previous) => (
        activeGateOptions.length === 0 ? 0 : (previous - 1 + activeGateOptions.length) % activeGateOptions.length
      ));
      return true;
    }
    if (key.downArrow || key.tab) {
      setGateSelectedIndex((previous) => (
        activeGateOptions.length === 0 ? 0 : (previous + (key.shift ? -1 : 1) + activeGateOptions.length) % activeGateOptions.length
      ));
      return true;
    }
    if (key.return) {
      void applyGateDecision(activeGateOptions[gateSelectedIndex] ?? activeGateOptions[0]);
      return true;
    }
    if (key.escape) {
      const cancel = activeGateOptions.find((option) => option.tone === "neutral")
        ?? activeGateOptions.find((option) => option.tone === "reject");
      if (cancel) void applyGateDecision(cancel);
      return true;
    }
    const lower = character.toLowerCase();
    if (/^[1-9]$/.test(character)) {
      const option = activeGateOptions[Number(character) - 1];
      if (option) void applyGateDecision(option);
      return true;
    }
    const directShortcut = gateDirectShortcutIntent(activeGate.subjectType, editor.value, lower);
    if (directShortcut === "allow") {
      const allow = activeGateOptions.find((option) => option.tone === "allow");
      if (allow) void applyGateDecision(allow);
      return true;
    }
    if (directShortcut === "reject") {
      const reject = activeGateOptions.find((option) => option.tone === "reject");
      if (reject) void applyGateDecision(reject);
      return true;
    }
    if (isPrintableInput(character, key)) {
      return false;
    }
    return false;
  }

  async function applyGateDecision(option: GateDecisionOption | undefined): Promise<void> {
    if (!option) return;
    if (option.command.includes("<")) {
      editor.set(option.command.replace(/<[^>]+>/g, "").trimEnd() + " ", "end");
      return;
    }
    await applyGateCommand(option.command);
  }

  async function applyGateCommand(command: string): Promise<void> {
    const result = await runSlashCommand(command, engine.commandContext());
    if (result.clear) {
      setItems([]);
    }
    if (result.display) {
      sessionStorage.append({ role: "system", text: result.message ?? command });
      setItems((previous) => [
        ...previous,
        { role: "display", text: result.message ?? "", display: result.display, timestamp: Date.now() },
      ]);
    } else if (result.message) {
      const message = result.message;
      sessionStorage.append({ role: "system", text: message });
      setItems((previous) => [...previous, { role: "system", text: message, timestamp: Date.now() }]);
    }
    if (result.submit) {
      if (busy) {
        setQueuedPrompts((previous) => [...previous, result.submit!]);
      } else {
        void submit(result.submit, { resetEditor: false });
      }
    }
    if (result.exit) app.exit();
  }

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
      setQuickOpenFiles(buildRepositoryMap(activeConfig.projectPath, 800).files);
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
    setTranscriptScrollOffset(0);
    if (options.resetEditor ?? true) editor.reset();
    setClearPromptPending(false);
    history.add(text);
    setBusy(true);
    setLastTurnUsage({});
    let streamingAssistant = "";
    let reasoningText = "";
    let turnUsage: UsageSnapshot = {};
    try {
      for await (const event of engine.submit(text)) {
        if (event.type === "user") {
          sessionStorage.append({ role: "user", text: event.text });
          setItems((previous) => [...previous, { role: "user", text: event.text, timestamp: Date.now() }]);
        } else if (event.type === "assistant_delta") {
          streamingAssistant += event.text;
          setItems((previous) => replaceStreamingAssistant(previous, streamingAssistant, activeConfig.model));
        } else if (event.type === "assistant") {
          streamingAssistant = "";
          if (reasoningText.trim()) {
            setItems((previous) => markThinkingDone(previous, turnUsage));
          }
          sessionStorage.append({ role: "assistant", text: event.text });
          setItems((previous) => replaceFinalAssistant(previous, event.text, activeConfig.model));
        } else if (event.type === "reasoning_delta") {
          reasoningText += event.text;
          setItems((previous) => replaceThinkingLine(previous, reasoningText));
        } else if (event.type === "usage") {
          const nextTurnUsage = addUsage(turnUsage, event.usage);
          turnUsage = nextTurnUsage;
          setLastTurnUsage(nextTurnUsage);
          setSessionUsage((previous) => addUsage(previous, event.usage));
          if (reasoningText.trim()) {
            setItems((previous) => markThinkingDone(previous, nextTurnUsage));
          }
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

  function scrollTranscript(delta: number): void {
    setClearPromptPending(false);
    setTranscriptScrollOffset((previous) => {
      const next = Math.max(0, Math.min(maxTranscriptScrollOffset, previous + delta));
      return next;
    });
  }

  function handleModelSelectorInput(
    character: string,
    key: {
      upArrow?: boolean;
      downArrow?: boolean;
      return?: boolean;
      tab?: boolean;
      shift?: boolean;
      escape?: boolean;
      ctrl?: boolean;
      meta?: boolean;
    },
  ): boolean {
    if (!modelSelectorOpen) return false;
    if (key.escape) {
      setModelSelectorOpen(false);
      return true;
    }
    if (key.upArrow) {
      setModelSelectedIndex((previous) => (
        DEEPSEEK_MODEL_OPTIONS.length === 0
          ? 0
          : (previous - 1 + DEEPSEEK_MODEL_OPTIONS.length) % DEEPSEEK_MODEL_OPTIONS.length
      ));
      return true;
    }
    if (key.downArrow || key.tab) {
      setModelSelectedIndex((previous) => (
        DEEPSEEK_MODEL_OPTIONS.length === 0
          ? 0
          : (previous + (key.shift ? -1 : 1) + DEEPSEEK_MODEL_OPTIONS.length) % DEEPSEEK_MODEL_OPTIONS.length
      ));
      return true;
    }
    if (key.return) {
      const option = DEEPSEEK_MODEL_OPTIONS[modelSelectedIndex];
      if (option) switchModel(option.id);
      return true;
    }
    if (/^[1-9]$/.test(character)) {
      const option = DEEPSEEK_MODEL_OPTIONS[Number(character) - 1];
      if (option) switchModel(option.id);
      return true;
    }
    return true;
  }

  return (
    <Box flexDirection="column">
      <Header config={activeConfig} provider={activeProvider} />
      <Box>
        <Box flexGrow={1} flexDirection="column" marginRight={showSidePanel ? 1 : 0}>
          <Transcript
            items={items}
            height={height}
            width={mainWidth}
            scrollOffset={transcriptScrollOffset}
            providerReady={Boolean(activeProvider)}
            model={activeConfig.model}
            projectPath={activeConfig.projectPath}
            permissionProfile={permissions.profile ?? activeConfig.permissionProfile}
            shellEnabled={permissions.allowShell}
            browserEnabled={permissions.allowBrowser}
            language={activeConfig.language}
          />
        </Box>
        {showSidePanel && (
          <SidePanel
            config={activeConfig}
            state={props.state}
            busy={busy}
            permissions={permissions}
            lastTurnUsage={lastTurnUsage}
            sessionUsage={sessionUsage}
          />
        )}
      </Box>
      <PendingGatePanel
        projectPath={activeConfig.projectPath}
        state={props.state}
        sessionStartedAtMs={sessionStartedAtMs}
        gates={pendingGates}
        selectedDecisionIndex={gateSelectedIndex}
      />
      {helpOpen && (
        <PromptHelpPanel
          width={columns}
          busy={busy}
          language={activeConfig.language}
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
          projectPath={activeConfig.projectPath}
          files={quickOpenFiles}
          query={quickOpenQuery}
          selectedIndex={quickOpenSelected}
          width={columns}
        />
      )}
      {modelSelectorOpen && (
        <Box paddingX={1} marginTop={1}>
          <ModelPicker
            model={modelPickerModel({
              activeModel: activeConfig.model,
              providerName: activeConfig.provider?.name,
              providerReady: Boolean(activeProvider),
              selectedIndex: modelSelectedIndex,
            })}
            width={Math.max(48, columns - 2)}
          />
        </Box>
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
        activePromptHint={activeGate ? gateComposerHint(activeGate.subjectType, activeConfig.language) : undefined}
        language={activeConfig.language}
      />
      <Footer
        busy={busy}
        queuedCount={queuedPrompts.length}
        permissions={permissions}
        config={activeConfig}
        state={props.state}
        sessionStartedAtMs={sessionStartedAtMs}
        lastTurnUsage={lastTurnUsage}
        sessionUsage={sessionUsage}
        providerReady={Boolean(activeProvider)}
        width={columns}
        compact={!showSidePanel}
        transcriptScrollOffset={transcriptScrollOffset}
      />
    </Box>
  );
}

function gateComposerHint(subjectType: string, language = "zh-CN"): string {
  const zh = isChineseUi(language === "en" ? "en" : "zh-CN");
  if (subjectType === "question") {
    return zh
      ? "问题等待回答：直接输入答案，或选数字，Esc 拒绝。"
      : "Answer prompt active: type an answer, choose a number, or Esc to reject.";
  }
  if (subjectType === "plan") {
    return zh
      ? "计划等待确认：Up/Down 选择，Enter/Y 通过，N 拒绝，Esc 取消。"
      : "Plan approval active: use Up/Down, Enter/Y to approve, N to reject, Esc to cancel.";
  }
  return zh
    ? "权限等待确认：Up/Down 选择，Enter/Y 允许一次，N 拒绝，Esc 取消。"
    : "Permission prompt active: use Up/Down, Enter/Y to allow once, N to reject, Esc to cancel.";
}

export function gateTypedQuestionAnswerCommand(subjectType: string, value: string): string | null {
  const answer = value.trim();
  if (subjectType !== "question" || !answer || answer.startsWith("/")) return null;
  return `/question answer latest ${answer}`;
}

export type GateDirectShortcutIntent = "allow" | "reject" | null;

function shouldCompleteSelectedSuggestion(value: string, commandName: string | undefined): boolean {
  if (!commandName) return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || /\s/.test(trimmed)) return false;
  return trimmed !== `/${commandName}`;
}

function isPageUpKey(key: unknown): boolean {
  return Boolean((key as { pageUp?: boolean; pageup?: boolean }).pageUp)
    || Boolean((key as { pageUp?: boolean; pageup?: boolean }).pageup);
}

function isPageDownKey(key: unknown): boolean {
  return Boolean((key as { pageDown?: boolean; pagedown?: boolean }).pageDown)
    || Boolean((key as { pageDown?: boolean; pagedown?: boolean }).pagedown);
}

export function gateDirectShortcutIntent(
  subjectType: string,
  currentPrompt: string,
  character: string,
): GateDirectShortcutIntent {
  if (currentPrompt.trim() || subjectType === "question") return null;
  const lower = character.toLowerCase();
  if (lower === "y" || lower === "a") return "allow";
  if (lower === "n" || lower === "r") return "reject";
  return null;
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

function markThinkingDone(items: TranscriptItem[], usage: UsageSnapshot): TranscriptItem[] {
  const last = items.at(-1);
  if (last?.role !== "thinking") return items;
  if (/thinking done/.test(last.text)) return items;
  const suffix = usageSummary(usage);
  return [
    ...items.slice(0, -1),
    {
      ...last,
      text: `${last.text}${suffix ? `\nthinking done - ${suffix}` : "\nthinking done"}`,
    },
  ];
}

function addUsage(left: UsageSnapshot, right: UsageSnapshot): UsageSnapshot {
  return {
    inputTokens: addNumber(left.inputTokens, right.inputTokens),
    outputTokens: addNumber(left.outputTokens, right.outputTokens),
    cacheHitTokens: addNumber(left.cacheHitTokens, right.cacheHitTokens),
    cacheMissTokens: addNumber(left.cacheMissTokens, right.cacheMissTokens),
  };
}

function addNumber(left?: number, right?: number): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function usageSummary(usage: UsageSnapshot): string {
  const output = usage.outputTokens ?? 0;
  const hit = usage.cacheHitTokens ?? 0;
  const miss = usage.cacheMissTokens ?? 0;
  const cache = hit + miss > 0 ? `cache ${Math.round((hit / (hit + miss)) * 100)}%` : "";
  return [`tokens+${output}`, cache].filter(Boolean).join(" - ");
}


