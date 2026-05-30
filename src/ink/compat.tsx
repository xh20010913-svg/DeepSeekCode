import React, { createContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Text,
  render,
  useApp,
  useInput,
  useStdin,
  useStdout,
} from "ink";
import { cellWidth } from "../prompt/promptViewport.js";

export { Box, Text, render, useApp, useInput, useStdin, useStdout };

export type InkNode = React.ReactNode;
export type Key = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  backspace?: boolean;
  delete?: boolean;
};

export interface Size {
  width: number;
  height: number;
}

export const ESC = "\x1b";
export const CSI = `${ESC}[`;
export const cursorHide = `${CSI}?25l`;
export const cursorShow = `${CSI}?25h`;
export const clearScreen = `${CSI}2J${CSI}H`;
export const instances = new Set<unknown>();
export const styles = {};
export const lineWidthCache = new Map<string, number>();

export const AppContext = createContext({ exit: () => undefined });
export const StdinContext = createContext<NodeJS.ReadStream | undefined>(undefined);
export const TerminalFocusContext = createContext(true);
export const TerminalSizeContext = createContext<Size>({ width: 80, height: 24 });
export const CursorDeclarationContext = createContext({ visible: true });
export const ClockContext = createContext(Date.now());

export default function InkCompat(props: { children?: React.ReactNode }): React.ReactElement {
  return <>{props.children}</>;
}

export function App(props: { children?: React.ReactNode }): React.ReactElement {
  return <>{props.children}</>;
}

export function AlternateScreen(props: { children?: React.ReactNode }): React.ReactElement {
  return <>{props.children}</>;
}

export function Button(props: { children?: React.ReactNode; label?: string }): React.ReactElement {
  return <Text>{props.children ?? props.label ?? ""}</Text>;
}

export function Link(props: { children?: React.ReactNode; url?: string }): React.ReactElement {
  return <Text>{props.children ?? props.url ?? ""}</Text>;
}

export function Newline(props: { count?: number } = {}): React.ReactElement {
  return <Text>{Array.from({ length: Math.max(1, props.count ?? 1) }, () => "\n").join("")}</Text>;
}

export function Spacer(): React.ReactElement {
  return <Text> </Text>;
}

export function RawAnsi(props: { children?: React.ReactNode }): React.ReactElement {
  return <Text>{String(props.children ?? "")}</Text>;
}

export function NoSelect(props: { children?: React.ReactNode }): React.ReactElement {
  return <>{props.children}</>;
}

export function ScrollBox(props: { children?: React.ReactNode }): React.ReactElement {
  return <Box flexDirection="column">{props.children}</Box>;
}

export function ErrorOverview(props: { error?: unknown }): React.ReactElement {
  return <Text color="red">{props.error instanceof Error ? props.error.message : String(props.error ?? "")}</Text>;
}

export function useInterval(callback: () => void, delay: number | null): void {
  useEffect(() => {
    if (delay === null) return;
    const timer = setInterval(callback, delay);
    return () => clearInterval(timer);
  }, [callback, delay]);
}

export function useAnimationFrame(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(callback, 16);
    return () => clearInterval(timer);
  }, [callback, enabled]);
}

export function useDeclaredCursor(visible = true): { visible: boolean } {
  return useMemo(() => ({ visible }), [visible]);
}

export function useSelection(): null {
  return null;
}

export function useSearchHighlight(query = ""): { query: string } {
  return { query };
}

export function useTabStatus(): { active: boolean } {
  return { active: true };
}

export function useTerminalFocus(): boolean {
  return true;
}

export function useTerminalTitle(title?: string): void {
  useEffect(() => {
    if (!title || !process.stdout.isTTY) return;
    process.stdout.write(`\x1b]0;${title}\x07`);
  }, [title]);
}

export function useTerminalViewport(): Size {
  const { stdout } = useStdout();
  return {
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24,
  };
}

export function useTerminalNotification(message?: string): void {
  useEffect(() => {
    if (message && process.stdout.isTTY) process.stdout.write("\x07");
  }, [message]);
}

export function stringWidth(value: string): number {
  return cellWidth(stripAnsi(value));
}

export function widestLine(value: string): number {
  return value.split(/\r?\n/).reduce((max, line) => Math.max(max, stringWidth(line)), 0);
}

export function measureText(value: string): Size {
  const lines = value.split(/\r?\n/);
  return { width: widestLine(value), height: Math.max(1, lines.length) };
}

export function measureElement(value: React.ReactNode): Size {
  return measureText(typeof value === "string" ? value : "");
}

export function getMaxWidth(values: string[]): number {
  return values.reduce((max, value) => Math.max(max, stringWidth(value)), 0);
}

export function wrapText(value: string, width: number): string {
  return value.split(/\r?\n/).map((line) => wrapLine(line, width)).join("\n");
}

