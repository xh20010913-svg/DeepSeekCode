import type { ChatMessage } from "../../protocol/provider.js";
import type { TranscriptRecord } from "../session/sessionStorage.js";

export interface ContextCapsule {
  userGoals: string[];
  completedFacts: string[];
  blockers: string[];
  keyArtifacts: string[];
  nextSteps: string[];
  recentToolSummaries: string[];
}

export interface ContextCapsuleOptions {
  maxItemsPerSection?: number;
  maxItemChars?: number;
}

const DEFAULT_MAX_ITEMS = 6;
const DEFAULT_MAX_ITEM_CHARS = 220;

export function buildContextCapsuleFromRecords(
  records: TranscriptRecord[],
  options: ContextCapsuleOptions = {},
): ContextCapsule {
  return buildCapsule(records.map((record) => ({ role: record.role, text: record.text })), options);
}

export function buildContextCapsuleFromMessages(
  messages: ChatMessage[],
  options: ContextCapsuleOptions = {},
): ContextCapsule {
  return buildCapsule(messages.map((message) => ({ role: message.role, text: message.content })), options);
}

export function mergeContextCapsules(left: ContextCapsule, right: ContextCapsule, maxItems = DEFAULT_MAX_ITEMS): ContextCapsule {
  return {
    userGoals: uniqueTail([...left.userGoals, ...right.userGoals], maxItems),
    completedFacts: uniqueTail([...left.completedFacts, ...right.completedFacts], maxItems),
    blockers: uniqueTail([...left.blockers, ...right.blockers], maxItems),
    keyArtifacts: uniqueTail([...left.keyArtifacts, ...right.keyArtifacts], maxItems),
    nextSteps: uniqueTail([...left.nextSteps, ...right.nextSteps], maxItems),
    recentToolSummaries: uniqueTail([...left.recentToolSummaries, ...right.recentToolSummaries], 3),
  };
}

