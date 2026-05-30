import test from "node:test";
import assert from "node:assert/strict";
import type { Command } from "../types/command.js";
import {
  commandPaletteInsertText,
  getCommandPaletteItems,
  normalizePaletteQuery,
} from "./commandPalette.js";

const commands: Command[] = [
  command("help", "Show help", undefined, ["?"]),
  command("cache", "Inspect DeepSeek cache health", "[plan|doctor]"),
  command("cancel", "Cancel a run", "<run-id>"),
  command("permissions", "Switch runtime permission profile"),
  command("hidden", "Hidden command", undefined, undefined, true),
];

test("command palette returns visible commands in catalog order for empty query", () => {
  assert.deepEqual(
    getCommandPaletteItems(commands, "").map((item) => item.name),
    ["help", "cache", "cancel", "permissions"],
  );
});

test("command palette ranks name alias description and fuzzy matches", () => {
  assert.deepEqual(
    getCommandPaletteItems(commands, "ca").map((item) => item.name),
    ["cache", "cancel"],
  );
  assert.deepEqual(
    getCommandPaletteItems(commands, "?").map((item) => item.name),
    ["help"],
  );
  assert.deepEqual(
    getCommandPaletteItems(commands, "runtime").map((item) => item.name),
    ["permissions"],
  );
  assert.deepEqual(
    getCommandPaletteItems(commands, "prm").map((item) => item.name),
    ["permissions"],
  );
});

test("command palette normalizes slash input and inserts a command token", () => {
  assert.equal(normalizePaletteQuery("/cache "), "cache");
  const [item] = getCommandPaletteItems(commands, "cache");
  assert.ok(item);
  assert.equal(commandPaletteInsertText(item), "/cache ");
});

function command(
  name: string,
  description: string,
  usage?: string,
  aliases?: string[],
  hidden = false,
): Command {
  return {
    name,
    description,
    usage,
    aliases,
    hidden,
    execute() {
      return { message: name };
    },
  };
}
