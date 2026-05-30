import test from "node:test";
import assert from "node:assert/strict";
import { virtualMessageWindow } from "./VirtualMessageList.js";

test("virtual message window keeps newest rows within height budget", () => {
  const entries = ["one", "two", "three", "four"];
  const window = virtualMessageWindow(entries, 3, () => 1);

  assert.deepEqual(window.visible, ["two", "three", "four"]);
  assert.equal(window.hidden, 1);
  assert.equal(window.rows, 3);
});

test("virtual message window always keeps at least one tall message", () => {
  const entries = ["short", "tall"];
  const window = virtualMessageWindow(entries, 3, (entry) => entry === "tall" ? 10 : 1);

  assert.deepEqual(window.visible, ["tall"]);
  assert.equal(window.hidden, 1);
  assert.equal(window.rows, 10);
});

test("virtual message window clamps tiny heights to useful terminal budget", () => {
  const entries = ["a", "b", "c"];
  const window = virtualMessageWindow(entries, 0, () => 1);

  assert.deepEqual(window.visible, ["a", "b", "c"]);
  assert.equal(window.hidden, 0);
});
