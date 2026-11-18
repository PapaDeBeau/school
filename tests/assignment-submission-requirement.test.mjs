import assert from "node:assert/strict";
import test from "node:test";
import { needsNoSubmission } from "../lib/assignment-submission-requirement.ts";
import { selectCourseTeacher } from "../lib/canvas-course-teacher.ts";

test("reading instructions identify work with no submission, including HTML", () => {
  for (const description of [
    "Nothing needs to be submitted for this reading assignment.",
    "You don't need to submit anything.",
    "No submission is required.",
    "This activity does not require a submission.",
    "Nothing to turn in.",
    "This task is for reading only.",
  ]) assert.equal(needsNoSubmission({ description }), true, description);
  assert.equal(needsNoSubmission({ descriptionHtml: "<strong>Nothing needs to be <em>submitted</em> for this reading assignment.</strong>" }), true);
  assert.equal(needsNoSubmission({ submissionTypes: ["none"] }), true);
});

test("reading titles and restrictions on a submission method do not clear required work", () => {
  for (const description of [
    "Read chapter 3 and submit your answers.",
    "No file upload is required. Complete the quiz online.",
    "Do not submit until you finish the reading.",
    "You don't need to submit your notes, but submit your essay.",
    "Nothing needs to be purchased.",
  ]) assert.equal(needsNoSubmission({ description }), false, description);
  assert.equal(needsNoSubmission({ submissionTypes: ["on_paper"] }), false);
  assert.equal(needsNoSubmission({ kind: "announcement", description: "No submission required" }), false);
});

test("teacher selection uses original course names and deduplicates identities", () => {
  const teacher = { id: 7, display_name: "Kristina Knox", avatar_image_url: "https://example.com/current-avatar" };
  assert.deepEqual(selectCourseTeacher({ name: "English", original_name: "English - Knox", teachers: [teacher, { id: 8, display_name: "Coordinator" }] }), { name: teacher.display_name, avatarUrl: teacher.avatar_image_url });
  assert.equal(selectCourseTeacher({ name: "English", teachers: [teacher, teacher] }).name, teacher.display_name);
  assert.equal(selectCourseTeacher({ name: "English", teachers: [teacher, { id: 8, display_name: "Another Teacher" }] }), undefined);
});