export function wrapAnsi(value: string, width = 80): string {
  return wrapText(value, width);
}

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

export function colorize(value: string): string {
  return value;
}

export function clearTerminal(): string {
  return clearScreen;
}

export function warn(message: string): void {
  process.emitWarning(message);
}

export function supportsHyperlinks(): boolean {
  return process.env.DEEPSEEKCODE_OSC8_LINKS === "1";
}

export function parseKeypress(input: string): { input: string; key: Key } {
  return {
    input,
    key: {
      sequence: input,
      name: keyName(input),
      ctrl: input.length === 1 && input.charCodeAt(0) > 0 && input.charCodeAt(0) < 27,
      backspace: input === "\b" || input === "\x7f",
      delete: input === "\x1b[3~",
    },
  };
}

export class TerminalEvent {
  constructor(public readonly type: string) {}
}

export class InputEvent extends TerminalEvent {
  constructor(public readonly input: string, public readonly key: Key = {}) {
    super("input");
  }
}

export class KeyboardEvent extends InputEvent {}
export class ClickEvent extends TerminalEvent {}
export class FocusEvent extends TerminalEvent {}
export class ResizeEvent extends TerminalEvent {}
export class PasteEvent extends InputEvent {}
export class TerminalFocusEvent extends TerminalEvent {}

export class EventEmitter<T = unknown> {
  private readonly listeners = new Set<(event: T) => void>();

  emit(event: T): void {
    for (const listener of this.listeners) listener(event);
  }

  on(listener: (event: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class EventDispatcher<T = unknown> extends EventEmitter<T> {}

export function createEventHandlers<T>(emit: (event: T) => void): { emit: (event: T) => void } {
  return { emit };
}

export class Output {
  frames: string[] = [];

  write(value: string): void {
    this.frames.push(value);
  }

  lastFrame(): string {
    return this.frames.at(-1) ?? "";
  }
}

export class Screen {
  output = new Output();

  render(value: string): void {
    this.output.write(value);
  }
}

export class Terminal {
  size(): Size {
    return {
      width: process.stdout.columns ?? 80,
      height: process.stdout.rows ?? 24,
    };
  }
}

export class TerminalQuerier {
  query(): Promise<null> {
    return Promise.resolve(null);
  }
}

export class TerminalFocusState {
  focused = true;
}

export function renderBorder(width: number): string {
  return "-".repeat(Math.max(0, width));
}

export function renderNodeToOutput(node: React.ReactNode): string {
  return typeof node === "string" ? node : "";
}

export function renderToScreen(value: string): string {
  return value;
}

export function createRenderer(): typeof render {
  return render;
}

export const reconciler = {};
export const root = render;
export const renderer = createRenderer;

export function squashTextNodes<T>(value: T): T {
  return value;
}

export function optimize<T>(value: T): T {
  return value;
}

export function frame(value: string): string {
  return value;
}

export function bidi(value: string): string {
  return value;
}

export function searchHighlight(value: string, query: string): string {
  if (!query) return value;
  return value.replaceAll(query, `[${query}]`);
}

export function getTabStops(width: number, tabWidth = 8): number[] {
  const stops: number[] = [];
  for (let cell = tabWidth; cell <= width; cell += tabWidth) stops.push(cell);
  return stops;
}

export function hitTest(): null {
  return null;
}

export function focus(): void {}
export function dom(): null {
  return null;
}

export interface LayoutNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createLayoutNode(node: Partial<LayoutNode> = {}): LayoutNode {
  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

export const yoga = { createNode: createLayoutNode };
export const layoutEngine = { createNode: createLayoutNode };

export const ansi = { ESC, CSI };
export const csi = { CSI };
export const dec = {};
export const esc = { ESC };
export const osc = {};
export const sgr = {};
export type TermioToken = { type: string; value: string };

export function tokenize(value: string): TermioToken[] {
  return [{ type: "text", value }];
}

export function parseTermio(value: string): TermioToken[] {
  return tokenize(value);
}

export function terminal(): Terminal {
  return new Terminal();
}

export function termio(value: string): TermioToken[] {
  return tokenize(value);
}

function keyName(input: string): string | undefined {
  if (input === "\r" || input === "\n") return "return";
  if (input === "\b" || input === "\x7f") return "backspace";
  if (input === "\x1b[3~") return "delete";
  if (input === "\x1b[A") return "up";
  if (input === "\x1b[B") return "down";
  if (input === "\x1b[C") return "right";
  if (input === "\x1b[D") return "left";
  return undefined;
}

function wrapLine(line: string, width: number): string {
  const max = Math.max(1, width);
  let current = "";
  const output: string[] = [];
  for (const char of line) {
    if (stringWidth(current + char) > max) {
      output.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  output.push(current);
  return output.join("\n");
}
