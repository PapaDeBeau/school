import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getChatAudioBucket, getDb } from "../../../../db";
import { canvasConnections } from "../../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

type CourseInput = {
  id: number;
  name: string;
  originalName: string | null;
  courseCode: string | null;
};

type ItemSelector = {
  id: string;
  courseId: number;
  itemId: number;
  itemType: "assignment" | "discussion_topic";
};

type CanvasAnnouncement = {
  id: number;
  title?: string;
  message?: string | null;
  html_url?: string;
  posted_at?: string | null;
  published?: boolean;
  context_code?: string;
  author?: { display_name?: string; avatar_image_url?: string | null } | null;
};

type CanvasCalendarEvent = {
  id: number;
  title?: string;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  all_day_date?: string | null;
  context_code?: string | null;
  type?: string;
};

type CanvasModule = {
  name?: string;
  items?: Array<{ title?: string; content_details?: { locked_for_user?: boolean } }>;
};

type CanvasAssignmentDetails = {
  id: number;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  html_url?: string;
  unlock_at?: string | null;
  lock_at?: string | null;
  submission_types?: string[];
  allowed_extensions?: string[];
  grading_type?: string | null;
  allowed_attempts?: number | null;
  published?: boolean;
};

type CanvasDiscussionDetails = {
  id: number;
  message?: string | null;
  html_url?: string;
  posted_at?: string | null;
  published?: boolean;
};

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...responseHeaders, ...init?.headers } });
}

function dateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function canvasHtmlToText(value?: string | null) {
  if (!value) return "";
  const entities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(div|p|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? `&${entity};`;
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function safePositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseCourses(value: unknown): CourseInput[] {
  if (!Array.isArray(value)) return [];
  const courses = new Map<number, CourseInput>();
  for (const raw of value.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const input = raw as Record<string, unknown>;
    const id = safePositiveInteger(input.id);
    const name = safeText(input.name, 300);
    if (!id || !name) continue;
    courses.set(id, {
      id,
      name,
      originalName: safeText(input.originalName, 500) || null,
      courseCode: safeText(input.courseCode, 300) || null,
    });
  }
  return [...courses.values()];
}

function parseSelectors(value: unknown, allowedCourseIds: Set<number>): ItemSelector[] {
  if (!Array.isArray(value)) return [];
  const selectors = new Map<string, ItemSelector>();
  for (const raw of value.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const input = raw as Record<string, unknown>;
    const id = safeText(input.id, 300);
    const courseId = safePositiveInteger(input.courseId);
    const itemId = safePositiveInteger(input.itemId);
    if (!id || !courseId || !itemId || !allowedCourseIds.has(courseId)) continue;
    const itemType = safeText(input.itemType, 80).toLocaleLowerCase("en-US") === "discussion_topic"
      ? "discussion_topic"
      : "assignment";
    selectors.set(id, { id, courseId, itemId, itemType });
  }
  return [...selectors.values()];
}

async function mapWithConcurrency<T, R>(values: T[], limit: number, task: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await task(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function classSchedule(events: CanvasCalendarEvent[], courseNames: Map<number, string>) {
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TIME_ZONE, weekday: "long" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  const dayOrder = new Map(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => [day, index]));
  const meetings = events.flatMap((event) => {
    const courseId = Number(event.context_code?.match(/^course_(\d+)$/)?.[1] ?? 0);
    const course = courseNames.get(courseId);
    const startValue = event.start_at ?? event.all_day_date;
    if (!course || !startValue) return [];
    const start = new Date(startValue);
    if (!Number.isFinite(start.getTime())) return [];
    const end = event.end_at ? new Date(event.end_at) : null;
    const hasEnd = Boolean(end && Number.isFinite(end.getTime()) && end.getTime() > start.getTime());
    const time = event.all_day
      ? "All day"
      : hasEnd
        ? `${timeFormatter.format(start)}–${timeFormatter.format(end!)}`
        : timeFormatter.format(start);
    return [{
      day: dayFormatter.format(start),
      time,
      course,
      note: event.title?.trim() || "Canvas calendar event",
      tentative: !event.all_day && !hasEnd,
      sortTime: start.getTime(),
    }];
  });
  const unique = new Map<string, (typeof meetings)[number]>();
  meetings.forEach((meeting) => unique.set(`${meeting.day}|${meeting.time}|${meeting.course}`, meeting));
  return [...unique.values()]
    .sort((left, right) => (dayOrder.get(left.day) ?? 7) - (dayOrder.get(right.day) ?? 7) || left.sortTime - right.sortTime)
    .map(({ sortTime: _sortTime, ...meeting }) => meeting);
}

function classScheduleFromModules(courses: CourseInput[], modulesByCourse: Map<number, CanvasModule[]>) {
  const dayOrder = new Map(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => [day, index]));
  const meetings: Array<{ day: string; time: string; course: string; note: string; tentative: boolean }> = [];
  for (const course of courses) {
    const modules = modulesByCourse.get(course.id) ?? [];
    const scheduleItems = [
      ...(course.originalName ? [{ title: course.originalName }] : []),
      ...(course.courseCode ? [{ title: course.courseCode }] : []),
      ...modules.flatMap((module) => [
        ...(module.name ? [{ title: module.name }] : []),
        ...(module.items ?? []).filter((item) => !item.content_details?.locked_for_user),
      ]),
    ].flatMap((item) => {
      const title = item.title?.replace(/\s+/g, " ").trim() ?? "";
      const match = title.match(/\b(M\s*\/\s*W|T\s*\/\s*Th)\b[^\d]*(\d{1,2}(?::\d{2})?\s*(?:[ap](?:\.?m\.?)?)?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:[ap](?:\.?m\.?)?)?)?)/i);
      return match ? [{ title, daysText: match[1], timeText: match[2] }] : [];
    });
    const preferredSectionIndex = /world history/i.test(course.name) ? 1 : 0;
    const scheduleItem = scheduleItems[preferredSectionIndex] ?? scheduleItems[0];
    if (!scheduleItem) continue;
    const days = /^M/i.test(scheduleItem.daysText) ? ["Monday", "Wednesday"] : ["Tuesday", "Thursday"];
    let time = scheduleItem.timeText
      .replace(/\s*-\s*/g, "–")
      .replace(/(\d)\s*([ap])(?:\.?m\.?)?/gi, (_value, digit: string, meridiem: string) => `${digit} ${meridiem.toUpperCase()}M`)
      .replace(/\s+/g, " ")
      .trim();
    if (!/[AP]M/i.test(time)) {
      time = time.replace(/\b(\d{1,2})(?=\s*(?:–|$))/g, "$1:00");
      time = `${time} PM`;
    }
    const hasEnd = time.includes("–");
    days.forEach((day) => meetings.push({ day, time, course: course.name, note: "Canvas Zoom class", tentative: !hasEnd }));
  }
  return meetings.sort((left, right) => (dayOrder.get(left.day) ?? 7) - (dayOrder.get(right.day) ?? 7));
}

