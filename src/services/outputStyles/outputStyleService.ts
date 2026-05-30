import fs from "node:fs";
import path from "node:path";
import {
  BUILTIN_OUTPUT_STYLES,
  normalizeOutputStyleName,
  parseOutputStyleDocument,
  renderOutputStyleDocument,
  type OutputStyle,
} from "../../outputStyles/index.js";
import { pluginExtensionDirs } from "../../plugins/extensions.js";

export interface OutputStyleValidationResult {
  name: string;
  path: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export class OutputStyleService {
  constructor(
    private readonly projectPath: string,
    private readonly dataDir: string,
  ) {}

  list(): OutputStyle[] {
    return [
      ...BUILTIN_OUTPUT_STYLES,
      ...this.discoverCustomStyles(),
    ].sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
  }

  load(name: string): OutputStyle | null {
    const normalized = normalizeOutputStyleName(name);
    return this.list().find((style) => style.name === normalized) ?? null;
  }

  current(): OutputStyle {
    const selected = process.env.DEEPSEEKCODE_OUTPUT_STYLE?.trim() || this.readSelectedStyle();
    return this.load(selected || "deepseek") ?? BUILTIN_OUTPUT_STYLES[0]!;
  }

  setCurrent(name: string): OutputStyle {
    const style = this.load(name);
    if (!style) throw new Error(`output style not found: ${name}`);
    const settingsPath = this.settingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify({ active: style.name }, null, 2)}\n`, "utf8");
    return style;
  }

  createProjectStyle(input: {
    name: string;
    description: string;
    prompt?: string;
    overwrite?: boolean;
  }): OutputStyle {
    const name = normalizeOutputStyleName(input.name);
    if (!name) throw new Error("output style name is empty");
    const description = input.description.trim();
    if (!description) throw new Error("output style description is empty");
    const stylePath = path.join(this.projectPath, ".deepseekcode", "output-styles", `${name}.md`);
    if (fs.existsSync(stylePath) && !input.overwrite) throw new Error(`output style already exists: ${name}`);
    fs.mkdirSync(path.dirname(stylePath), { recursive: true });
    fs.writeFileSync(stylePath, renderOutputStyleDocument({
      name,
      description,
      prompt: input.prompt,
    }), "utf8");
    const style = this.load(name);
    if (!style) throw new Error(`failed to load created output style: ${name}`);
    return style;
  }

  validate(name?: string): OutputStyleValidationResult[] {
    const styles = name
      ? this.list().filter((style) => style.name === normalizeOutputStyleName(name))
      : this.list();
    if (name && styles.length === 0) {
      return [{
        name,
        path: "",
        ok: false,
        errors: [`output style not found: ${name}`],
        warnings: [],
      }];
    }
    return styles.map((style) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (normalizeOutputStyleName(style.name) !== style.name) errors.push(`style name '${style.name}' is not normalized`);
      if (!style.description.trim()) warnings.push("missing description");
      if (!style.prompt.trim()) errors.push("empty output style prompt");
      return {
        name: style.name,
        path: style.path ?? "(builtin)",
        ok: errors.length === 0,
        errors,
        warnings,
      };
    });
  }

  private discoverCustomStyles(): OutputStyle[] {
    const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
    const roots: Array<{ scope: OutputStyle["scope"]; dir: string }> = [
      { scope: "project", dir: path.join(this.projectPath, ".deepseekcode", "output-styles") },
      { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "output-styles") : "" },
      { scope: "cache", dir: path.join(this.dataDir, "cache", "output-styles") },
    ];
    const styles: OutputStyle[] = [];
    for (const root of roots) {
      if (!root.dir || !fs.existsSync(root.dir)) continue;
      for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
        const stylePath = path.join(root.dir, entry.name);
        const name = normalizeOutputStyleName(path.basename(entry.name, ".md"));
        const parsed = parseOutputStyleDocument(fs.readFileSync(stylePath, "utf8"));
        styles.push({
          name,
          scope: root.scope,
          description: parsed.description ?? firstUsefulLine(parsed.prompt),
          prompt: parsed.prompt,
          path: stylePath,
        });
      }
    }
    for (const root of pluginExtensionDirs(this.projectPath, this.dataDir, "output_styles")) {
      for (const entry of fs.readdirSync(root.path, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
        const stylePath = path.join(root.path, entry.name);
        const name = `${root.plugin.name}:${normalizeOutputStyleName(path.basename(entry.name, ".md"))}`;
        const parsed = parseOutputStyleDocument(fs.readFileSync(stylePath, "utf8"));
        styles.push({
          name,
          scope: "plugin",
          description: parsed.description ?? firstUsefulLine(parsed.prompt),
          prompt: parsed.prompt,
          path: stylePath,
        });
      }
    }
    return styles;
  }

  private readSelectedStyle(): string {
    const settingsPath = this.settingsPath();
    if (!fs.existsSync(settingsPath)) return "";
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { active?: string };
      return parsed.active ?? "";
    } catch {
      return "";
    }
  }

  private settingsPath(): string {
    return path.join(this.projectPath, ".deepseekcode", "output-style.json");
  }
}

function firstUsefulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line && !line.startsWith("---")) ?? ""
  );
}