export function parseContextCapsule(text: string): ContextCapsule {
  const capsule = emptyCapsule();
  const sectionMap: Array<[RegExp, keyof ContextCapsule]> = [
    [/\u7528\u6237\u76ee\u6807|user goals/i, "userGoals"],
    [/\u5df2\u5b8c\u6210\u4e8b\u5b9e|completed facts/i, "completedFacts"],
    [/\u672a\u5b8c\u6210|\u963b\u585e|blockers|remaining/i, "blockers"],
    [/\u5173\u952e\u6587\u4ef6|\u4ea7\u7269|artifacts/i, "keyArtifacts"],
    [/\u4e0b\u4e00\u6b65|next steps/i, "nextSteps"],
    [/\u6700\u8fd1\u5de5\u5177\u6458\u8981|\u5de5\u5177\u6458\u8981|tool summaries/i, "recentToolSummaries"],
  ];
  const headerPattern = /^#+|^[-*]?\s*(\u7528\u6237\u76ee\u6807|\u5df2\u5b8c\u6210\u4e8b\u5b9e|\u672a\u5b8c\u6210|\u963b\u585e|\u5173\u952e\u6587\u4ef6|\u4ea7\u7269|\u4e0b\u4e00\u6b65|\u6700\u8fd1\u5de5\u5177\u6458\u8981|\u5de5\u5177\u6458\u8981|user goals|completed|blockers|remaining|artifacts|next steps|tool summaries)/i;
  let current: keyof ContextCapsule | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matched = sectionMap.find(([pattern]) => pattern.test(trimmed.replace(/^#+\s*/, "")));
    if (matched && headerPattern.test(trimmed)) {
      current = matched[1];
      continue;
    }
    if (!current) continue;
    const item = trimmed.replace(/^[-*]\s*/, "");
    if (item && !/^\(none\)|^\u6682\u65e0/i.test(item)) capsule[current].push(item);
  }
  return trimCapsule(capsule, DEFAULT_MAX_ITEMS);
}

export function formatContextCapsule(capsule: ContextCapsule): string {
  return [
    "context_capsule v2",
    "\u7528\u6237\u76ee\u6807:",
    ...formatSection(capsule.userGoals),
    "\u5df2\u5b8c\u6210\u4e8b\u5b9e:",
    ...formatSection(capsule.completedFacts),
    "\u672a\u5b8c\u6210/\u963b\u585e:",
    ...formatSection(capsule.blockers),
    "\u5173\u952e\u6587\u4ef6\u548c\u4ea7\u7269:",
    ...formatSection(capsule.keyArtifacts),
    "\u4e0b\u4e00\u6b65\u5efa\u8bae:",
    ...formatSection(capsule.nextSteps),
    "\u6700\u8fd1\u5de5\u5177\u6458\u8981:",
    ...formatSection(capsule.recentToolSummaries),
  ].join("\n");
}

function buildCapsule(
  records: Array<{ role: string; text: string }>,
  options: ContextCapsuleOptions,
): ContextCapsule {
  const maxItems = options.maxItemsPerSection ?? DEFAULT_MAX_ITEMS;
  const maxChars = options.maxItemChars ?? DEFAULT_MAX_ITEM_CHARS;
  const capsule = emptyCapsule();
  for (const record of records) {
    addRecordToCapsule(capsule, record.role, record.text, maxChars);
  }
  return trimCapsule(capsule, maxItems);
}

function emptyCapsule(): ContextCapsule {
  return {
    userGoals: [],
    completedFacts: [],
    blockers: [],
    keyArtifacts: [],
    nextSteps: [],
    recentToolSummaries: [],
  };
}

function addRecordToCapsule(capsule: ContextCapsule, role: string, text: string, maxChars: number): void {
  const normalized = oneLine(text);
  if (!normalized) return;
  const clipped = compact(normalized, maxChars);
  if (role === "user") capsule.userGoals.push(clipped);
  if (role === "tool") capsule.recentToolSummaries.push(clipped);
  if (isCompletionText(normalized)) capsule.completedFacts.push(clipped);
  if (isFailureText(normalized)) capsule.blockers.push(clipped);
  if (isNextStepText(normalized)) capsule.nextSteps.push(clipped);
  for (const artifact of artifactMentions(normalized)) {
    capsule.keyArtifacts.push(compact(artifact, maxChars));
  }
}

function trimCapsule(capsule: ContextCapsule, maxItems: number): ContextCapsule {
  return {
    userGoals: uniqueTail(capsule.userGoals, maxItems),
    completedFacts: uniqueTail(capsule.completedFacts, maxItems),
    blockers: uniqueTail(capsule.blockers, maxItems),
    keyArtifacts: uniqueTail(capsule.keyArtifacts, maxItems),
    nextSteps: uniqueTail(capsule.nextSteps, maxItems),
    recentToolSummaries: uniqueTail(capsule.recentToolSummaries, 3),
  };
}

function isCompletionText(text: string): boolean {
  return /\u5b8c\u6210|\u6210\u529f|\u901a\u8fc7|\u5df2\u751f\u6210|\u5df2\u521b\u5efa|\u5df2\u4fee\u590d|validated|succeeded|passed|created|generated|fixed/i.test(text);
}

function isFailureText(text: string): boolean {
  return /\u5931\u8d25|\u9519\u8bef|\u5f02\u5e38|\u672a\u901a\u8fc7|\u963b\u585e|\u7f3a\u5c11|\u65e0\u6cd5|\u62a5\u9519|failed|error|exception|traceback|stderr|blocked|missing/i.test(text);
}

function isNextStepText(text: string): boolean {
  return /\u7ee7\u7eed|\u4e0b\u4e00\u6b65|\u5f85\u529e|\u5269\u4f59|\u9700\u8981|\u4fee\u590d|\u5b8c\u5584|remaining|continue|todo|next|repair|follow[- ]?up/i.test(text);
}

function artifactMentions(text: string): string[] {
  const matches = text.match(/\b[\w.@:/\\-]+\.(?:ts|tsx|js|mjs|json|md|html|docx|pptx|xlsx|pdf|py|css|png|jpg|jpeg|svg|csv|db)\b/gi) ?? [];
  return matches.map((value) => value.replace(/\\/g, "/"));
}

function formatSection(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- \u6682\u65e0"];
}

function uniqueTail(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.slice().reverse()) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out.reverse();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compact(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 18)).trimEnd()} ... [truncated]`;
}