function normalizeAnnouncement(item: CanvasAnnouncement, courseNames: Map<number, string>, audioKeys: Set<string>) {
  const title = item.title?.trim();
  if (!title) return null;
  const courseId = Number(item.context_code?.match(/^course_(\d+)$/)?.[1] ?? 0) || null;
  const descriptionHtml = item.message?.trim() ?? "";
  const source = item.html_url ?? (courseId ? `${CANVAS_BASE_URL}/courses/${courseId}/discussion_topics/${item.id}` : CANVAS_BASE_URL);
  const key = courseId ? `announcements/v4/${courseId}/${item.id}.mp3` : "";
  return {
    id: `announcement-${courseId ?? "canvas"}-${item.id}`,
    kind: "announcement" as const,
    canvasCourseId: courseId,
    canvasItemId: item.id,
    canvasItemType: "announcement",
    title,
    course: (courseId ? courseNames.get(courseId) : undefined) ?? "Canvas",
    dueAt: item.posted_at ?? null,
    points: null,
    state: "announcement",
    detail: "Canvas announcement",
    sourceUrl: source.startsWith("http") ? source : `${CANVAS_BASE_URL}${source}`,
    description: canvasHtmlToText(descriptionHtml),
    descriptionHtml,
    availableFrom: null,
    availableUntil: null,
    submissionTypes: [] as string[],
    allowedExtensions: [] as string[],
    gradingType: null,
    allowedAttempts: null,
    published: item.published ?? null,
    authorName: item.author?.display_name?.trim() || null,
    authorAvatarUrl: item.author?.avatar_image_url?.trim() || null,
    audioUrl: courseId && audioKeys.has(key)
      ? `/api/announcements/audio?course_id=${courseId}&item_id=${item.id}&v=4`
      : null,
  };
}

