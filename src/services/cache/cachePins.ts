import fs from "node:fs";
import path from "node:path";

export interface CachePin {
  name: string;
  path: string;
  content: string;
  chars: number;
}

export class CachePinService {
  private readonly dir: string;

  constructor(private readonly projectPath: string) {
    this.dir = path.join(projectPath, ".deepseekcode", "cache-pins");
  }

  list(): CachePin[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => this.load(entry.name.slice(0, -".md".length)))
      .filter((pin): pin is CachePin => Boolean(pin))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  load(name: string): CachePin | undefined {
    const normalized = normalizeCachePinName(name);
    if (!normalized) return undefined;
    const pinPath = this.pinPath(normalized);
    if (!fs.existsSync(pinPath)) return undefined;
    const content = fs.readFileSync(pinPath, "utf8");
    return {
      name: normalized,
      path: pinPath,
      content,
      chars: content.length,
    };
  }

  create(name: string, content: string): CachePin {
    const normalized = normalizeCachePinName(name);
    if (!normalized) throw new Error("cache pin name must use letters, numbers, dot, underscore, or dash");
    const body = content.trim();
    if (!body) throw new Error("cache pin content is empty");
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.pinPath(normalized), `${body}\n`, "utf8");
    return this.load(normalized)!;
  }

  remove(name: string): boolean {
    const normalized = normalizeCachePinName(name);
    if (!normalized) return false;
    const pinPath = this.pinPath(normalized);
    if (!fs.existsSync(pinPath)) return false;
    fs.unlinkSync(pinPath);
    return true;
  }

  path(name?: string): string {
    const normalized = name ? normalizeCachePinName(name) : undefined;
    return normalized ? this.pinPath(normalized) : this.dir;
  }

  promptBlocks(): Array<{ title: string; body: string; priority: "sticky" }> {
    return this.list().map((pin) => ({
      title: `cache_pin_${pin.name}`,
      body: pin.content,
      priority: "sticky",
    }));
  }

  private pinPath(name: string): string {
    return path.join(this.dir, `${name}.md`);
  }
}

export function normalizeCachePinName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}
