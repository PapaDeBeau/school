import assert from "node:assert/strict";
import test from "node:test";
import { isInDashboardDateWindow } from "../lib/dashboard-date-window.ts";

const now = new Date("2026-11-07T10:00:00Z");

test("seven days back and forward include whole Pacific days across DST", () => {
  for (const due of ["2026-10-31T07:00:00Z", "2026-11-07T07:59:59Z", "2026-11-15T07:59:59Z"]) {
    assert.equal(isInDashboardDateWindow(due, now), true, due);
  }
  for (const due of ["2026-10-31T06:59:59Z", "2026-11-15T08:00:00Z", null, "invalid"]) {
    assert.equal(isInDashboardDateWindow(due, now), false, String(due));
  }
});

test("November 7 audit keeps the two recent flags and excludes the eight old flags", () => {
  const flaggedDueDates = [
    "2026-09-19T06:59:59Z", "2026-10-01T06:59:59Z", "2026-10-03T06:59:59Z",
    "2026-10-03T06:59:59Z", "2026-10-08T06:59:59Z", "2026-10-09T06:59:59Z",
    "2026-10-24T06:59:59Z", "2026-10-31T06:59:59Z",
    "2026-11-05T07:59:59Z", "2026-11-07T07:59:59Z",
  ];
  assert.deepEqual(flaggedDueDates.filter((due) => isInDashboardDateWindow(due, now)), flaggedDueDates.slice(-2));
});

test("window advances at Pacific midnight, not UTC midnight", () => {
  const due = "2026-10-31T07:00:00Z";
  assert.equal(isInDashboardDateWindow(due, new Date("2026-11-08T07:59:59Z")), true);
  assert.equal(isInDashboardDateWindow(due, new Date("2026-11-08T08:00:00Z")), false);
});