async function listAudioKeys(prefix: string) {
  const bucket = getChatAudioBucket();
  const keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    page.objects.forEach((object) => keys.add(object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function assignmentPatches(selectors: ItemSelector[], token: string) {
  const assignmentsByCourse = new Map<number, Set<number>>();
  const discussions: ItemSelector[] = [];
  for (const selector of selectors) {
    if (selector.itemType === "discussion_topic") {
      discussions.push(selector);
      continue;
    }
    const ids = assignmentsByCourse.get(selector.courseId) ?? new Set<number>();
    ids.add(selector.itemId);
    assignmentsByCourse.set(selector.courseId, ids);
  }

  const details = new Map<string, CanvasAssignmentDetails>();
  const assignmentEntries = [...assignmentsByCourse];
  await Promise.all([
    mapWithConcurrency(assignmentEntries, 3, async ([courseId, itemIds]) => {
      const params = new URLSearchParams({ per_page: "100" });
      [...itemIds].forEach((itemId) => params.append("assignment_ids[]", String(itemId)));
      const assignments = await canvasGet<CanvasAssignmentDetails[]>(`/api/v1/courses/${courseId}/assignments?${params.toString()}`, token).catch(() => []);
      assignments.forEach((assignment) => details.set(`assignment:${courseId}:${assignment.id}`, assignment));
    }),
    mapWithConcurrency(discussions, 3, async (selector) => {
      const topic = await canvasGet<CanvasDiscussionDetails>(`/api/v1/courses/${selector.courseId}/discussion_topics/${selector.itemId}`, token).catch(() => null);
      if (!topic) return;
      details.set(`discussion_topic:${selector.courseId}:${selector.itemId}`, {
        id: selector.itemId,
        description: topic.message,
        html_url: topic.html_url,
        published: topic.published,
      });
    }),
  ]);

  return selectors.map((selector) => {
    const key = `${selector.itemType}:${selector.courseId}:${selector.itemId}`;
    const detail = details.get(key);
    if (!detail) return { id: selector.id };
    const descriptionHtml = detail.description?.trim() ?? "";
    return {
      id: selector.id,
      descriptionHtml,
      description: canvasHtmlToText(descriptionHtml),
      hasTeacherInstructions: Boolean(canvasHtmlToText(descriptionHtml)),
    };
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  const familyUser = await readFamilySession(request);
  if (!familyUser) return familyUnauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const syncId = safeText(payload.syncId, 100);
    const courses = parseCourses(payload.courses);
    const selectors = parseSelectors(payload.items, new Set(courses.map((course) => course.id)));

    await ensureCanvasConnectionSchema();
    const [connection] = await getDb().select().from(canvasConnections).where(eq(canvasConnections.id, 1)).limit(1);
    if (!connection) return json({ error: "Canvas is not connected." }, { status: 409 });
    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    const courseNames = new Map(courses.map((course) => [course.id, course.name]));

    const calendarParams = new URLSearchParams({ type: "event", start_date: dateOffset(-7), end_date: dateOffset(14), per_page: "100" });
    courses.forEach((course) => calendarParams.append("context_codes[]", `course_${course.id}`));
    const unfilteredCalendarParams = new URLSearchParams({ type: "event", start_date: dateOffset(-7), end_date: dateOffset(14), per_page: "100" });
    const announcementParams = new URLSearchParams({ start_date: dateOffset(-14), end_date: dateOffset(14), active_only: "true", per_page: "100" });
    courses.forEach((course) => announcementParams.append("context_codes[]", `course_${course.id}`));

    const [calendarEvents, upcomingEvents, moduleEntries, canvasAnnouncements, rawItemPatches, assignmentAudioKeys, announcementAudioKeys] = await Promise.all([
      courses.length
        ? canvasGet<CanvasCalendarEvent[]>(`/api/v1/calendar_events?${calendarParams.toString()}`, token)
            .catch(() => canvasGet<CanvasCalendarEvent[]>(`/api/v1/calendar_events?${unfilteredCalendarParams.toString()}`, token))
            .catch(() => [])
        : Promise.resolve([]),
      courses.length
        ? canvasGet<CanvasCalendarEvent[]>("/api/v1/users/self/upcoming_events?per_page=100", token).catch(() => [])
        : Promise.resolve([]),
      mapWithConcurrency(courses, 3, async (course) => [
        course.id,
        await canvasGet<CanvasModule[]>(`/api/v1/courses/${course.id}/modules?include[]=items&include[]=content_details&per_page=100`, token).catch(() => []),
      ] as const),
      courses.length
        ? canvasGet<CanvasAnnouncement[]>(`/api/v1/announcements?${announcementParams.toString()}`, token).catch(() => [])
        : Promise.resolve([]),
      assignmentPatches(selectors, token),
      listAudioKeys("assignments/v1/").catch(() => new Set<string>()),
      listAudioKeys("announcements/v4/").catch(() => new Set<string>()),
    ]);

    const selectorById = new Map(selectors.map((selector) => [selector.id, selector] as const));
    const patches = rawItemPatches.map((patch) => {
      const selector = selectorById.get(patch.id);
      if (!selector) return patch;
      const audioKey = `assignments/v1/${selector.courseId}/${selector.itemId}.mp3`;
      return {
        ...patch,
        audioUrl: assignmentAudioKeys.has(audioKey)
          ? `/api/assignments/audio?course_id=${selector.courseId}&item_id=${selector.itemId}&v=1`
          : null,
      };
    });
    const modulesByCourse = new Map(moduleEntries);
    const moduleSchedule = classScheduleFromModules(courses, modulesByCourse);
    const moduleScheduledCourses = new Set(moduleSchedule.map((meeting) => meeting.course));
    const calendarSchedule = classSchedule([
      ...calendarEvents,
      ...upcomingEvents.filter((event) => event.type?.toLocaleLowerCase("en-US") !== "assignment"),
    ], courseNames).filter((meeting) => !moduleScheduledCourses.has(meeting.course));
    const announcements = canvasAnnouncements
      .map((item) => normalizeAnnouncement(item, courseNames, announcementAudioKeys))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => new Date(right.dueAt ?? 0).getTime() - new Date(left.dueAt ?? 0).getTime());

    return json({
      syncId,
      generatedAt: new Date().toISOString(),
      announcements,
      itemPatches: patches,
      week: [...moduleSchedule, ...calendarSchedule],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Dashboard details could not be refreshed." }, { status: 500 });
  }
}
