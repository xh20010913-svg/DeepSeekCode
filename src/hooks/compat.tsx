import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  insertText?: string;
}

export function getFileSuggestions(query: string, files: string[] = []): Suggestion[] {
  const needle = query.replace(/^@/, "").toLowerCase();
  return files
    .filter((file) => !needle || file.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((file) => ({ id: file, label: file, insertText: `@${file}` }));
}

export function renderPlaceholder(value: string, placeholder = ""): string {
  return value.length === 0 ? placeholder : value;
}

export function getUnifiedSuggestions(input: {
  query: string;
  commands?: string[];
  files?: string[];
}): Suggestion[] {
  const query = input.query.trim();
  if (query.startsWith("@")) return getFileSuggestions(query, input.files);
  if (query.startsWith("/")) {
    const needle = query.slice(1).toLowerCase();
    return (input.commands ?? [])
      .filter((command) => command.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((command) => ({ id: command, label: `/${command}`, insertText: `/${command} ` }));
  }
  return [];
}

export function useAfterFirstRender(callback: () => void): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    callback();
  });
}

export function useApiKeyVerification(): { status: "unknown"; verify: () => Promise<boolean> } {
  return { status: "unknown", verify: async () => Boolean(process.env.DEEPSEEK_API_KEY) };
}

export function useArrowKeyHistory<T>(items: T[], initialIndex = items.length): {
  index: number;
  current: T | undefined;
  previous: () => void;
  next: () => void;
} {
  const [index, setIndex] = useState(initialIndex);
  return {
    index,
    current: items[index],
    previous: () => setIndex((value) => Math.max(0, value - 1)),
    next: () => setIndex((value) => Math.min(items.length, value + 1)),
  };
}

export function useAssistantHistory<T>(items: T[] = []): T[] {
  return items;
}

export function useAwaySummary(): null {
  return null;
}

export function useBackgroundTaskNavigation<T>(tasks: T[] = []): { selectedIndex: number; selected: T | undefined } {
  const [selectedIndex] = useState(0);
  return { selectedIndex, selected: tasks[selectedIndex] };
}

export function useBlink(intervalMs = 500): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setVisible((value) => !value), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return visible;
}

export function useCancelRequest(): { cancelled: boolean; cancel: () => void } {
  const [cancelled, setCancelled] = useState(false);
  return { cancelled, cancel: () => setCancelled(true) };
}

export function useCanUseTool(): boolean {
  return true;
}

export function useClipboardImageHint(): null {
  return null;
}

export function useCommandKeybindings(): Record<string, string> {
  return {};
}

export function useCommandQueue<T>(): {
  queue: T[];
  push: (item: T) => void;
  shift: () => T | undefined;
} {
  const [queue, setQueue] = useState<T[]>([]);
  return {
    queue,
    push: (item) => setQueue((items) => [...items, item]),
    shift: () => {
      const first = queue[0];
      setQueue((items) => items.slice(1));
      return first;
    },
  };
}

export function useCopyOnSelect(): void {}

export function useDeferredHookMessages<T>(messages: T[] = []): T[] {
  return messages;
}

export function useDiffData<T>(data?: T): T | undefined {
  return data;
}

export function useDiffInIDE(): { open: (path: string) => void } {
  return { open: () => undefined };
}

export function useDirectConnect(): { connected: boolean } {
  return { connected: false };
}

export function useDoublePress(callback: () => void, delayMs = 900): () => void {
  const lastPress = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastPress.current <= delayMs) callback();
    lastPress.current = now;
  }, [callback, delayMs]);
}

export function useDynamicConfig<T>(value: T): T {
  return value;
}

export function useElapsedTime(startMs = Date.now()): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, now - startMs);
}

export function useExitOnCtrlCD(): void {}
export function useExitOnCtrlCDWithKeybindings(): void {}
export function useFileHistorySnapshotInit(): void {}
export function useGlobalKeybindings(): void {}

export function useHistorySearch<T extends { text?: string }>(items: T[] = [], query = ""): T[] {
  const needle = query.toLowerCase();
  return items.filter((item) => !needle || (item.text ?? "").toLowerCase().includes(needle));
}

export function useIdeAtMentioned(): boolean {
  return false;
}

export function useIdeConnectionStatus(): { connected: boolean } {
  return { connected: false };
}

export function useIDEIntegration(): { enabled: boolean } {
  return { enabled: false };
}

export function useIdeLogging(): void {}
export function useIdeSelection(): null {
  return null;
}
export function useInboxPoller(): void {}

export function useInputBuffer(initial = ""): {
  value: string;
  setValue: (value: string) => void;
  clear: () => void;
} {
  const [value, setValue] = useState(initial);
  return { value, setValue, clear: () => setValue("") };
}

export function useLogMessages<T>(messages: T[] = []): T[] {
  return messages;
}

export function useMainLoopModel<T>(model: T): T {
  return model;
}

export function useManagePlugins(): { enabled: boolean } {
  return { enabled: true };
}

export function useMergedClients<T>(clients: T[] = []): T[] {
  return clients;
}

export function useMergedCommands<T>(commands: T[] = []): T[] {
  return commands;
}

