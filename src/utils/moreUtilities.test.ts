import test from "node:test";
import assert from "node:assert/strict";
import { last, uniqueBy } from "./array.js";
import { getCwd, setCwd } from "./cwd.js";
import { isEnvTruthy } from "./envUtils.js";
import { errorMessage, toError } from "./errors.js";
import { redactSecrets } from "./redact.js";
import { formatDurationMs } from "./time.js";

test("additional utility ports behave predictably", () => {
  assert.equal(last([1, 2, 3]), 3);
  assert.deepEqual(uniqueBy([{ id: "a" }, { id: "a" }, { id: "b" }], (value) => value.id), [{ id: "a" }, { id: "b" }]);
  setCwd("D:/code/DeepSeekCode");
  assert.equal(getCwd(), "D:/code/DeepSeekCode");
  assert.equal(isEnvTruthy("yes"), true);
  assert.equal(errorMessage(new Error("bad")), "bad");
  assert.equal(toError("bad").message, "bad");
  assert.match(redactSecrets("DEEPSEEK_API_KEY=demo-token"), /REDACTED/);
  assert.equal(formatDurationMs(1500), "1.5s");
});
