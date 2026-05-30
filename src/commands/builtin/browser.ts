import React from "react";
import fs from "node:fs";
import path from "node:path";
import type { Command } from "../../types/command.js";
import { BrowserSessionRegistry } from "../../bridge/browserSessions.js";
import { BrowserTrajectoryRecorder } from "../../services/browser/browserTrajectory.js";
import { markCustomPermissions } from "../../services/permissions/permissionProfiles.js";
import {
  captureBrowserScreenshot,
  captureBrowserSnapshot,
  clickBrowserSelector,
  typeBrowserSelector,
} from "../../bridge/cdpClient.js";
import { startBrowserSession } from "../../tools/browser.js";
import { safeJoin } from "../../tools/pathSafety.js";
import {
  BrowserPanel,
  browserOperationPanelModel,
  browserSessionsPanelModel,
  browserStatusPanelModel,
  browserTrajectoryPanelModel,
} from "../../components/BrowserPanel.js";

export const browserCommand: Command = {
  name: "browser",
  description: "Turn browser bridge permission on or off, or open a URL.",
  usage: "on|off|open <url>|sessions|trajectory [limit]|snapshot <url>|screenshot <url> <path>|click <url> <selector>|type <url> <selector> <text>",
  async execute(args, context) {
    const mode = args.trim();
    if (mode === "on" || mode === "off") {
      markCustomPermissions(context.permissions).allowBrowser = mode === "on";
      return {
        message: `browser: ${context.permissions.allowBrowser ? "on" : "off"}`,
        display: React.createElement(BrowserPanel, { model: browserStatusPanelModel(context.permissions.allowBrowser) }),
      };
    }
    if (mode === "sessions") {
      const sessions = new BrowserSessionRegistry(context.config.dataDir).list(20);
      if (sessions.length === 0) {
        return {
          message: "No browser sessions.",
          display: React.createElement(BrowserPanel, { model: browserSessionsPanelModel(sessions) }),
        };
      }
      return {
        message: sessions.map((session) => `${session.id} ${session.status} ${session.url}`).join("\n"),
        display: React.createElement(BrowserPanel, { model: browserSessionsPanelModel(sessions) }),
      };
    }
    if (mode === "trajectory" || mode.startsWith("trajectory ")) {
      const limit = Number.parseInt(mode.slice("trajectory".length).trim(), 10);
      const recorder = new BrowserTrajectoryRecorder(context.config.dataDir);
      const resolvedLimit = Number.isFinite(limit) ? limit : 20;
      return {
        message: recorder.render(resolvedLimit),
        display: React.createElement(BrowserPanel, { model: browserTrajectoryPanelModel(recorder.list(resolvedLimit)) }),
      };
    }
    if (mode.startsWith("open ")) {
      if (!context.permissions.allowBrowser) return { message: "Browser is off. Run /browser on first." };
      const url = mode.slice("open ".length).trim();
      const message = recordBrowserCommand(context.config.dataDir, "open", url, () =>
        startBrowserSession(url, true, {
          allowBrowser: context.permissions.allowBrowser,
          dataDir: context.config.dataDir,
        }),
      );
      return {
        message,
        display: React.createElement(BrowserPanel, {
          model: browserOperationPanelModel({
            title: "Browser open",
            subtitle: url,
            name: "open",
            status: "succeeded",
            detail: message,
            footer: "/browser sessions | /browser trajectory",
          }),
        }),
      };
    }
    if (mode.startsWith("snapshot ")) {
      if (!context.permissions.allowBrowser) return { message: "Browser is off. Run /browser on first." };
      const url = mode.slice("snapshot ".length).trim();
      try {
        const snapshot = await captureBrowserSnapshot(url);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "snapshot",
          source: "command",
          url,
          finalUrl: snapshot.url,
          status: "succeeded",
          title: snapshot.title,
          textChars: snapshot.text.length,
          message: `title: ${snapshot.title}`,
        });
        return {
          message: [`title: ${snapshot.title}`, `url: ${snapshot.url}`, snapshot.text.slice(0, 4000)].join("\n"),
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser snapshot",
              subtitle: snapshot.url,
              name: "snapshot",
              status: "succeeded",
              detail: snapshot.title || "(untitled)",
              note: `textChars=${snapshot.text.length}`,
              footer: "/browser trajectory",
              preview: snapshot.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8),
            }),
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "snapshot",
          source: "command",
          url,
          status: "failed",
          message,
        });
        return {
          message,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser snapshot",
              subtitle: url,
              name: "snapshot",
              status: "failed",
              detail: message,
              footer: "/browser trajectory",
              tone: "error",
            }),
          }),
        };
      }
    }
    if (mode.startsWith("screenshot ")) {
      if (!context.permissions.allowBrowser) return { message: "Browser is off. Run /browser on first." };
      const [url, targetPath] = splitTwoArgs(mode.slice("screenshot ".length));
      if (!url || !targetPath) return { message: "Usage: /browser screenshot <url> <path>" };
      try {
        const bytes = await captureBrowserScreenshot(url, false);
        const target = safeJoin(context.config.projectPath, targetPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "screenshot",
          source: "command",
          url,
          path: targetPath,
          status: "succeeded",
          bytes: bytes.length,
          message: `screenshot written: ${targetPath}`,
        });
        return {
          message: `screenshot written: ${targetPath} (${bytes.length} bytes)`,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser screenshot",
              subtitle: url,
              name: targetPath,
              status: "succeeded",
              detail: `${bytes.length} bytes`,
              note: target,
              footer: "/browser trajectory",
            }),
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "screenshot",
          source: "command",
          url,
          path: targetPath,
          status: "failed",
          message,
        });
        return {
          message,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser screenshot",
              subtitle: url,
              name: targetPath,
              status: "failed",
              detail: message,
              footer: "/browser trajectory",
              tone: "error",
            }),
          }),
        };
      }
    }
    if (mode.startsWith("click ")) {
      if (!context.permissions.allowBrowser) return { message: "Browser is off. Run /browser on first." };
      const [url, selector] = splitTwoArgs(mode.slice("click ".length));
      if (!url || !selector) return { message: "Usage: /browser click <url> <selector>" };
      try {
        const status = await clickBrowserSelector(url, selector);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "click",
          source: "command",
          url,
          selector,
          status: status === "clicked" ? "succeeded" : "failed",
          message: status,
        });
        return {
          message: status,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser click",
              subtitle: url,
              name: selector,
              status: status === "clicked" ? "succeeded" : "failed",
              detail: status,
              footer: "/browser trajectory",
              tone: status === "clicked" ? "success" : "error",
            }),
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "click",
          source: "command",
          url,
          selector,
          status: "failed",
          message,
        });
        return {
          message,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser click",
              subtitle: url,
              name: selector,
              status: "failed",
              detail: message,
              footer: "/browser trajectory",
              tone: "error",
            }),
          }),
        };
      }
    }
    if (mode.startsWith("type ")) {
      if (!context.permissions.allowBrowser) return { message: "Browser is off. Run /browser on first." };
      const [url, selector, text] = splitThreeArgs(mode.slice("type ".length));
      if (!url || !selector) return { message: "Usage: /browser type <url> <selector> <text>" };
      try {
        const status = await typeBrowserSelector(url, selector, text ?? "");
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "type",
          source: "command",
          url,
          selector,
          status: status === "typed" ? "succeeded" : "failed",
          message: `${status}; textChars=${(text ?? "").length}`,
        });
        return {
          message: status,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser type",
              subtitle: url,
              name: selector,
              status: status === "typed" ? "succeeded" : "failed",
              detail: status,
              note: `textChars=${(text ?? "").length}`,
              footer: "/browser trajectory",
              tone: status === "typed" ? "success" : "error",
            }),
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new BrowserTrajectoryRecorder(context.config.dataDir).record({
          action: "type",
          source: "command",
          url,
          selector,
          status: "failed",
          message: `${message}; textChars=${(text ?? "").length}`,
        });
        return {
          message,
          display: React.createElement(BrowserPanel, {
            model: browserOperationPanelModel({
              title: "Browser type",
              subtitle: url,
              name: selector,
              status: "failed",
              detail: message,
              note: `textChars=${(text ?? "").length}`,
              footer: "/browser trajectory",
              tone: "error",
            }),
          }),
        };
      }
    }
    return {
      message: `browser: ${context.permissions.allowBrowser ? "on" : "off"}`,
      display: React.createElement(BrowserPanel, { model: browserStatusPanelModel(context.permissions.allowBrowser) }),
    };
  },
};

function recordBrowserCommand(
  dataDir: string,
  action: "open",
  url: string,
  run: () => string,
): string {
  try {
    const message = run();
    new BrowserTrajectoryRecorder(dataDir).record({
      action,
      source: "command",
      url,
      status: "succeeded",
      message,
    });
    return message;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    new BrowserTrajectoryRecorder(dataDir).record({
      action,
      source: "command",
      url,
      status: "failed",
      message,
    });
    return message;
  }
}

function splitTwoArgs(input: string): [string, string] {
  const [first = "", ...rest] = input.trim().split(/\s+/);
  return [first, rest.join(" ")];
}

function splitThreeArgs(input: string): [string, string, string] {
  const [first = "", second = "", ...rest] = input.trim().split(/\s+/);
  return [first, second, rest.join(" ")];
}
