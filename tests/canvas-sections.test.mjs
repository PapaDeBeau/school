import assert from "node:assert/strict";
import test from "node:test";
import { loadEnrolledCanvasSections } from "../lib/canvas-sections.ts";

test("reads only the student's unique enrolled sections", async () => {
  const requests = [];
  const result = await loadEnrolledCanvasSections(630, async (path) => {
    assert.match(path, /user_id=self/);
    return [
      { type: "StudentEnrollment", course_section_id: 4455 },
      { type: "StudentEnrollment", course_section_id: 4455 },
      { type: "TeacherEnrollment", course_section_id: 99 },
      { type: "StudentEnrollment", course_section_id: -1 },
    ];
  }, async (path) => {
    requests.push(path);
    return { id: 4455, course_id: 630, name: " Live T/Th 12:45 PM " };
  });
  assert.deepEqual(requests, ["/api/v1/courses/630/sections/4455"]);
  assert.deepEqual(result, { complete: true, sections: [{ id: 4455, name: "Live T/Th 12:45 PM" }] });
});

test("does not use another course's section and reports failed reads", async () => {
  const result = await loadEnrolledCanvasSections(630, async () => [
    { type: "StudentEnrollment", course_section_id: 1 },
    { type: "StudentEnrollment", course_section_id: 2 },
  ], async (path) => {
    if (path.endsWith("/1")) return { id: 1, course_id: 999, name: "M/W 2 PM" };
    throw new Error("Section unavailable");
  });
  assert.deepEqual(result, { complete: false, sections: [] });
});

test("enrollment failures are distinct from no student section", async () => {
  const unused = async () => { throw new Error("Should not request a section"); };
  assert.deepEqual(await loadEnrolledCanvasSections(630, async () => { throw new Error("Unavailable"); }, unused), { sections: [], complete: false });
  assert.deepEqual(await loadEnrolledCanvasSections(630, async () => [], unused), { sections: [], complete: true });
});
