import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const route = await readFile(new URL("../app/api/dashboard/enrichment/route.ts", import.meta.url), "utf8");
const start = route.indexOf("function classScheduleFromModules(");
const end = route.indexOf("\nfunction normalizeAnnouncement", start);
const parse = new Function(`${stripTypeScriptTypes(route.slice(start, end))}; return classScheduleFromModules;`)();

test("Canvas's enrolled section names restore all three missing class times", () => {
  for (const [id, name, section, days, time] of [
    [630, "Algebra I A - Hathaway", "Algebra I A (T/TH 12:45p - 1:45p)", ["Tuesday", "Thursday"], "12:45 PM–1:45 PM"],
    [628, "English 10 A", "English 10 A (M/W 2:00p - 3:00p)", ["Monday", "Wednesday"], "2:00 PM–3:00 PM"],
    [644, "World History A", "World History A (T/TH 2:00p - 3:00p)", ["Tuesday", "Thursday"], "2:00 PM–3:00 PM"],
  ]) {
    const meetings = parse([{ id, name }], new Map([[id, [{ id: 1, items: [{ title: section }] }]]]));
    assert.deepEqual(meetings.map((meeting) => [meeting.day, meeting.time]), days.map((day) => [day, time]));
  }
});

test("conflicting sections and times without AM or PM remain unknown", () => {
  const course = { id: 644, name: "World History A" };
  for (const titles of [["M/W 8:45 AM–9:45 AM", "T/TH 2:00p - 3:00p"], ["T/TH 2:00 - 3:00"]]) {
    assert.deepEqual(parse([course], new Map([[644, [{ id: 1, items: titles.map((title) => ({ title })) }]]])), []);
  }
});

test("a partial refresh keeps only the failed course's previous times", async () => {
  const dashboard = await readFile(new URL("../app/dashboard/DashboardHome.tsx", import.meta.url), "utf8");
  const start = dashboard.indexOf("function applyDashboardEnrichment(");
  const end = dashboard.indexOf("\nasync function runWithConcurrency", start);
  const apply = new Function(`${stripTypeScriptTypes(dashboard.slice(start, end))}; return applyDashboardEnrichment;`)();
  const current = { courses: [{ id: 1, name: "Biology" }, { id: 2, name: "English" }, { id: 3, name: "Old course" }],
    announcements: [], critical: [], upcoming: [], announcementPlaceholderCount: 0,
    week: [{ course: "Biology", time: "10 AM" }, { course: "English", time: "1 PM" }, { course: "Old course", time: "4 PM" }] };
  const result = apply(current, { announcements: [], itemPatches: [], scheduleUnavailableCourseIds: [1], week: [{ course: "English", time: "2 PM" }] });
  assert.deepEqual(result.week, [{ course: "English", time: "2 PM" }, { course: "Biology", time: "10 AM" }]);
});
