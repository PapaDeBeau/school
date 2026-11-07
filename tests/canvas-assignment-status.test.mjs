import assert from "node:assert/strict";
import test from "node:test";
import { assignmentIsComplete, externalZeroNeedsAttention } from "../lib/canvas-assignment-status.ts";

// Relevant fields from Canvas assignment 33724; no credentials or personal data.
const wayground = {
  submission_types: ["external_tool"],
  due_at: "2026-11-07T07:59:59Z",
  submission: {
    score: 0, submitted_at: null, attempt: null, submission_type: null,
    graded_at: "2026-11-06T17:52:33Z", workflow_state: "graded",
    excused: false, missing: false, late: false,
  },
};

test("Wayground zero stays due before deadline and needs attention afterward despite missing=false", () => {
  assert.equal(assignmentIsComplete(wayground), false);
  assert.equal(externalZeroNeedsAttention(wayground, Date.parse("2026-11-06T20:00:00Z")), false);
  assert.equal(externalZeroNeedsAttention(wayground, Date.parse("2026-11-07T08:00:00Z")), true);
});

test("CK-12 pre-submission zero remains due; actual API submission clears it", () => {
  const before = { ...wayground, submission: { ...wayground.submission, graded_at: "2026-11-06T17:52:11Z" } };
  assert.equal(assignmentIsComplete(before), false);
  const after = { ...before, submission: { ...before.submission, score: 20, attempt: 1,
    submission_type: "online_url", submitted_at: "2026-11-07T07:49:04Z", graded_at: "2026-11-07T07:49:05Z" } };
  assert.equal(assignmentIsComplete(after), true);
  assert.equal(externalZeroNeedsAttention(after, Date.parse("2026-11-08T08:00:00Z")), false);
});

test("submitted zero, submission evidence, pending review and excused work remain complete", () => {
  for (const evidence of [
    { submitted_at: "2026-11-06T20:00:00Z" }, { attempt: 1 },
    { submission_type: "online_url" }, { workflow_state: "submitted" },
    { workflow_state: "pending_review" }, { excused: true },
  ]) {
    const assignment = { ...wayground, submission: { ...wayground.submission, ...evidence } };
    assert.equal(assignmentIsComplete(assignment), true, JSON.stringify(evidence));
    assert.equal(externalZeroNeedsAttention(assignment, Date.parse("2026-11-08T08:00:00Z")), false);
  }
});

test("other graded work and positive external scores preserve existing behavior", () => {
  assert.equal(assignmentIsComplete({ ...wayground, submission_types: ["on_paper"] }), true);
  assert.equal(assignmentIsComplete({ ...wayground, submission: { ...wayground.submission, score: 17 } }), true);
  assert.equal(assignmentIsComplete({ submission_types: ["external_tool"] }), false);
  for (const due_at of [null, "invalid"]) {
    assert.equal(externalZeroNeedsAttention({ ...wayground, due_at }), false);
  }
});