export function useMergedTools<T>(tools: T[] = []): T[] {
  return tools;
}

export function useMinDisplayTime(visible: boolean, minMs = 300): boolean {
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShown(true);
      return;
    }
    const timer = setTimeout(() => setShown(false), minMs);
    return () => clearTimeout(timer);
  }, [visible, minMs]);
  return shown;
}

export function useNotifyAfterTimeout(enabled: boolean, timeoutMs = 30_000): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    const timer = setTimeout(() => setReady(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [enabled, timeoutMs]);
  return ready;
}

export function usePasteHandler(handler?: (value: string) => void): { paste: (value: string) => void } {
  return { paste: (value) => handler?.(value) };
}

export function usePromptSuggestion(query: string, commands: string[] = [], files: string[] = []): Suggestion[] {
  return useMemo(() => getUnifiedSuggestions({ query, commands, files }), [query, commands, files]);
}

export function useQueueProcessor(): { running: boolean } {
  return { running: false };
}

export function useRemoteSession(): { connected: boolean } {
  return { connected: false };
}

export function useReplBridge(): { ready: boolean } {
  return { ready: true };
}

export function useScheduledTasks<T>(tasks: T[] = []): T[] {
  return tasks;
}

export function useSearchInput(initial = ""): {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
} {
  const [query, setQuery] = useState(initial);
  return { query, setQuery, clear: () => setQuery("") };
}

export function useSessionBackgrounding(): { backgrounded: boolean } {
  return { backgrounded: false };
}

export function useSettings<T>(settings: T): T {
  return settings;
}

export function useSettingsChange(): void {}
export function useSkillsChange(): void {}
export function useSSHSession(): { connected: boolean } {
  return { connected: false };
}
export function useSwarmInitialization(): { initialized: boolean } {
  return { initialized: false };
}
export function useSwarmPermissionPoller(): void {}
export function useTaskListWatcher<T>(tasks: T[] = []): T[] {
  return tasks;
}
export function useTasksV2<T>(tasks: T[] = []): T[] {
  return tasks;
}
export function useTeammateViewAutoExit(): void {}
export function useTeleportResume(): { available: boolean } {
  return { available: false };
}

export function useTextInput(initial = ""): ReturnType<typeof useInputBuffer> {
  return useInputBuffer(initial);
}

export function useTimeout(callback: () => void, timeoutMs: number | null): void {
  useEffect(() => {
    if (timeoutMs === null) return;
    const timer = setTimeout(callback, timeoutMs);
    return () => clearTimeout(timer);
  }, [callback, timeoutMs]);
}

export function useTurnDiffs<T>(diffs: T[] = []): T[] {
  return diffs;
}

export function useTypeahead<T extends Suggestion>(items: T[] = [], query = ""): T[] {
  const needle = query.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().includes(needle));
}

export function useUpdateNotification(): null {
  return null;
}

export function useVimInput(initial = ""): ReturnType<typeof useInputBuffer> & { mode: "insert" } {
  return { ...useInputBuffer(initial), mode: "insert" };
}

export function useVirtualScroll<T>(items: T[], selectedIndex: number, visibleCount: number): T[] {
  const half = Math.floor(Math.max(1, visibleCount) / 2);
  const start = Math.max(0, Math.min(Math.max(0, items.length - visibleCount), selectedIndex - half));
  return items.slice(start, start + visibleCount);
}

export function useVoice(): { recording: boolean } {
  return { recording: false };
}

export function useVoiceEnabled(): boolean {
  return false;
}

export function useVoiceIntegration(): { enabled: boolean } {
  return { enabled: false };
}

export function useFalseNotification(): null {
  return null;
}

export const useChromeExtensionNotification = useFalseNotification;
export const useClaudeCodeHintRecommendation = useFalseNotification;
export const useIssueFlagBanner = useFalseNotification;
export const useLspPluginRecommendation = useFalseNotification;
export const useMailboxBridge = useFalseNotification;
export const useOfficialMarketplaceNotification = useFalseNotification;
export const usePluginRecommendationBase = useFalseNotification;
export const usePromptsFromClaudeInChrome = useFalseNotification;
export const usePrStatus = useFalseNotification;
export const useSkillImprovementSurvey = useFalseNotification;
export const useAntOrgWarningNotification = useFalseNotification;
export const useAutoModeUnavailableNotification = useFalseNotification;
export const useCanSwitchToExistingSubscription = useFalseNotification;
export const useDeprecationWarningNotification = useFalseNotification;
export const useFastModeNotification = useFalseNotification;
export const useIDEStatusIndicator = useFalseNotification;
export const useInstallMessages = useFalseNotification;
export const useLspInitializationNotification = useFalseNotification;
export const useMcpConnectivityStatus = useFalseNotification;
export const useModelMigrationNotifications = useFalseNotification;
export const useNpmDeprecationNotification = useFalseNotification;
export const usePluginAutoupdateNotification = useFalseNotification;
export const usePluginInstallationStatus = useFalseNotification;
export const useRateLimitWarningNotification = useFalseNotification;
export const useSettingsErrors = useFalseNotification;
export const useStartupNotification = useFalseNotification;
export const useTeammateShutdownNotification = useFalseNotification;
