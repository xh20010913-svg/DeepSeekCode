import fs from "node:fs";
import path from "node:path";
import type { SshProfile } from "./sshProfileService.js";
import {
  quoteForRemoteShell,
  runSshCommand,
  summarizeSshCommand,
  type SshCommandOutput,
  type SshExecutionPolicy,
} from "./sshRemoteExecutor.js";
import { safeJoin } from "../../tools/pathSafety.js";

export interface RemoteTextFileResult {
  profileName: string;
  target: string;
  remotePath: string;
  localPath?: string;
  bytes: number;
  content?: string;
  output: SshCommandOutput;
}

export async function readRemoteTextFile(
  profile: SshProfile,
  remotePath: string,
  policy: SshExecutionPolicy,
): Promise<RemoteTextFileResult> {
  const normalizedRemotePath = normalizeRemotePath(remotePath);
  const output = await runSshCommand(profile, `base64 ${quoteForRemoteShell(pathOperand(normalizedRemotePath))}`, policy);
  ensureSuccess(output, "remote read failed");
  const payload = output.stdout.replace(/\s+/g, "");
  const content = Buffer.from(payload, "base64").toString("utf8");
  return {
    profileName: profile.name,
    target: output.target,
    remotePath: normalizedRemotePath,
    bytes: Buffer.byteLength(content, "utf8"),
    content,
    output,
  };
}

export async function writeRemoteTextFile(
  profile: SshProfile,
  remotePath: string,
  content: string,
  policy: SshExecutionPolicy & { overwrite?: boolean },
): Promise<RemoteTextFileResult> {
  const normalizedRemotePath = normalizeRemotePath(remotePath);
  const quotedPath = quoteForRemoteShell(pathOperand(normalizedRemotePath));
  const parent = remoteDirname(normalizedRemotePath);
  const mkdir = parent ? `mkdir -p ${quoteForRemoteShell(parent)} && ` : "";
  const noClobber = policy.overwrite ? "" : `test ! -e ${quotedPath} && `;
  const output = await runSshCommand(profile, `${mkdir}${noClobber}base64 -d > ${quotedPath}`, {
    ...policy,
    stdin: Buffer.from(content, "utf8").toString("base64"),
  });
  ensureSuccess(output, "remote write failed");
  return {
    profileName: profile.name,
    target: output.target,
    remotePath: normalizedRemotePath,
    bytes: Buffer.byteLength(content, "utf8"),
    output,
  };
}

export async function pullRemoteTextFile(
  profile: SshProfile,
  remotePath: string,
  root: string,
  localPath: string,
  policy: SshExecutionPolicy & { overwrite?: boolean },
): Promise<RemoteTextFileResult> {
  const read = await readRemoteTextFile(profile, remotePath, policy);
  const target = safeJoin(root, localPath);
  if (fs.existsSync(target) && !policy.overwrite) {
    throw new Error(`local file exists; pass --overwrite to replace: ${localPath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, read.content ?? "", "utf8");
  return {
    ...read,
    localPath,
  };
}

export async function pushRemoteTextFile(
  profile: SshProfile,
  root: string,
  localPath: string,
  remotePath: string,
  policy: SshExecutionPolicy & { overwrite?: boolean },
): Promise<RemoteTextFileResult> {
  const source = safeJoin(root, localPath);
  const content = fs.readFileSync(source, "utf8");
  const written = await writeRemoteTextFile(profile, remotePath, content, policy);
  return {
    ...written,
    localPath,
  };
}

function ensureSuccess(output: SshCommandOutput, prefix: string): void {
  if (output.exitCode !== 0 || output.timedOut) {
    throw new Error(`${prefix}: ${summarizeSshCommand(output)}`);
  }
}

function normalizeRemotePath(remotePath: string): string {
  const normalized = remotePath.trim();
  if (!normalized) throw new Error("remote path is empty");
  if (normalized.includes("\0")) throw new Error("remote path contains a null byte");
  return normalized;
}

function pathOperand(remotePath: string): string {
  return remotePath.startsWith("-") ? `./${remotePath}` : remotePath;
}

function remoteDirname(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return "";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}
