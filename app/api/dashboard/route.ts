import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getChatAudioBucket, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasCourse = {
  id: number;
  name: string;
  course_code?: string;
  enrollments?: Array<{
    computed_current_score?: number | null;
    computed_current_grade?: string | null;
  }>;
  teachers?: Array<{
    id?: number;
    display_name?: string;
    avatar_image_url?: string | null;
  }>;
};

type CourseTeacher = { name: string | null; avatarUrl: string | null };

type PlannerItem = {
  course_id?: number;
  context_name?: string;
  html_url?: string;
  plannable_id?: number | string;
  plannable_date?: string;
  plannable_type?: string;
  planner_override?: {
    assignment_id?: number | null;
  } | null;
  plannable?: {
    id?: number;
    assignment_id?: number | null;
    title?: string;
    description?: string | null;
    message?: string | null;
    details?: string | null;
    body?: string | null;
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
  submissions?: {
    submitted?: boolean;
    graded?: boolean;
    missing?: boolean;
    late?: boolean;
    excused?: boolean;
  };
};

type Conversation = {
  id: number;
  subject?: string;
  last_message?: string;
  last_message_at?: string;
  start_at?: string;
  context_name?: string;
  workflow_state?: string;
  participants?: Array<{ id: number; name?: string }>;
};

type CanvasAnnouncement = {
  id: number;
  title?: string;
  message?: string | null;
  html_url?: string;
  posted_at?: string | null;
  published?: boolean;
  context_code?: string;
  author?: {
    display_name?: string;
    avatar_image_url?: string | null;
  } | null;
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

type ActionItem = {
  id: string;
  kind: "assignment" | "announcement" | "message";
  canvasCourseId: number | null;
  canvasItemId: number | null;
  canvasItemType: string | null;
  title: string;
  course: string;
  dueAt: string | null;
  points: number | null;
  state: string;
  detail: string;
  sourceUrl: string;
  description: string;
  descriptionHtml: string;
  availableFrom: string | null;
  availableUntil: string | null;
  submissionTypes: string[];
  allowedExtensions: string[];
  gradingType: string | null;
  allowedAttempts: number | null;
  published: boolean | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  audioUrl: string | null;
};

const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });
}

function dateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function pacificDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function canvasHtmlToText(value?: string | null) {
  if (!value) return "";
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
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

function canvasRichContent(item: PlannerItem) {
  const candidates = [
    item.plannable?.description,
    item.plannable?.message,
    item.plannable?.details,
    item.plannable?.body,
  ];
  return candidates.find((value) => value?.trim())?.trim() ?? "";
}

function detailIdForPlannerItem(item: PlannerItem, source: string) {
  const discussionTopicId = source.match(/\/courses\/\d+\/discussion_topics\/(\d+)/i)?.[1];
  if (discussionTopicId) return Number(discussionTopicId);
  const urlAssignmentId = source.match(/\/courses\/\d+\/assignments\/(\d+)/i)?.[1];
  if (urlAssignmentId) return Number(urlAssignmentId);
  if (item.plannable?.assignment_id) return item.plannable.assignment_id;
  if (item.planner_override?.assignment_id) return item.planner_override.assignment_id;
  const plannerId = Number(item.plannable_id ?? item.plannable?.id);
  return Number.isSafeInteger(plannerId) && plannerId > 0 ? plannerId : null;
}

function normalizePlannerItem(item: PlannerItem, courseNames: Map<number, string>, courseTeachers: Map<number, CourseTeacher>): ActionItem | null {
  const itemType = item.plannable_type?.toLocaleLowerCase("en-US") ?? "";
  if (itemType === "announcement") return null;

  const title = item.plannable?.title?.trim();
  if (!title) return null;

  const submission = item.submissions;
  if (submission?.submitted || submission?.graded || submission?.excused) return null;

  const dueAt = item.plannable?.due_at ?? item.plannable_date ?? null;
  const unlockAt = item.plannable?.unlock_at ? new Date(item.plannable.unlock_at) : null;
  const locked = unlockAt ? unlockAt.getTime() > Date.now() : false;
  const state = submission?.missing
    ? "missing"
    : locked
      ? "locked"
      : submission?.late
        ? "late"
        : "open";
  const course =
    (item.course_id ? courseNames.get(item.course_id) : undefined) ??
    item.context_name ??
    "Canvas";
  const source = item.html_url ?? item.plannable?.html_url ?? CANVAS_BASE_URL;
  const descriptionHtml = canvasRichContent(item);
  const canvasItemId = detailIdForPlannerItem(item, source);
  const canvasItemType = itemType || null;
  const teacher = item.course_id ? courseTeachers.get(item.course_id) : undefined;

  return {
    id: `assignment-${item.course_id ?? "canvas"}-${item.plannable?.id ?? title}`,
    kind: "assignment",
    canvasCourseId: item.course_id ?? null,
    canvasItemId,
    canvasItemType,
    title,
    course,
    dueAt,
    points: item.plannable?.points_possible ?? null,
    state,
    detail: locked && unlockAt ? `Unlocks ${unlockAt.toISOString()}` : state,
    sourceUrl: source.startsWith("http") ? source : `${CANVAS_BASE_URL}${source}`,
    description: canvasHtmlToText(descriptionHtml),
    descriptionHtml,
    availableFrom: item.plannable?.unlock_at ?? null,
    availableUntil: item.plannable?.lock_at ?? null,
    submissionTypes: item.plannable?.submission_types ?? [],
    allowedExtensions: item.plannable?.allowed_extensions ?? [],
    gradingType: item.plannable?.grading_type ?? null,
    allowedAttempts: item.plannable?.allowed_attempts ?? null,
    published: item.plannable?.published ?? null,
    authorName: teacher?.name ?? null,
    authorAvatarUrl: teacher?.avatarUrl ?? null,
    audioUrl: null,
  };
}

function normalizeAnnouncement(item: PlannerItem, courseNames: Map<number, string>): ActionItem | null {
  const itemType = item.plannable_type?.toLocaleLowerCase("en-US") ?? "";
  if (itemType !== "announcement") return null;

  const title = item.plannable?.title?.trim();
  if (!title) return null;

  const course =
    (item.course_id ? courseNames.get(item.course_id) : undefined) ??
    item.context_name ??
    "Canvas";
  const source = item.html_url ?? item.plannable?.html_url ?? CANVAS_BASE_URL;
  const descriptionHtml = canvasRichContent(item);

  return {
    id: `announcement-${item.course_id ?? "canvas"}-${item.plannable?.id ?? item.plannable_id ?? title}`,
    kind: "announcement",
    canvasCourseId: item.course_id ?? null,
    canvasItemId: detailIdForPlannerItem(item, source),
    canvasItemType: "announcement",
    title,
    course,
    dueAt: item.plannable_date ?? null,
    points: null,
    state: "announcement",
    detail: "Canvas announcement",
    sourceUrl: source.startsWith("http") ? source : `${CANVAS_BASE_URL}${source}`,
    description: canvasHtmlToText(descriptionHtml),
    descriptionHtml,
    availableFrom: null,
    availableUntil: null,
    submissionTypes: [],
    allowedExtensions: [],
    gradingType: null,
    allowedAttempts: null,
    published: item.plannable?.published ?? null,
    authorName: null,
    authorAvatarUrl: null,
    audioUrl: null,
  };
}

function normalizeCanvasAnnouncement(item: CanvasAnnouncement, courseNames: Map<number, string>): ActionItem | null {
  const title = item.title?.trim();
  if (!title) return null;
  const courseId = Number(item.context_code?.match(/^course_(\d+)$/)?.[1] ?? 0) || null;
  const descriptionHtml = item.message?.trim() ?? "";
  const source = item.html_url ?? (courseId ? `${CANVAS_BASE_URL}/courses/${courseId}/discussion_topics/${item.id}` : CANVAS_BASE_URL);

  return {
    id: `announcement-${courseId ?? "canvas"}-${item.id}`,
    kind: "announcement",
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
    submissionTypes: [],
    allowedExtensions: [],
    gradingType: null,
    allowedAttempts: null,
    published: item.published ?? null,
    authorName: item.author?.display_name?.trim() || null,
    authorAvatarUrl: item.author?.avatar_image_url?.trim() || null,
    audioUrl: null,
  };
}

function classSchedule() {
  return [
    { day: "Monday", time: "8:45–9:45 AM", course: "World History A", note: "Section needs confirmation", tentative: true },
    { day: "Monday", time: "10:00–11:00 AM", course: "Biology A - Baier", note: "Live class", tentative: false },
    { day: "Monday", time: "2:00–3:00 PM", course: "English 10 A", note: "Live class", tentative: false },
    { day: "Tuesday", time: "12:45 PM", course: "Algebra I A - Hathaway", note: "End time not listed", tentative: true },
    { day: "Wednesday", time: "8:45–9:45 AM", course: "World History A", note: "Section needs confirmation", tentative: true },
    { day: "Wednesday", time: "10:00–11:00 AM", course: "Biology A - Baier", note: "Live class", tentative: false },
    { day: "Wednesday", time: "2:00–3:00 PM", course: "English 10 A", note: "Live class", tentative: false },
    { day: "Thursday", time: "12:45 PM", course: "Algebra I A - Hathaway", note: "End time not listed", tentative: true },
  ];
}

function isCanvas406(error: unknown) {
  return error instanceof Error && error.message.includes("status 406");
}

async function canvasGetWithFallback<T>(primaryPath: string, fallbackPath: string, token: string) {
  try {
    return await canvasGet<T>(primaryPath, token);
  } catch (error) {
    if (!isCanvas406(error)) throw error;
    return canvasGet<T>(fallbackPath, token);
  }
}

async function optionalCanvasGet<T>(primaryPath: string, fallbackPath: string, token: string, empty: T) {
  try {
    return await canvasGetWithFallback<T>(primaryPath, fallbackPath, token);
  } catch {
    return empty;
  }
}

async function enrichDueAssignmentInstructions(items: ActionItem[], token: string) {
  const assignmentsByCourse = new Map<number, Set<number>>();
  const discussionItems = new Map<string, { courseId: number; itemId: number }>();
  for (const item of items) {
    if (
      item.kind !== "assignment"
      || !item.canvasCourseId
      || !item.canvasItemId
    ) continue;
    if (item.canvasItemType?.toLocaleLowerCase("en-US") === "discussion_topic") {
      discussionItems.set(`${item.canvasCourseId}:${item.canvasItemId}`, {
        courseId: item.canvasCourseId,
        itemId: item.canvasItemId,
      });
      continue;
    }
    const ids = assignmentsByCourse.get(item.canvasCourseId) ?? new Set<number>();
    ids.add(item.canvasItemId);
    assignmentsByCourse.set(item.canvasCourseId, ids);
  }

  const details = new Map<string, CanvasAssignmentDetails>();
  await Promise.all([
    ...[...assignmentsByCourse].map(async ([courseId, itemIds]) => {
      const params = new URLSearchParams({ per_page: "100" });
      [...itemIds].forEach((itemId) => params.append("assignment_ids[]", String(itemId)));
      const assignments = await canvasGet<CanvasAssignmentDetails[]>(
        `/api/v1/courses/${courseId}/assignments?${params.toString()}`,
        token
      ).catch(() => []);
      assignments.forEach((assignment) => details.set(`assignment:${courseId}:${assignment.id}`, assignment));
    }),
    ...[...discussionItems.values()].map(async ({ courseId, itemId }) => {
      const topic = await canvasGet<CanvasDiscussionDetails>(
        `/api/v1/courses/${courseId}/discussion_topics/${itemId}`,
        token
      ).catch(() => null);
      if (!topic) return;
      details.set(`discussion_topic:${courseId}:${itemId}`, {
        id: itemId,
        description: topic.message,
        html_url: topic.html_url,
        published: topic.published,
      });
    }),
  ]);

  if (!details.size) return items;
  return items.map((item) => {
    if (!item.canvasCourseId || !item.canvasItemId) return item;
    const itemType = item.canvasItemType?.toLocaleLowerCase("en-US") === "discussion_topic"
      ? "discussion_topic"
      : "assignment";
    const assignment = details.get(`${itemType}:${item.canvasCourseId}:${item.canvasItemId}`);
    if (!assignment) return item;
    const descriptionHtml = assignment.description?.trim() ?? "";
    return {
      ...item,
      descriptionHtml,
      description: canvasHtmlToText(descriptionHtml),
      dueAt: assignment.due_at ?? item.dueAt,
      points: assignment.points_possible ?? item.points,
      sourceUrl: assignment.html_url
        ? assignment.html_url.startsWith("http") ? assignment.html_url : `${CANVAS_BASE_URL}${assignment.html_url}`
        : item.sourceUrl,
      availableFrom: assignment.unlock_at ?? item.availableFrom,
      availableUntil: assignment.lock_at ?? item.availableUntil,
      submissionTypes: assignment.submission_types ?? item.submissionTypes,
      allowedExtensions: assignment.allowed_extensions ?? item.allowedExtensions,
      gradingType: assignment.grading_type ?? item.gradingType,
      allowedAttempts: assignment.allowed_attempts ?? item.allowedAttempts,
      published: assignment.published ?? item.published,
    };
  });
}

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  const familyUser = await readFamilySession(request);
  if (!familyUser) return familyUnauthorizedResponse();
  try {
    await ensureCanvasConnectionSchema();
    const [connection] = await getDb()
      .select()
      .from(canvasConnections)
      .where(eq(canvasConnections.id, 1))
      .limit(1);

    if (!connection) {
      return json({ error: "Canvas is not connected." }, { status: 409 });
    }

    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    const plannerPath =
      `/api/v1/planner/items?start_date=${dateOffset(-14)}` +
      `&end_date=${dateOffset(14)}&filter=incomplete_items&per_page=100`;

    const [courses, plannerItems, unreadConversations] = await Promise.all([
      canvasGetWithFallback<CanvasCourse[]>(
        "/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=teachers&per_page=100",
        "/api/v1/courses?enrollment_state=active&per_page=100",
        token
      ),
      optionalCanvasGet<PlannerItem[]>(
        plannerPath,
        `/api/v1/planner/items?start_date=${dateOffset(-14)}&end_date=${dateOffset(14)}&per_page=100`,
        token,
        []
      ),
      optionalCanvasGet<Conversation[]>(
        "/api/v1/conversations?scope=unread&per_page=50",
        "/api/v1/conversations?scope=unread",
        token,
        []
      ),
    ]);

    const courseNames = new Map(courses.map((course) => [course.id, course.name]));
    const courseTeachers = new Map(courses.map((course) => {
      const teacher = course.teachers?.[0];
      return [course.id, {
        name: teacher?.display_name?.trim() || null,
        avatarUrl: teacher?.avatar_image_url?.trim() || null,
      }] as const;
    }));
    const announcementParams = new URLSearchParams({
      start_date: dateOffset(-14),
      end_date: dateOffset(14),
      active_only: "true",
      per_page: "100",
    });
    courses.forEach((course) => announcementParams.append("context_codes[]", `course_${course.id}`));
    const canvasAnnouncements = courses.length
      ? await canvasGet<CanvasAnnouncement[]>(`/api/v1/announcements?${announcementParams.toString()}`, token).catch(() => [])
      : [];
    const assignments = plannerItems
      .map((item) => normalizePlannerItem(item, courseNames, courseTeachers))
      .filter((item): item is ActionItem => Boolean(item));
    const normalizedAnnouncements = (canvasAnnouncements.length
      ? canvasAnnouncements.map((item) => normalizeCanvasAnnouncement(item, courseNames))
      : plannerItems.map((item) => normalizeAnnouncement(item, courseNames)))
      .filter((item): item is ActionItem => Boolean(item))
      .sort((a, b) => new Date(b.dueAt ?? 0).getTime() - new Date(a.dueAt ?? 0).getTime());
    const announcements = await Promise.all(normalizedAnnouncements.map(async (item) => {
      if (!item.canvasCourseId || !item.canvasItemId) return item;
      const key = `announcements/${item.canvasCourseId}/${item.canvasItemId}.mp3`;
      const object = await getChatAudioBucket().head(key).catch(() => null);
      return object ? { ...item, audioUrl: `/api/announcements/audio?course_id=${item.canvasCourseId}&item_id=${item.canvasItemId}` } : item;
    }));
    const messages: ActionItem[] = unreadConversations.map((conversation) => ({
      id: `message-${conversation.id}`,
      kind: "message",
      canvasCourseId: null,
      canvasItemId: null,
      canvasItemType: null,
      title: conversation.subject?.trim() || "Canvas message",
      course: conversation.context_name ?? "Inbox",
      dueAt: conversation.last_message_at ?? conversation.start_at ?? null,
      points: null,
      state: "unread",
      detail: conversation.last_message?.trim() || "New unread message",
      sourceUrl: `${CANVAS_BASE_URL}/conversations#filter=type=inbox`,
      description: conversation.last_message?.trim() || "New unread Canvas message.",
      descriptionHtml: "",
      availableFrom: null,
      availableUntil: null,
      submissionTypes: [],
      allowedExtensions: [],
      gradingType: null,
      allowedAttempts: null,
      published: null,
      authorName: null,
      authorAvatarUrl: null,
      audioUrl: null,
    }));

    const now = new Date();
    const todayKey = pacificDateKey(now);
    const inSevenDays = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    const critical = [...messages, ...assignments.filter((item) => {
      if (!item.dueAt) return item.state === "missing";
      const due = new Date(item.dueAt);
      return due.getTime() < now.getTime() || pacificDateKey(due) === todayKey;
    })];
    const upcoming = assignments
      .filter((item) => {
        if (!item.dueAt || critical.some((criticalItem) => criticalItem.id === item.id)) return false;
        const due = new Date(item.dueAt).getTime();
        return due <= inSevenDays;
      })
      .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
    const enrichedDueItems = await enrichDueAssignmentInstructions([...critical, ...upcoming], token);
    const enrichedById = new Map(enrichedDueItems.map((item) => [item.id, item] as const));
    const enrichedCritical = critical.map((item) => enrichedById.get(item.id) ?? item);
    const enrichedUpcoming = upcoming.map((item) => enrichedById.get(item.id) ?? item);

    return json({
      generatedAt: new Date().toISOString(),
      viewer: familyUser,
      student: connection.displayName,
      courseCount: courses.length,
      unreadCount: unreadConversations.length,
      announcements,
      critical: enrichedCritical,
      upcoming: enrichedUpcoming,
      week: classSchedule(),
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        sourceUrl: `${CANVAS_BASE_URL}/courses/${course.id}`,
        grade: course.enrollments?.[0]?.computed_current_grade ?? null,
        score: course.enrollments?.[0]?.computed_current_score ?? null,
        teachers: (course.teachers ?? []).map((teacher) => ({
          id: teacher.id ? String(teacher.id) : null,
          name: teacher.display_name?.trim() || "Teacher",
          avatarUrl: teacher.avatar_image_url?.trim() || null,
        })),
      })),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "The dashboard could not sync with Canvas." },
      { status: 500 }
    );
  }
}
