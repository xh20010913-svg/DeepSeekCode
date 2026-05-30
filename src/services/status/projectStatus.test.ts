import test from "node:test";
import assert from "node:assert/strict";
import { formatGitStatus, formatProjectStatus, summarizeGitStatus, type ProjectStatusSummary } from "./projectStatus.js";

test("formatProjectStatus includes the operational status sections", () => {
  const status: ProjectStatusSummary = {
    product: "DeepSeekCode",
    projectPath: "D:/project",
    dataDir: "D:/data",
    model: "deepseek-v4-flash",
    providerReady: true,
    permissionProfile: "dev",
    permissions: { shell: true, browser: false },
    cache: { hitTokens: 10, missTokens: 5, rate: "67%", observedRuns: 1 },
    runs: {
      totalRecent: 1,
      unfinished: 1,
      latest: {
        id: "run_1",
        status: "running",
        message: "work",
        actionCount: 2,
        artifactCount: 1,
        eventCount: 3,
      },
    },
    tasks: { queued: 1, running: 1, succeeded: 0, failed: 0, paused: 0, cancelled: 0 },
    gates: { approvalsPending: 1, validationsPending: 0, validationsFailed: 1 },
    git: {
      available: true,
      clean: false,
      modified: 1,
      added: 0,
      deleted: 0,
      renamed: 0,
      untracked: 1,
      conflicted: 0,
      raw: " M src/index.ts\n?? note.txt\n",
    },
  };

  const text = formatProjectStatus(status);
  assert.match(text, /DeepSeekCode status/);
  assert.match(text, /provider: ready/);
  assert.match(text, /permissions: dev shell=on browser=off/);
  assert.match(text, /git: modified=1/);
});

test("formatGitStatus handles clean and unavailable states", () => {
  assert.equal(formatGitStatus({
    available: true,
    clean: true,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflicted: 0,
    raw: "",
  }), "clean");
  assert.match(formatGitStatus({
    available: false,
    clean: false,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflicted: 0,
    raw: "",
    error: "not a git repository\nextra",
  }), /unavailable \(not a git repository\)/);
});

test("summarizeGitStatus tolerates non-git directories", () => {
  const status = summarizeGitStatus(process.cwd());
  assert.equal(typeof status.available, "boolean");
});
