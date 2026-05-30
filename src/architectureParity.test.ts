import test from "node:test";
import assert from "node:assert/strict";
import { assistantRoles } from "./assistant/roles.js";
import { JobQueue } from "./jobs/jobQueue.js";
import { describeAttachTarget } from "./remote/attach.js";
import { error, ok } from "./server/jsonRpc.js";
import { RuntimeRequestSchema } from "./schemas/runtime.js";

test("ported architecture support modules are usable", () => {
  assert.ok(assistantRoles.some((role) => role.role === "Builder"));
  const queue = new JobQueue();
  const job = queue.enqueue("test", { ok: true });
  assert.equal(queue.claim()?.id, job.id);
  queue.finish(job.id, "succeeded");
  assert.match(describeAttachTarget({ runId: "run_1", projectPath: "D:/code", status: "running" }), /run_1/);
  assert.equal(ok({ jsonrpc: "2.0", method: "ping", id: 1 }, "pong").result, "pong");
  assert.equal(error({ jsonrpc: "2.0", method: "ping" }, -32601, "no").error?.code, -32601);
  assert.equal(RuntimeRequestSchema.parse({ kind: "chat", text: "hi" }).kind, "chat");
});
