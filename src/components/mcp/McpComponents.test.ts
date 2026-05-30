import test from "node:test";
import assert from "node:assert/strict";
import { mcpCapabilitiesModel } from "./CapabilitiesSection.js";
import { mcpToolDetailModel, schemaParameters } from "./MCPToolDetailView.js";
import { displayToolName, mcpToolListModel } from "./MCPToolListView.js";
import { mcpParsingWarningsModel } from "./McpParsingWarnings.js";

test("mcp capabilities model reports available capability labels", () => {
  const model = mcpCapabilitiesModel({ tools: 2, resources: 1, prompts: 0 });

  assert.equal(model.summary, "tools, resources");
  assert.deepEqual(model.labels.map((label) => label.label), ["tools", "resources"]);
});

test("mcp tool list strips server prefixes and annotates risky tools", () => {
  const model = mcpToolListModel("filesystem", [
    { name: "mcp__filesystem__read_file", description: "Read file", readOnly: true },
    { name: "mcp__filesystem__write_file", destructive: true },
  ]);

  assert.equal(displayToolName("mcp__filesystem__read_file", "filesystem"), "read_file");
  assert.equal(model.options[0]?.label, "read_file");
  assert.equal(model.options[0]?.tone, "success");
  assert.equal(model.options[1]?.tone, "error");
});

test("mcp tool detail extracts schema parameters", () => {
  const params = schemaParameters({
    required: ["path"],
    properties: {
      path: { type: "string", description: "File path" },
      limit: { type: "number" },
    },
  });

  assert.deepEqual(params.map((param) => [param.name, param.type, param.required]), [
    ["path", "string", true],
    ["limit", "number", false],
  ]);

  const model = mcpToolDetailModel("filesystem", {
    name: "mcp__filesystem__read_file",
    description: "Read file",
    inputSchema: { properties: { path: { type: "string" } } },
    readOnly: true,
  });
  assert.equal(model.title, "read_file");
  assert.deepEqual(model.badges, ["read-only"]);
  assert.equal(model.parameters[0]?.name, "path");
});

test("mcp parsing warnings compact message text", () => {
  const model = mcpParsingWarningsModel([
    { severity: "warning", message: "  missing   description ", suggestion: " add one " },
  ]);

  assert.equal(model.visible, true);
  assert.equal(model.warnings[0]?.message, "missing description");
  assert.equal(model.warnings[0]?.suggestion, "add one");
});
