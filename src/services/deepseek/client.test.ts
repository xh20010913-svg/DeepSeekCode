import test from "node:test";
import assert from "node:assert/strict";
import { DeepSeekClient } from "./client.js";

test("DeepSeek stream parser flushes final SSE data without a trailing blank line", async () => {
  const previousFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const body = [
    'data: {"choices":[{"delta":{"content":"cache "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    'data: {"usage":{"prompt_tokens":100,"completion_tokens":2,"prompt_cache_hit_tokens":64,"prompt_cache_miss_tokens":36}}',
  ];

  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      for (const chunk of body) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }))) as typeof fetch;

  try {
    const client = new DeepSeekClient({
      kind: "open_ai_compatible",
      name: "test",
      baseUrl: "https://example.test",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      timeoutSecs: 5,
    });
    const events = [];
    for await (const event of client.streamChat([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    assert.deepEqual(events, [
      { type: "text_delta", text: "cache " },
      { type: "text_delta", text: "ok" },
      {
        type: "usage",
        inputTokens: 100,
        outputTokens: 2,
        cacheHitTokens: 64,
        cacheMissTokens: 36,
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("DeepSeek turn classification retries empty JSON content before returning", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    const payload = calls === 1
      ? {
          choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: "thinking" } }],
          usage: { prompt_tokens: 12, completion_tokens: 0 },
        }
      : {
          choices: [{ finish_reason: "stop", message: { content: "{\"task_kind\":\"file_change\",\"needs_local_tools\":true,\"reason\":\"create files\"}" } }],
          usage: { prompt_tokens: 16, completion_tokens: 6 },
        };
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new DeepSeekClient({
      kind: "open_ai_compatible",
      name: "test",
      baseUrl: "https://example.test",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      timeoutSecs: 5,
    });
    const classification = await client.classifyTurn("create a file");
    assert.equal(calls, 2);
    assert.equal(classification.task_kind, "file_change");
    assert.equal(classification.needs_local_tools, true);
    assert.equal(classification.reason, "create files");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("DeepSeek JSON classification reports diagnostics after retry failure", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "" } }],
    usage: { prompt_tokens: 12, completion_tokens: 0 },
  }), {
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    const client = new DeepSeekClient({
      kind: "open_ai_compatible",
      name: "test",
      baseUrl: "https://example.test",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      timeoutSecs: 5,
    });
    await assert.rejects(
      () => client.classifyTurn("create a file"),
      /DeepSeek JSON response invalid after retry/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
