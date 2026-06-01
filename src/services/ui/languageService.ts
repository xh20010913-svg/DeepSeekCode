import fs from "node:fs";
import path from "node:path";

export type UiLanguage = "zh-CN" | "en";

export const DEFAULT_UI_LANGUAGE: UiLanguage = "zh-CN";

export interface UiLanguageSettings {
  language: UiLanguage;
  source: "env" | "project" | "default";
  path: string;
}

interface UiLanguageSettingsDocument {
  language?: string;
}

export class UiLanguageService {
  constructor(private readonly projectPath: string) {}

  current(): UiLanguageSettings {
    const envLanguage = normalizeUiLanguage(process.env.DEEPSEEKCODE_LANGUAGE ?? process.env.DEEPSEEKCODE_LANG);
    if (envLanguage) return this.settings(envLanguage, "env");

    const projectLanguage = this.readProjectLanguage();
    if (projectLanguage) return this.settings(projectLanguage, "project");

    return this.settings(DEFAULT_UI_LANGUAGE, "default");
  }

  set(language: string): UiLanguageSettings {
    const normalized = normalizeUiLanguage(language);
    if (!normalized) throw new Error(`Unknown language: ${language}`);
    fs.mkdirSync(path.dirname(this.path()), { recursive: true });
    fs.writeFileSync(this.path(), `${JSON.stringify({ language: normalized }, null, 2)}\n`, "utf8");
    process.env.DEEPSEEKCODE_LANGUAGE = normalized;
    return this.settings(normalized, "project");
  }

  reset(): UiLanguageSettings {
    if (fs.existsSync(this.path())) fs.rmSync(this.path(), { force: true });
    delete process.env.DEEPSEEKCODE_LANGUAGE;
    delete process.env.DEEPSEEKCODE_LANG;
    return this.settings(DEFAULT_UI_LANGUAGE, "default");
  }

  path(): string {
    return path.join(this.projectPath, ".deepseekcode", "ui.json");
  }

  private settings(language: UiLanguage, source: UiLanguageSettings["source"]): UiLanguageSettings {
    return {
      language,
      source,
      path: this.path(),
    };
  }

  private readProjectLanguage(): UiLanguage | null {
    if (!fs.existsSync(this.path())) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.path(), "utf8")) as UiLanguageSettingsDocument;
      return normalizeUiLanguage(parsed.language);
    } catch {
      return null;
    }
  }
}

export function normalizeUiLanguage(value: string | undefined): UiLanguage | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (["zh", "zh-cn", "cn", "chinese", "中文"].includes(normalized)) return "zh-CN";
  if (["en", "en-us", "english"].includes(normalized)) return "en";
  return null;
}

export function isChineseUi(language: UiLanguage | string | undefined): boolean {
  return (normalizeUiLanguage(language) ?? DEFAULT_UI_LANGUAGE) === "zh-CN";
}
