import test from "node:test";
import assert from "node:assert/strict";
import { promptInputFooterSuggestionWindow } from "./PromptInputFooterSuggestions.js";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";

const suggestions: SlashCommandSuggestion[] = Array.from({ length: 7 }, (_, index) => ({
  id: `suggestion-${index}`,
  name: `cmd${index}`,
  description: `command ${index}`,
  aliases: [],
}));

test("prompt input footer suggestions use wider windows on normal terminals", () => {
  assert.deepEqual(
    promptInputFooterSuggestionWindow(suggestions, 3, 80).map((row) => row.index),
    [1, 2, 3, 4, 5],
  );
});

test("prompt input footer suggestions tighten on narrow terminals", () => {
  assert.deepEqual(
    promptInputFooterSuggestionWindow(suggestions, 3, 60).map((row) => row.index),
    [1, 2, 3, 4],
  );
});
