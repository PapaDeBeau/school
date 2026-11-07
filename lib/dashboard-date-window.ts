const pacificDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
});

function dayNumber(date: Date) {
  const parts = pacificDayFormat.formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

// Inclusive Pacific calendar days, so DST and the current time of day cannot
// hide work due early/late on either boundary date. Undated work stays in Grades.
export function isInDashboardDateWindow(dueAt: string | null | undefined, now: Date) {
  if (!dueAt || !Number.isFinite(now.getTime())) return false;
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return false;
  const daysFromToday = dayNumber(due) - dayNumber(now);
  return daysFromToday >= -7 && daysFromToday <= 7;
}
