import test from "node:test";
import assert from "node:assert/strict";
import { groupTranscriptItems, selectVisibleEntries, type TranscriptItem } from "./Transcript.js";

test("transcript grouping collapses three or more consecutive tool events", () => {
  const items: TranscriptItem[] = [
    { role: "user", text: "run tests" },
    { role: "tool-start", text: "read_file started src/a.ts" },
    { role: "tool", text: "read_file succeeded src/a.ts\nok" },
    { role: "tool", text: "run_command succeeded\nexit=0" },
    { role: "assistant", text: "done" },
  ];

  const grouped = groupTranscriptItems(items);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0]?.kind, "item");
  assert.equal(grouped[1]?.kind, "tool-group");
  assert.equal(grouped[1]?.kind === "tool-group" ? grouped[1].items.length : 0, 3);
  assert.equal(grouped[2]?.kind, "item");
});

test("transcript grouping keeps short tool exchanges expanded", () => {
  const items: TranscriptItem[] = [
    { role: "tool-start", text: "read_file started src/a.ts" },
    { role: "tool", text: "read_file succeeded src/a.ts\nok" },
  ];

  const grouped = groupTranscriptItems(items);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((entry) => entry.kind), ["item", "item"]);
});

test("transcript grouping does not cross user or assistant messages", () => {
  const items: TranscriptItem[] = [
    { role: "tool-start", text: "read_file started src/a.ts" },
    { role: "tool", text: "read_file succeeded src/a.ts\nok" },
    { role: "assistant", text: "checking" },
    { role: "tool-start", text: "grep started TODO" },
    { role: "tool", text: "grep succeeded\nok" },
    { role: "tool", text: "run_command succeeded\nexit=0" },
  ];

  const grouped = groupTranscriptItems(items);
  assert.deepEqual(grouped.map((entry) => entry.kind), ["item", "item", "item", "tool-group"]);
});

test("transcript visible entry selection delegates to virtual message window", () => {
  const grouped = groupTranscriptItems([
    { role: "user", text: "first" },
    { role: "assistant", text: "second" },
    { role: "assistant", text: "third" },
  ]);

  const visible = selectVisibleEntries(grouped, 3);
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.kind === "item" ? visible[0].item.text : "", "third");
});
