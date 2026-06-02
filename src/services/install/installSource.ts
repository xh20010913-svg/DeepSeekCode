import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface ResolvedInstallSource {
  path: string;
  metadata: {
    kind: "path" | "git";
    sourcePath: string;
    sourceUrl?: string;
    ref?: string;
    subpath?: string;
  };
}

export function resolveInstallSource(input: {
  sourcePath: string;
  projectPath: string;
  dataDir: string;
  cacheNamespace: string;
}): ResolvedInstallSource {
  const source = input.sourcePath.trim();
  const resolvedPath = path.isAbsolute(source)
    ? path.resolve(source)
    : path.resolve(input.projectPath, source);
  if (fs.existsSync(resolvedPath) || !isRemoteSource(source)) {
    return {
      path: resolvedPath,
      metadata: {
        kind: "path",
        sourcePath: resolvedPath,
      },
    };
  }
  return resolveRemoteSource(source, input.dataDir, input.cacheNamespace);
}

function resolveRemoteSource(source: string, dataDir: string, cacheNamespace: string): ResolvedInstallSource {
  const parsed = parseGitHubSource(source) ?? parseGenericGitSource(source);
  const cacheRoot = path.join(dataDir, "cache", "install-sources", cacheNamespace);
  if (parsed.subpath && unsafeSubpath(parsed.subpath)) {
    throw new Error(`install source subpath is unsafe: ${parsed.subpath}`);
  }
  fs.mkdirSync(cacheRoot, { recursive: true });
  const cachePath = path.join(cacheRoot, stableSourceId(source));
  fs.rmSync(cachePath, { recursive: true, force: true });
  fs.mkdirSync(cachePath, { recursive: true });
  const cloneArgs = ["clone", "--depth", "1"];
  if (parsed.ref) cloneArgs.push("--branch", parsed.ref);
  cloneArgs.push(parsed.cloneUrl, cachePath);
  try {
    execFileSync("git", cloneArgs, { stdio: "ignore" });
  } catch (error) {
    fs.rmSync(cachePath, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to clone install source ${source}: ${detail}`);
  }
  const resolvedPath = parsed.subpath ? path.join(cachePath, parsed.subpath) : cachePath;
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`install source subpath not found after clone: ${parsed.subpath ?? "(root)"}`);
  }
  return {
    path: resolvedPath,
    metadata: {
      kind: "git",
      sourcePath: source,
      sourceUrl: parsed.cloneUrl,
      ref: parsed.ref,
      subpath: parsed.subpath,
    },
  };
}

function isRemoteSource(source: string): boolean {
  return /^(https?|file):\/\//i.test(source) || /^[\w.-]+\/[\w.-]+(?:[#/].*)?$/.test(source);
}

function parseGitHubSource(source: string): { cloneUrl: string; ref?: string; subpath?: string } | undefined {
  const shorthand = source.match(/^([\w.-]+)\/([\w.-]+)(?:#(.+))?$/);
  if (shorthand) {
    const [, owner, repo, ref] = shorthand;
    return {
      cloneUrl: `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}.git`,
      ref,
    };
  }

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  if (!/github\.com$/i.test(url.hostname)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/i, "");
  let ref: string | undefined;
  let subpath: string | undefined;
  const treeIndex = parts.indexOf("tree");
  const blobIndex = parts.indexOf("blob");
  const refIndex = treeIndex >= 0 ? treeIndex : blobIndex;
  if (refIndex >= 0 && parts.length > refIndex + 1) {
    ref = parts[refIndex + 1];
    subpath = parts.slice(refIndex + 2).join("/");
  }
  if (url.hash.length > 1 && !ref) {
    const parsedHash = parseRefAndSubpath(url.hash.slice(1));
    ref = parsedHash.ref;
    subpath = parsedHash.subpath;
  }
  return {
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    ref,
    subpath,
  };
}

function parseGenericGitSource(source: string): { cloneUrl: string; ref?: string; subpath?: string } {
  const [withoutHash, hash] = source.split("#", 2);
  const parsedHash = parseRefAndSubpath(hash);
  return {
    cloneUrl: withoutHash,
    ref: parsedHash.ref,
    subpath: parsedHash.subpath,
  };
}

function parseRefAndSubpath(hash: string | undefined): { ref?: string; subpath?: string } {
  if (!hash) return {};
  const [ref, ...pathParts] = hash.split(":");
  return {
    ref: ref || undefined,
    subpath: pathParts.length ? pathParts.join(":").replace(/^\/+/, "") : undefined,
  };
}

function stableSourceId(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
}

function unsafeSubpath(subpath: string): boolean {
  return subpath
    .split(/[\\/]+/)
    .some((part) => part === "..") ||
    path.isAbsolute(subpath) ||
    /^[A-Za-z]:[\\/]/.test(subpath);
}
