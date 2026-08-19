import { getChatAudioBucket } from "../../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";
import { readXaiApiKey } from "../../xai/connection/route";

const femaleTeachers = new Set(["marcela whitehead", "lauren garcia", "heather hathaway", "kristina knox"]);
const maleTeachers = new Set(["clinton baier"]);
const safeId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; };
const audioKey = (courseId: number, itemId: number) => `announcements/v3/${courseId}/${itemId}.mp3`;

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  return await readFamilySession(request) ? null : familyUnauthorizedResponse();
}

function voiceForTeacher(authorName: string) {
  const name = authorName.trim().toLocaleLowerCase("en-US");
  if (maleTeachers.has(name)) return "lux";
  if (femaleTeachers.has(name)) return "luna";
  return "luna";
}

export async function GET(request: Request) {
  const denied = await authorize(request); if (denied) return denied;
  const url = new URL(request.url); const courseId = safeId(url.searchParams.get("course_id")); const itemId = safeId(url.searchParams.get("item_id"));
  if (!courseId || !itemId) return Response.json({ error: "Invalid announcement audio." }, { status: 400 });
  const object = await getChatAudioBucket().get(audioKey(courseId, itemId));
  if (!object) return Response.json({ error: "Announcement audio not found." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "audio/mpeg", "Cache-Control": "private, max-age=3600", "Content-Length": String(object.size), "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  const denied = await authorize(request); if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const courseId = safeId(payload.courseId); const itemId = safeId(payload.itemId);
    if (!courseId || !itemId) return Response.json({ error: "Invalid announcement." }, { status: 400 });
    const key = audioKey(courseId, itemId); const bucket = getChatAudioBucket();
    if (await bucket.head(key)) return Response.json({ audioUrl: `/api/announcements/audio?course_id=${courseId}&item_id=${itemId}`, existing: true });
    await bucket.delete([
      `announcements/${courseId}/${itemId}.mp3`,
      `announcements/v2/${courseId}/${itemId}.mp3`,
    ]);
    const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 500) : "";
    const course = typeof payload.course === "string" ? payload.course.trim().slice(0, 300) : "";
    const authorName = typeof payload.authorName === "string" ? payload.authorName.trim().slice(0, 200) : "Teacher";
    const description = typeof payload.description === "string" ? payload.description.trim().slice(0, 13_500) : "";
    if (!title || !description) return Response.json({ error: "This announcement has no readable text." }, { status: 400 });
    const apiKey = await readXaiApiKey(); if (!apiKey) return Response.json({ error: "Connect xAI in Settings first." }, { status: 409 });
    const voice = voiceForTeacher(authorName);
    const speech = `${title}. ${description}`;
    const response = await fetch("https://api.x.ai/v1/tts", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: speech, voice_id: voice, language: "en" }) });
    if (!response.ok) return Response.json({ error: response.status === 429 ? "xAI is busy. This announcement will retry later." : "xAI could not create this announcement recording." }, { status: 502 });
    const audio = await response.arrayBuffer();
    await bucket.put(key, audio, { httpMetadata: { contentType: response.headers.get("content-type") || "audio/mpeg" }, customMetadata: { voice, authorName } });
    return Response.json({ audioUrl: `/api/announcements/audio?course_id=${courseId}&item_id=${itemId}`, existing: false, voice });
  } catch { return Response.json({ error: "The announcement recording could not be created." }, { status: 500 }); }
}
