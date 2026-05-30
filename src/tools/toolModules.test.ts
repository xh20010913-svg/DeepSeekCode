import test from "node:test";
import assert from "node:assert/strict";
import { BashTool } from "./BashTool/index.js";
import { BrowserTool } from "./BrowserTool/index.js";
import { FileEditTool } from "./FileEditTool/index.js";
import { FileReadTool } from "./FileReadTool/index.js";
import { FileWriteTool } from "./FileWriteTool/index.js";
import { GlobTool } from "./GlobTool/index.js";
import { GrepTool } from "./GrepTool/index.js";
import { LSTool } from "./LSTool/index.js";
import { ValidateArtifactTool } from "./ValidateArtifactTool/index.js";

test("Claude-style tool modules expose registry tools", () => {
  assert.equal(FileReadTool.name, "read_file");
  assert.equal(FileWriteTool.name, "write_file");
  assert.equal(FileEditTool.name, "apply_patch");
  assert.equal(BashTool.name, "run_command");
  assert.equal(LSTool.name, "list_files");
  assert.equal(ValidateArtifactTool.name, "validate_artifact");
  assert.equal(BrowserTool.name, "browser_session_start");
  assert.equal(GlobTool.name, "glob_files");
  assert.equal(GrepTool.name, "grep_files");
});
