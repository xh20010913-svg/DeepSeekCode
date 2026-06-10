import assert from "node:assert/strict";
import test from "node:test";
import { classifyCommandFailure, preflightCommand } from "../../tools/commandPreflight.js";

test("command preflight rejects bash chaining on Windows when applicable", () => {
  const result = preflightCommand("npm install && npm run build");
  if (process.platform === "win32") {
    assert.equal(result.ok, false);
    assert.equal(result.category, "windows_shell_incompatible");
    assert.match(result.suggestion ?? "", /PowerShell-safe/);
  } else {
    assert.equal(result.ok, true);
  }
});

test("command failure diagnosis explains blocked rg fallback", () => {
  const diagnosis = classifyCommandFailure({
    stdout: "",
    stderr: "rg.exe: Access is denied",
    exitCode: 1,
    timedOut: false,
  });

  assert.equal(diagnosis?.category, "search_tool_blocked");
  assert.match(diagnosis?.suggestions.join("\n") ?? "", /Select-String/);
});

test("command failure diagnosis explains local git proxy recovery", () => {
  const diagnosis = classifyCommandFailure({
    stdout: "",
    stderr: "fatal: unable to access 'https://github.com/x/y.git/': Recv failure: Connection was reset",
    exitCode: 128,
    timedOut: false,
  });

  assert.equal(diagnosis?.category, "git_network_or_proxy");
  assert.match(diagnosis?.suggestions.join("\n") ?? "", /127\.0\.0\.1:7897/);
});
