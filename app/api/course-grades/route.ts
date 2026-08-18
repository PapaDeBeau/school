import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasSubmission = {
  assignment_id: number;
  submitted_at?: string | null;
  workflow_state?: string;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
  score?: number | null;
  grade?: string | null;
  assignment?: {
    id: number;
    name?: string;
    due_at?: string | null;
    points_possible?: number | null;
    html_url?: string;
    published?: boolean;
  };
};

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });
}

function validCanvasId(value: string | null) {
  return Boolean(value && /^[1-9]\d*$/.test(value));
}

function submissionStatus(submission: CanvasSubmission) {
  if (submission.excused) return "Excused";
  if (submission.missing) return "Missing";
  if (submission.late) return "Late";
  if (submission.workflow_state === "graded") return "Graded";
  if (submission.submitted_at || submission.workflow_state === "submitted") return "Submitted";
  return "Not submitted";
}

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();

  const courseId = new URL(request.url).searchParams.get("course_id");
  if (!validCanvasId(courseId)) return json({ error: "A valid Canvas course is required." }, { status: 400 });

  try {
    await ensureCanvasConnectionSchema();
    const [connection] = await getDb().select().from(canvasConnections).where(eq(canvasConnections.id, 1)).limit(1);
    if (!connection) return json({ error: "Canvas is not connected." }, { status: 409 });

    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    const submissions = await canvasGet<CanvasSubmission[]>(
      `/api/v1/courses/${courseId}/students/submissions?include[]=assignment&per_page=100`,
      token
    );

    const assignments = submissions
      .filter((submission) => submission.assignment?.published !== false)
      .map((submission) => {
        const assignment = submission.assignment;
        const pointsPossible = assignment?.points_possible ?? null;
        const percentage = submission.score !== null && submission.score !== undefined && pointsPossible
          ? (submission.score / pointsPossible) * 100
          : null;
        return {
          id: submission.assignment_id,
          name: assignment?.name?.trim() || "Canvas assignment",
          dueAt: assignment?.due_at ?? null,
          submittedAt: submission.submitted_at ?? null,
          status: submissionStatus(submission),
          score: submission.score ?? null,
          grade: submission.grade ?? null,
          pointsPossible,
          percentage,
          sourceUrl: assignment?.html_url ?? `${CANVAS_BASE_URL}/courses/${courseId}/assignments/${submission.assignment_id}`,
        };
      })
      .sort((a, b) => new Date(b.dueAt ?? 0).getTime() - new Date(a.dueAt ?? 0).getTime());

    return json({ assignments });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Canvas grades could not be loaded." }, { status: 500 });
  }
}
