import test from "node:test";
import assert from "node:assert/strict";
import { remoteFileApprovalPreviewModel } from "./RemoteFileApprovalPreviewBlock.js";

test("remote file approval preview summarizes SSH writes", () => {
  assert.deepEqual(remoteFileApprovalPreviewModel(
    "ssh_write_file profile=prod path=/srv/app/config.json overwrite=true chars=120 lines=5 sha=abc123",
  ), {
    action: "ssh_write_file",
    title: "Overwrite remote file",
    profile: "prod",
    path: "/srv/app/config.json",
    operation: "replace remote file content",
    impact: "120 chars / 5 lines",
    fingerprint: "abc123",
    risk: "high",
    note: "remote file writes cannot be locally diff-previewed; inspect the target profile carefully",
  });
});

test("remote file approval preview ignores unrelated summaries", () => {
  assert.equal(remoteFileApprovalPreviewModel("ssh_run profile=prod command=ls"), null);
});
