import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasCourse = {
  id: number;
  name: string;
  course_code?: string;
  enrollments?: Array<{
    computed_current_score?: number | null;
    computed_current_grade?: string | null;
  }>;
};

type PlannerItem = {
  course_id?: number;
  context_name?: string;
  html_url?: string;
  plannable_date?: string;
  plannable_type?: string;
  plannable?: {
    id?: number;
    title?: string;
    due_at?: string | null;
    points_possible?: number | null;
    html_url?: string;
    unlock_at?: string | null;
    lock_at?: string | null;
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
  kind: "assignment" | "message";
  title: string;
  course: string;
  dueAt: string | null;
  points: number | null;
  state: string;
  detail: string;
  sourceUrl: string;
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

function normalizePlannerItem(item: PlannerItem, courseNames: Map<number, string>): ActionItem | null {
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

  return {
    id: `assignment-${item.course_id ?? "canvas"}-${item.plannable?.id ?? title}`,
    kind: "assignment",
    title,
    course,
    dueAt,
    points: item.plannable?.points_possible ?? null,
    state,
    detail: locked && unlockAt ? `Unlocks ${unlockAt.toISOString()}` : state,
    sourceUrl: source.startsWith("http") ? source : `${CANVAS_BASE_URL}${source}`,
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

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  try {
    await ensureCanvasConnectionSchema();
    const [connection] = await getDb()
      .select()
      .from(canvasConnections)
      .where(eq(canvasConnections.id, 1))
      .limit(1);

    if (!connection) {
      return json({ error: "Canvas is not connected." }, { status: 401 });
    }

    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    const plannerPath =
      `/api/v1/planner/items?start_date=${dateOffset(-14)}` +
      `&end_date=${dateOffset(14)}&filter=incomplete_items&per_page=100`;

    const [courses, plannerItems, unreadConversations] = await Promise.all([
      canvasGet<CanvasCourse[]>(
        "/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100",
        token
      ),
      canvasGet<PlannerItem[]>(plannerPath, token),
      canvasGet<Conversation[]>(
        "/api/v1/conversations?scope=unread&per_page=50",
        token
      ),
    ]);

    const courseNames = new Map(courses.map((course) => [course.id, course.name]));
    const assignments = plannerItems
      .map((item) => normalizePlannerItem(item, courseNames))
      .filter((item): item is ActionItem => Boolean(item));
    const messages: ActionItem[] = unreadConversations.map((conversation) => ({
      id: `message-${conversation.id}`,
      kind: "message",
      title: conversation.subject?.trim() || "Canvas message",
      course: conversation.context_name ?? "Inbox",
      dueAt: conversation.last_message_at ?? conversation.start_at ?? null,
      points: null,
      state: "unread",
      detail: conversation.last_message?.trim() || "New unread message",
      sourceUrl: `${CANVAS_BASE_URL}/conversations#filter=type=inbox`,
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

    return json({
      generatedAt: new Date().toISOString(),
      student: connection.displayName,
      courseCount: courses.length,
      unreadCount: unreadConversations.length,
      critical,
      upcoming,
      week: classSchedule(),
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        grade: course.enrollments?.[0]?.computed_current_grade ?? null,
        score: course.enrollments?.[0]?.computed_current_score ?? null,
      })),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "The dashboard could not sync with Canvas." },
      { status: 500 }
    );
  }
}
