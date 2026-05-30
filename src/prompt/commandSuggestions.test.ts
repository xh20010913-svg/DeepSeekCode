import test from "node:test";
import assert from "node:assert/strict";
import type { Command } from "../types/command.js";
import {
  commandTokenAt,
  completeSlashCommand,
  getSlashCommandSuggestions,
} from "./commandSuggestions.js";

const commands: Command[] = [
  command("help", "Show help", undefined, ["?"]),
  command("cache", "Show cache tools", "[plan|doctor]"),
  command("cancel", "Cancel a run", "<run-id>"),
  command("clear", "Clear transcript"),
  { ...command("hidden", "Hidden command"), hidden: true },
];

test("slash command suggestions match names and aliases", () => {
  assert.deepEqual(
    getSlashCommandSuggestions(commands, "/ca").map((item) => item.name),
    ["cache", "cancel"],
  );
  assert.deepEqual(
    getSlashCommandSuggestions(commands, "/?").map((item) => item.name),
    ["help"],
  );
  assert.doesNotMatch(
    getSlashCommandSuggestions(commands, "/h").map((item) => item.name).join(" "),
    /hidden/,
  );
});

test("slash command completion replaces only the command token", () => {
  const [suggestion] = getSlashCommandSuggestions(commands, "/ca");
  assert.ok(suggestion);
  assert.deepEqual(completeSlashCommand("/ca", 3, suggestion), {
    value: "/cache ",
    cursor: 7,
  });
  assert.deepEqual(completeSlashCommand("/ca plan something", 3, suggestion), {
    value: "/cache plan something",
    cursor: 7,
  });
});

test("command token detection only applies before command arguments", () => {
  assert.equal(commandTokenAt("/cache plan", 6), "/cache");
  assert.equal(commandTokenAt("/cache plan", 8), null);
  assert.equal(commandTokenAt("hello /cache", 12), null);
});

function command(name: string, description: string, usage?: string, aliases?: string[]): Command {
  return {
    name,
    description,
    usage,
    aliases,
    execute() {
      return { message: name };
    },
  };
}
