import fs from "node:fs";
import { fileURLToPath } from "node:url";

export interface VersionInfo {
  name: string;
  version: string;
  buildTime?: string;
}

export function readVersionInfo(): VersionInfo {
  const packagePath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const fallback = {
    name: "deepseekcode",
    version: process.env.npm_package_version ?? "0.0.0",
  };
  if (!fs.existsSync(packagePath)) return fallback;
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string; version?: string };
    return {
      name: pkg.name ?? fallback.name,
      version: pkg.version ?? fallback.version,
      buildTime: process.env.DEEPSEEKCODE_BUILD_TIME,
    };
  } catch {
    return fallback;
  }
}

export function formatVersion(info: VersionInfo): string {
  return info.buildTime
    ? `${info.name} ${info.version} (built ${info.buildTime})`
    : `${info.name} ${info.version}`;
}
