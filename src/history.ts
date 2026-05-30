export class InputHistory {
  private readonly entries: string[] = [];
  private index: number | null = null;
  private draft = "";

  constructor(private readonly limit = 100) {}

  add(input: string): void {
    const value = input.trim();
    if (!value || value.startsWith("/")) return;
    if (this.entries.at(-1) === value) return;
    this.entries.push(value);
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = null;
    this.draft = "";
  }

  previous(currentDraft: string): string | null {
    if (this.entries.length === 0) return null;
    if (this.index === null) {
      this.draft = currentDraft;
      this.index = this.entries.length - 1;
    } else {
      this.index = Math.max(0, this.index - 1);
    }
    return this.entries[this.index] ?? null;
  }

  next(): string | null {
    if (this.index === null) return null;
    this.index += 1;
    if (this.index >= this.entries.length) {
      this.index = null;
      return this.draft;
    }
    return this.entries[this.index] ?? null;
  }

  snapshot(options: { newestFirst?: boolean } = {}): string[] {
    const values = [...this.entries];
    return options.newestFirst ? values.reverse() : values;
  }
}
