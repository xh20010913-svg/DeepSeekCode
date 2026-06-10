import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Command } from "../../types/command.js";

export const gitCommand: Command = {
  name: "git",
  description: "Diagnose local git, remotes, and proxy settings.",
  usage: "doctor",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed !== "doctor") return { message: "Usage: /git doctor" };
    const repoRoot = findGitRoot(process.cwd()) ?? findGitRoot(context.config.projectPath);
    if (!repoRoot) {
      return {
        message: [
          "Git doctor",
          "当前目录和项目目录都没有找到 .git。",
          "请在 DeepSeekCode 源码仓库里运行，或进入 .release 后执行 git 命令。",
        ].join("\n"),
      };
    }
    const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
    const remote = git(repoRoot, ["remote", "get-url", "origin"]) || "origin not configured";
    const status = git(repoRoot, ["status", "--short"]) || "working tree clean";
    const httpProxy = git(repoRoot, ["config", "--get", "http.proxy"]) || "(not set)";
    const httpsProxy = git(repoRoot, ["config", "--get", "https.proxy"]) || "(not set)";
    const upstream = git(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "(no upstream)";
    return {
      message: [
        "Git doctor",
        `repo: ${repoRoot}`,
        `branch: ${branch}`,
        `upstream: ${upstream}`,
        `origin: ${remote}`,
        `http.proxy: ${httpProxy}`,
        `https.proxy: ${httpsProxy}`,
        "",
        "本机 push 推荐命令:",
        "git config http.proxy http://127.0.0.1:7897",
        "git config https.proxy http://127.0.0.1:7897",
        "git push origin HEAD",
        "",
        "status:",
        status,
      ].join("\n"),
    };
  },
};

function findGitRoot(startPath: string): string | undefined {
  let current = path.resolve(startPath);
  if (!fs.existsSync(current)) return undefined;
  if (!fs.statSync(current).isDirectory()) current = path.dirname(current);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}
