import test from "node:test";
import assert from "node:assert/strict";
import { connectorText } from "./connectorText.js";
import { pluginDisplayName } from "./plugin.js";
import { timestampFromDate } from "./generated/google/protobuf/timestamp.js";

test("connector text helper keeps title body and source", () => {
  assert.deepEqual(connectorText("a", "b", "c"), { title: "a", body: "b", source: "c" });
});

test("plugin display name includes version when available", () => {
  assert.equal(pluginDisplayName({ name: "demo", version: "1.0.0" }), "demo@1.0.0");
  assert.equal(pluginDisplayName({ name: "demo" }), "demo");
});

test("timestamp helper converts Date to protobuf-like seconds and nanos", () => {
  assert.deepEqual(timestampFromDate(new Date(1500)), { seconds: 1, nanos: 500_000_000 });
});
