import test from "node:test";
import assert from "node:assert/strict";
import { helpCommandRows } from "./HelpV2/Commands.js";
import { generalHelpLines } from "./HelpV2/General.js";
import { memoryFileOptions } from "./memory/MemoryFileSelector.js";
import { expandShellOutputHint } from "./shell/ExpandShellOutputContext.js";
import { shellOutputLineTone } from "./shell/OutputLine.js";
import { shellTimeLabel } from "./shell/ShellTimeDisplay.js";
import { option } from "./ui/option.js";
import { treeSelectOptions } from "./ui/TreeSelect.js";

test("path adapter helpers expose existing command and memory UI models", () => {
  assert.deepEqual(helpCommandRows([{ name: "status", description: "show status", execute: () => ({ message: "ok" }) }]), ["/status"]);
  assert.match(generalHelpLines().join("\n"), /cache plan/);
  assert.equal(memoryFileOptions(["D:\\code\\x\\.deepseekcode\\memory.md"], "D:\\code\\x\\.deepseekcode\\memory.md")[0]?.selected, true);
});

test("path adapter shell helpers classify output", () => {
  assert.equal(shellOutputLineTone("Error: nope"), "error");
  assert.equal(shellOutputLineTone("warning"), "warning");
  assert.equal(shellTimeLabel(1250), "1.3s");
  assert.equal(expandShellOutputHint(false), "shell output clipped");
});

test("path adapter ui helpers map tree nodes into select options", () => {
  assert.equal(option("a", "A").label, "A");
  const rows = treeSelectOptions([{ id: "child", label: "Child", depth: 1, selected: true }]);

  assert.equal(rows[0]?.label, "  Child");
  assert.equal(rows[0]?.tone, "success");
});
