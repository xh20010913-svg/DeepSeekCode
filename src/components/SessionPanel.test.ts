import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionFocusPanelModel,
  sessionListPanelModel,
  sessionMetadataPanelModel,
  sessionPanelCommandOptions,
  sessionPanelRowOptions,
  sessionPanelTabs,
  sessionResumePanelModel,
  sessionTimelineRows,
  sessionTranscriptPanelModel,
} from "./SessionPanel.js";

test("session list panel marks current session and tags", () => {
  const model = sessionListPanelModel([{
    sessionId: "session_1",
    path: "D:\\data\\sessions\\session_1.jsonl",
    updatedAtMs: 1,
    bytes: 2048,
  }], {
    session_1: {
      sessionId: "session_1",
      title: "Refactor UI",
      tags: ["frontend"],
      updatedAtMs: 1,
    },
  }, "session_1");

  assert.equal(model.rows[0]?.status, "current");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /#frontend/);
  assert.deepEqual(model.tags, ["frontend"]);
  assert.equal(sessionPanelTabs(model)[0]?.count, 1);
  assert.equal(sessionPanelCommandOptions(model)[0]?.id, "resume");
  assert.equal(sessionPanelRowOptions(model)[0]?.label, "session_1");
});

test("session transcript panel keeps role tone and run note", () => {
  const model = sessionTranscriptPanelModel("session_1", [{
    id: "msg_1",
    role: "assistant",
    text: "Done",
    createdAtMs: 1,
    runId: "run_1",
  }]);

  assert.equal(model.rows[0]?.status, "assistant");
  assert.equal(model.rows[0]?.tone, "success");
  assert.equal(model.timeline?.[0]?.role, "assistant");
  assert.equal(model.timeline?.[0]?.selected, true);
  assert.match(model.timelineSummary ?? "", /timeline 1 message/);
  assert.equal(model.preview?.rows[0]?.role, "assistant");
  assert.match(model.preview?.summary ?? "", /1 assistant/);
  assert.equal(model.selector?.rows.length, 0);
  assert.match(model.rows[0]?.note ?? "", /run_1/);
});

test("session resume and focus panels summarize current transcript state", () => {
  const resume = sessionResumePanelModel({
    sessionId: "session_1",
    title: "Refactor UI",
    tags: ["frontend"],
    records: [{
      id: "msg_1",
      role: "user",
      text: "continue",
      createdAtMs: 1,
    }],
  });

  assert.match(resume.subtitle, /#frontend/);
  assert.equal(resume.rows[0]?.tone, "brand");
  assert.equal(resume.timeline?.[0]?.role, "user");
  assert.equal(resume.selector?.rows[0]?.key, "msg_1");
  assert.equal(resume.preview?.title, "resume preview");
  assert.equal(sessionPanelCommandOptions(resume)[0]?.id, "rename");

  const focus = sessionFocusPanelModel({
    sessionId: "session_1",
    action: "current",
    title: "Refactor UI",
    tags: ["frontend"],
  });
  assert.equal(focus.rows[0]?.status, "current");

  const cleared = sessionFocusPanelModel({ action: "cleared" });
  assert.equal(cleared.rows.length, 0);
});

test("session metadata panel shows title and tags", () => {
  const model = sessionMetadataPanelModel({
    sessionId: "session_1",
    title: "Useful Session",
    tags: ["migration"],
    updatedAtMs: 1,
  }, "renamed");

  assert.equal(model.rows[0]?.status, "renamed");
  assert.match(model.rows[0]?.note ?? "", /#migration/);
});

test("session timeline rows select the newest visible message", () => {
  const rows = sessionTimelineRows([
    {
      id: "msg_1",
      role: "user",
      text: "first",
      createdAtMs: 1,
    },
    {
      id: "msg_2",
      role: "assistant",
      text: "second line\nhidden",
      createdAtMs: 1,
      runId: "run_123456789",
    },
  ], 2);

  assert.equal(rows[0]?.selected, false);
  assert.equal(rows[1]?.selected, true);
  assert.equal(rows[1]?.marker, ">");
  assert.equal(rows[1]?.text, "second line");
  assert.match(rows[1]?.note ?? "", /run_1234\.\.\./);
});
