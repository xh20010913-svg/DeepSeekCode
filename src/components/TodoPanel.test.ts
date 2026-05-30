import test from "node:test";
import assert from "node:assert/strict";
import { todoPanelModel } from "./TodoPanel.js";
import type { TodoItem } from "../services/todos/todoService.js";

test("todo panel model summarizes active pending and completed todos", () => {
  const model = todoPanelModel([
    todo("3", "Write docs", "completed"),
    todo("2", "Run smoke tests", "pending"),
    todo("1", "Polish terminal UI", "in_progress", "Polishing terminal UI"),
  ]);

  assert.equal(model.empty, false);
  assert.equal(model.summary, "1/3 done");
  assert.equal(model.ratio, 1 / 3);
  assert.equal(model.tone, "warning");
  assert.deepEqual(model.badges.map((badge) => badge.label), ["active 1", "pending 1", "done 1"]);
  assert.equal(model.rows[0]?.key, "1");
  assert.equal(model.rows[0]?.marker, ">");
  assert.equal(model.rows[0]?.active, true);
  assert.equal(model.rows[0]?.text, "Polishing terminal UI");
  assert.equal(model.rows[0]?.detail, "Polish terminal UI");
});

test("todo panel model prioritizes pending before completed and reports hidden rows", () => {
  const model = todoPanelModel([
    todo("1", "Completed a", "completed"),
    todo("2", "Pending a", "pending"),
    todo("3", "Completed b", "completed"),
    todo("4", "Pending b", "pending"),
  ], { limit: 2 });

  assert.deepEqual(model.rows.map((row) => row.key), ["2", "4"]);
  assert.match(model.hiddenSummary, /\+2 hidden/);
  assert.match(model.hiddenSummary, /2 done/);
});

test("todo panel model exposes an empty state", () => {
  const model = todoPanelModel([]);

  assert.equal(model.empty, true);
  assert.equal(model.summary, "0 todos");
  assert.equal(model.rows.length, 0);
});

function todo(id: string, content: string, status: TodoItem["status"], activeForm?: string): TodoItem {
  return {
    id,
    content,
    activeForm: activeForm ?? `Working on ${content.toLowerCase()}`,
    status,
  };
}
