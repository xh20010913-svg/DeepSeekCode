import type { ChatMessage } from "../../protocol/provider.js";
import {
  buildContextCapsuleFromMessages,
  formatContextCapsule,
  mergeContextCapsules,
  parseContextCapsule,
} from "./contextCapsule.js";

export class RollingSummary {
  private summary = "";

  get text(): string {
    return this.summary;
  }

  reset(summary = ""): void {
    this.summary = summary.trim();
  }

  absorb(history: ChatMessage[], keepTail = 10): ChatMessage[] {
    if (history.length <= keepTail + 2) return history;
    const keepFrom = Math.max(0, history.length - keepTail);
    const older = history.slice(0, keepFrom);
    const tail = history.slice(keepFrom);
    const previous = this.summary.trim()
      ? parseContextCapsule(this.summary)
      : buildContextCapsuleFromMessages([]);
    const next = buildContextCapsuleFromMessages(older);
    this.summary = formatContextCapsule(mergeContextCapsules(previous, next));
    return tail;
  }
}
