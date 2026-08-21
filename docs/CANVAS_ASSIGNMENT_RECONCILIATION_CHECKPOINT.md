# Canvas assignment reconciliation checkpoint

Status: **Before the assignment-source reconciliation**

This checkpoint records the current working application before replacing the
Planner-based due-work calculation. The application source at commit
`42f4b03` is the rollback point for the existing behavior.

## Confirmed mismatch on August 20, 2026

- Canvas Course Work reported **11 Due**, **0 Missing**, and **17 Submitted**.
- Beau School displayed **8 due items** in its seven-day dashboard window.
- `VA Orientation Course (Attach Worksample)` in **Biology A - Garcia**, due
  tomorrow at 5:00 PM, appeared as not submitted in Canvas but was absent from
  Beau School. This is a confirmed omission.
- `Roll Call Attendance` in World History A is due September 15 and is outside
  Beau School's current seven-day window. Its absence is intentional and must
  not be confused with the Biology omission.
- Assignments with the same title exist in multiple courses and have different
  submission states. Titles alone must never be used to reconcile work.

## Current cause

The dashboard currently treats Canvas Planner Items with
`filter=incomplete_items` as the primary due-work source. Planner is intended
for planner/calendar presentation and can omit items that still exist in the
course assignment ledger.

## Required reconciliation rules

1. Build assignment truth from every active course's Canvas Assignments data,
   including Beau's current submission and effective assignment date.
2. Identify records by `course_id + assignment_id`, never by title.
3. Keep submitted, graded, excused, and pending-review work out of Due.
4. Preserve Beau's individual/section assignment overrides and effective due
   dates.
5. Apply the product's seven-day display window after Canvas records have been
   reconciled.
6. Continue using Planner only for supplementary planner/calendar information.
7. Add a separate Submitted summary without mixing submitted work into Due.

## Regression examples

- Biology A - Garcia / VA Orientation / due tomorrow: **must be Due** until
  submitted or excused.
- VA Orientation assignments already submitted in World History, English,
  Algebra, or Biology A - Baier: **must not be Due**.
- World History / Roll Call Attendance / September 15: **not in the seven-day
  dashboard**, unless the product window is deliberately expanded.

Do not change the due-work source until the replacement can be tested against
these examples and the current version remains available as a rollback.
