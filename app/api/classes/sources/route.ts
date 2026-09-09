import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { canvasConnections } from "../../../../db/schema";
import { canvasGet, canvasGetAll } from "../../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";
import { loadCanvasModules } from "../../../../lib/canvas-modules";
import { loadCanvasScheduleSources } from "../../../../lib/canvas-schedule-sources";

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  const courseId = Number(new URL(request.url).searchParams.get("course_id"));
  if (!Number.isSafeInteger(courseId) || courseId <= 0) return Response.json({ error: "Invalid course." }, { status: 400, headers });
  try {
    const [connection] = await getDb().select().from(canvasConnections).where(eq(canvasConnections.id, 1)).limit(1);
    if (!connection) return Response.json({ error: "Canvas is not connected." }, { status: 409, headers });
    const token = await decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
    const result = await loadCanvasModules(courseId, <T,>(path: string) => canvasGetAll<T>(path, token));
    const sources = await loadCanvasScheduleSources(courseId, result.modules, <T,>(path: string) => canvasGet<T>(path, token));
    const fileIds = new Set(sources.flatMap((source) => Array.from(source.html.matchAll(/\/(?:api\/v1\/)?(?:courses\/\d+\/)?files\/(\d+)/g), (match) => match[1])));
    const files = [];
    for (const fileId of [...fileIds].slice(0, 8)) {
      const file = await canvasGet<{ id: number; display_name?: string; url?: string; content_type?: string }>(`/api/v1/courses/${courseId}/files/${fileId}`, token).catch(() => null);
      if (file) files.push(file);
    }
    const enrollment = await canvasGet<Array<{ course_section_id?: number; type?: string }>>(`/api/v1/courses/${courseId}/enrollments?user_id=self`, token).catch(() => []);
    return Response.json({ courseId, complete: result.complete, sources, files, sections: enrollment.map((item) => ({ id: item.course_section_id, type: item.type })) }, { headers });
  } catch {
    return Response.json({ error: "Canvas schedule sources could not be loaded." }, { status: 502, headers });
  }
}
