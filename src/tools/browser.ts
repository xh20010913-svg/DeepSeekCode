import { spawn } from "node:child_process";
import { BrowserSessionRegistry } from "../bridge/browserSessions.js";

export interface BrowserPolicy {
  allowBrowser: boolean;
  dataDir?: string;
}

export function startBrowserSession(url: string, visible: boolean, policy: BrowserPolicy): string {
  if (!policy.allowBrowser) {
    throw new Error("browser tools are disabled; enable them with /browser on");
  }
  const parsed = new URL(url);
  if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
    throw new Error(`unsupported browser URL protocol: ${parsed.protocol}`);
  }
  if (!visible) {
    const record = recordSession(url, visible, "declared", policy.dataDir);
    return `${record.id} declared for ${url} (headless bridge is planned).`;
  }
  openExternal(url);
  const record = recordSession(url, visible, "opened", policy.dataDir);
  return `${record.id} opened for ${url}. Snapshot/click/type tools are planned behind the same permission.`;
}

function recordSession(
  url: string,
  visible: boolean,
  status: "declared" | "opened",
  dataDir?: string,
): { id: string } {
  if (!dataDir) return { id: "browser_session" };
  return new BrowserSessionRegistry(dataDir).create({ url, visible, status });
}

function openExternal(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}
