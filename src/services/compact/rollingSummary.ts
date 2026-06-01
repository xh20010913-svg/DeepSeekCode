import type { ChatMessage } from "../../protocol/provider.js";

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
    const fragment = older
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")
      .slice(-2400);
    this.summary = [this.summary, fragment].filter(Boolean).join("\n").slice(-3600);
    return tail;
  }
}
