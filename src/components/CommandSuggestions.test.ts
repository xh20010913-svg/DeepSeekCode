import test from "node:test";
import assert from "node:assert/strict";
import {
  visibleSuggestionRows,
} from "./CommandSuggestions.js";
import { padRightCells, truncateCells } from "./design/textLayout.js";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import { cellWidth } from "../prompt/promptViewport.js";

const suggestions: SlashCommandSuggestion[] = Array.from({ length: 8 }, (_, index) => ({
  id: `cmd-${index}`,
  name: `cmd${index}`,
  description: `command ${index}`,
  aliases: [],
}));

test("visible suggestion rows stay centered around the selected item", () => {
  assert.deepEqual(
    visibleSuggestionRows(suggestions, 5, 5).map((row) => row.index),
    [3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    visibleSuggestionRows(suggestions, 0, 5).map((row) => row.index),
    [0, 1, 2, 3, 4],
  );
});

test("suggestion truncation and padding use terminal cell width", () => {
  assert.equal(truncateCells("你好世界abc", 7), "你好...");
  const padded = padRightCells("你好", 6);
  assert.equal(cellWidth(padded), 6);
});
