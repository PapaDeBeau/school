import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasCourse = {
  id: number;
  name: string;
  original_name?: string;
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

type CanvasSubmission = {
  workflow_state?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  excused?: boolean;
  missing?: boolean;
  late?: boolean;
};

type CanvasAssignment = {
  id: number;
  name?: string;
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
  submission?: CanvasSubmission | null;
};

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
    start_at?: string | null;
    end_at?: string | null;
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

function submissionIsComplete(submission?: CanvasSubmission | null) {
  if (!submission) return false;
  const workflowState = submission.workflow_state?.trim().toLocaleLowerCase("en-US") ?? "";
  return submission.excused === true
    || Boolean(submission.submitted_at)
    || Boolean(submission.graded_at)
    || workflowState === "submitted"
    || workflowState === "graded"
    || workflowState === "pending_review";
}

function normalizeCanvasAssignment(
  assignment: CanvasAssignment,
  course: CanvasCourse,
  teacher?: CourseTeacher,
): ActionItem | null {
  const title = assignment.name?.trim();
  if (!title || assignment.published === false || submissionIsComplete(assignment.submission)) return null;

  const unlockAt = assignment.unlock_at ? new Date(assignment.unlock_at) : null;
  const locked = Boolean(unlockAt && Number.isFinite(unlockAt.getTime()) && unlockAt.getTime() > Date.now());
  const submission = assignment.submission;
  const state = submission?.missing
    ? "missing"
    : locked
      ? "locked"
      : submission?.late
        ? "late"
        : "open";
  const descriptionHtml = assignment.description?.trim() ?? "";
  const source = assignment.html_url ?? `${CANVAS_BASE_URL}/courses/${course.id}/assignments/${assignment.id}`;

  return {
    id: `assignment-${course.id}-${assignment.id}`,
    kind: "assignment",
    canvasCourseId: course.id,
    canvasItemId: assignment.id,
    canvasItemType: "assignment",
    title,
    course: course.name,
    dueAt: assignment.due_at ?? null,
    points: assignment.points_possible ?? null,
    state,
    detail: locked && unlockAt ? `Unlocks ${unlockAt.toISOString()}` : state,
    sourceUrl: source.startsWith("http") ? source : `${CANVAS_BASE_URL}${source}`,
    description: canvasHtmlToText(descriptionHtml),
    descriptionHtml,
    availableFrom: assignment.unlock_at ?? null,
    availableUntil: assignment.lock_at ?? null,
    submissionTypes: assignment.submission_types ?? [],
    allowedExtensions: assignment.allowed_extensions ?? [],
    gradingType: assignment.grading_type ?? null,
    allowedAttempts: assignment.allowed_attempts ?? null,
    published: assignment.published ?? null,
    authorName: teacher?.name ?? null,
    authorAvatarUrl: teacher?.avatarUrl ?? null,
    audioUrl: null,
  };
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

    const courseTeachers = new Map(courses.map((course) => {
      const teacher = course.teachers?.[0];
      return [course.id, {
        name: teacher?.display_name?.trim() || null,
        avatarUrl: teacher?.avatar_image_url?.trim() || null,
      }] as const;
    }));
    const courseAssignmentEntries = await mapWithConcurrency(courses, 6, async (course) => {
      const params = new URLSearchParams({ per_page: "100", order_by: "due_at" });
      params.append("include[]", "submission");
      const courseAssignments = await canvasGet<CanvasAssignment[]>(
        `/api/v1/courses/${course.id}/assignments?${params.toString()}`,
        token,
      );
      return [course, courseAssignments] as const;
    });
    const submittedCount = courseAssignmentEntries.reduce((count, [, courseAssignments]) => (
      count + courseAssignments.filter((assignment) => assignment.published !== false && submissionIsComplete(assignment.submission)).length
    ), 0);
    const assignments = courseAssignmentEntries.flatMap(([course, courseAssignments]) => {
      const teacher = courseTeachers.get(course.id);
      return courseAssignments
        .map((assignment) => normalizeCanvasAssignment(assignment, course, teacher))
        .filter((item): item is ActionItem => Boolean(item));
    });
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
    const generatedAt = new Date().toISOString();
    return json({
      generatedAt,
      syncId: generatedAt,
      enrichmentPending: true,
      announcementPlaceholderCount: Math.min(6, plannerItems.filter((item) => item.plannable_type?.toLocaleLowerCase("en-US") === "announcement").length),
      viewer: familyUser,
      student: connection.displayName,
      courseCount: courses.length,
      unreadCount: unreadConversations.length,
      submittedCount,
      announcements: [],
      critical,
      upcoming,
      week: [],
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        originalName: course.original_name ?? null,
        courseCode: course.course_code ?? null,
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
