import { getChatAudioBucket } from "../../../../db";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const object = await getChatAudioBucket().get(`push-images/${id}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
