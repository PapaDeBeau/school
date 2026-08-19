import { ensureFamilyChatSchema, getChatAudioBucket, getD1 } from "../../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return Response.json({ error: "Invalid audio attachment." }, { status: 400 });
  await ensureFamilyChatSchema();
  const message = await getD1().prepare("SELECT audio_key, audio_content_type FROM family_chat_messages WHERE id = ?")
    .bind(Number(id)).first<{ audio_key: string | null; audio_content_type: string | null }>();
  if (!message?.audio_key) return Response.json({ error: "Audio attachment not found." }, { status: 404 });
  const object = await getChatAudioBucket().get(message.audio_key);
  if (!object) return Response.json({ error: "Audio attachment not found." }, { status: 404 });
  return new Response(object.body, { headers: {
    "Content-Type": message.audio_content_type || object.httpMetadata?.contentType || "audio/webm",
    "Cache-Control": "private, no-store",
    "Content-Length": String(object.size),
    "X-Content-Type-Options": "nosniff",
  } });
}
