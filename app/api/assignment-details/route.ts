import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasAssignment = {
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

type CanvasDiscussionTopic = {
  message?: string | null;
  html_url?: string;
  posted_at?: string | null;
  published?: boolean;
};

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });
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

function validCanvasId(value: string | null) {
  return Boolean(value && /^[1-9]\d*$/.test(value));
}

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();

  const url = new URL(request.url);
  const courseId = url.searchParams.get("course_id");
  const itemId = url.searchParams.get("item_id") ?? url.searchParams.get("assignment_id");
  const itemType = (url.searchParams.get("item_type") ?? "assignment").toLocaleLowerCase("en-US");
  if (!validCanvasId(courseId) || !validCanvasId(itemId)) {
    return json({ error: "A valid Canvas course and item are required." }, { status: 400 });
  }

  try {
    await ensureCanvasConnectionSchema();
    const [connection] = await getDb()
      .select()
      .from(canvasConnections)
      .where(eq(canvasConnections.id, 1))
      .limit(1);
    if (!connection) return json({ error: "Canvas is not connected." }, { status: 409 });

    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    if (itemType === "announcement" || itemType === "discussion_topic") {
      const topic = await canvasGet<CanvasDiscussionTopic>(
        `/api/v1/courses/${courseId}/discussion_topics/${itemId}`,
        token
      );
      const descriptionHtml = topic.message?.trim() ?? "";
      const sourceUrl = topic.html_url ?? `${CANVAS_BASE_URL}/courses/${courseId}/discussion_topics/${itemId}`;
      return json({
        item: {
          descriptionHtml,
          description: canvasHtmlToText(descriptionHtml),
          sourceUrl: sourceUrl.startsWith("http") ? sourceUrl : `${CANVAS_BASE_URL}${sourceUrl}`,
          published: topic.published ?? null,
        },
      });
    }

    const assignment = await canvasGet<CanvasAssignment>(
      `/api/v1/courses/${courseId}/assignments/${itemId}`,
      token
    );
    const descriptionHtml = assignment.description?.trim() ?? "";
    const sourceUrl = assignment.html_url ?? `${CANVAS_BASE_URL}/courses/${courseId}/assignments/${itemId}`;

    return json({
      item: {
        descriptionHtml,
        description: canvasHtmlToText(descriptionHtml),
        sourceUrl: sourceUrl.startsWith("http") ? sourceUrl : `${CANVAS_BASE_URL}${sourceUrl}`,
        dueAt: assignment.due_at ?? null,
        points: assignment.points_possible ?? null,
        availableFrom: assignment.unlock_at ?? null,
        availableUntil: assignment.lock_at ?? null,
        submissionTypes: assignment.submission_types ?? [],
        allowedExtensions: assignment.allowed_extensions ?? [],
        gradingType: assignment.grading_type ?? null,
        allowedAttempts: assignment.allowed_attempts ?? null,
        published: assignment.published ?? null,
      },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Canvas could not load this assignment." },
      { status: 500 }
    );
  }
}
