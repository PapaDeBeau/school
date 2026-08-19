import { ensureFamilyChatSchema, getChatAudioBucket, getD1 } from "../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type ChatRecord = {
  id: number;
  body: string;
  audio_key: string | null;
  audio_content_type: string | null;
  audio_duration_ms: number | null;
  author_username: string;
  author_name: string;
  created_at: string;
  updated_at: string;
};

type SeenRecord = {
  message_id: number;
  username: string;
  display_name: string;
};

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...responseHeaders, ...init?.headers } });
}

function publicMessage(record: ChatRecord, seenBy: Array<{ username: string; name: string }> = []) {
  return {
    id: String(record.id),
    body: record.body,
    audio: record.audio_key ? {
      url: `/api/chat/audio?id=${record.id}`,
      contentType: record.audio_content_type,
      durationMs: record.audio_duration_ms,
    } : null,
    author: { username: record.author_username, name: record.author_name },
    seenBy,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function publicMessages(records: ChatRecord[]) {
  if (!records.length) return [];
  const placeholders = records.map(() => "?").join(", ");
  const seen = await getD1().prepare(`
    SELECT message_id, username, display_name
    FROM family_chat_message_reads
    WHERE message_id IN (${placeholders})
    ORDER BY seen_at ASC
  `).bind(...records.map((record) => record.id)).all<SeenRecord>();
  const byMessage = new Map<number, Array<{ username: string; name: string }>>();
  for (const receipt of seen.results ?? []) {
    const readers = byMessage.get(receipt.message_id) ?? [];
    readers.push({ username: receipt.username, name: receipt.display_name });
    byMessage.set(receipt.message_id, readers);
  }
  return records.map((record) => publicMessage(record, byMessage.get(record.id) ?? []));
}

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return { response: unauthorizedAppResponse(), user: null };
  const user = await readFamilySession(request);
  return user ? { response: null, user } : { response: familyUnauthorizedResponse(), user: null };
}

function positiveId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function messageBody(value: unknown) {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) throw new Error("Write a message first.");
  if (body.length > 2_000) throw new Error("Keep family chat messages under 2,000 characters.");
  return body;
}

const chatColumns = "id, body, audio_key, audio_content_type, audio_duration_ms, author_username, author_name, created_at, updated_at";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  await ensureFamilyChatSchema();

  const url = new URL(request.url);
  const before = positiveId(url.searchParams.get("before"));
  const after = positiveId(url.searchParams.get("after"));
  if (url.searchParams.has("before") && !before) return json({ error: "The older-message cursor is invalid." }, { status: 400 });
  if (url.searchParams.has("after") && !after) return json({ error: "The new-message cursor is invalid." }, { status: 400 });
  if (before && after) return json({ error: "Choose either older or newer messages." }, { status: 400 });

  if (after) {
    const result = await getD1().prepare(`
      SELECT ${chatColumns}
      FROM family_chat_messages
      WHERE id > ?
      ORDER BY id ASC
      LIMIT 50
    `).bind(after).all<ChatRecord>();
    return json({ messages: await publicMessages(result.results ?? []), hasMore: false, nextBefore: null });
  }

  const query = before
    ? getD1().prepare(`
        SELECT ${chatColumns}
        FROM family_chat_messages
        WHERE id < ?
        ORDER BY id DESC
        LIMIT 16
      `).bind(before)
    : getD1().prepare(`
        SELECT ${chatColumns}
        FROM family_chat_messages
        ORDER BY id DESC
        LIMIT 16
      `);
  const result = await query.all<ChatRecord>();
  const records = result.results ?? [];
  const hasMore = records.length > 15;
  const page = records.slice(0, 15).reverse();
  return json({ messages: await publicMessages(page), hasMore, nextBefore: page.length ? String(page[0].id) : null });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body = "";
    let audio: File | null = null;
    let durationMs: number | null = null;
    if (contentType.includes("multipart/form-data")) {
      const payload = await request.formData();
      body = typeof payload.get("body") === "string" ? String(payload.get("body")).trim() : "";
      const candidate = payload.get("audio");
      audio = candidate instanceof File && candidate.size ? candidate : null;
      const duration = Number(payload.get("durationMs"));
      durationMs = Number.isFinite(duration) ? Math.max(0, Math.min(duration, 10 * 60_000)) : null;
    } else {
      const payload = await request.json() as { body?: unknown };
      body = typeof payload.body === "string" ? payload.body.trim() : "";
    }
    if (!body && !audio) throw new Error("Write a message or attach a recording first.");
    if (body.length > 2_000) throw new Error("Keep family chat messages under 2,000 characters.");
    if (audio && audio.size > 12 * 1024 * 1024) throw new Error("Keep audio recordings under 12 MB.");
    if (audio && !audio.type.startsWith("audio/")) throw new Error("That recording format is not supported.");
    await ensureFamilyChatSchema();
    const now = new Date().toISOString();
    const audioKey = audio ? `family-chat/${auth.user.username}/${crypto.randomUUID()}` : null;
    if (audio && audioKey) await getChatAudioBucket().put(audioKey, audio.stream(), { httpMetadata: { contentType: audio.type } });
    const insert = await getD1().prepare(`
      INSERT INTO family_chat_messages (body, audio_key, audio_content_type, audio_duration_ms, author_username, author_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(body, audioKey, audio?.type ?? null, durationMs, auth.user.username, auth.user.displayName, now, now).run();
    const messageId = Number(insert.meta.last_row_id);
    let seenBy: Array<{ username: string; name: string }> = [];
    try {
      await getD1().prepare(`
        INSERT OR IGNORE INTO family_chat_message_reads (message_id, username, display_name, seen_at)
        VALUES (?, ?, ?, ?)
      `).bind(messageId, auth.user.username, auth.user.displayName, now).run();
      seenBy = [{ username: auth.user.username, name: auth.user.displayName }];
    } catch {
      // The message is already saved; its visible receipt can retry through PUT.
    }
    return json({ message: publicMessage({
      id: messageId, body,
      audio_key: audioKey, audio_content_type: audio?.type ?? null, audio_duration_ms: durationMs,
      author_username: auth.user.username, author_name: auth.user.displayName,
      created_at: now, updated_at: now,
    }, seenBy) }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The message could not be sent." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const payload = await request.json() as { ids?: unknown };
    const ids = Array.isArray(payload.ids)
      ? [...new Set(payload.ids.map((value) => positiveId(String(value))).filter((value): value is number => value !== null))].slice(0, 100)
      : [];
    if (!ids.length) return json({ seen: [] });
    await ensureFamilyChatSchema();
    const now = new Date().toISOString();
    await getD1().batch(ids.map((id) => getD1().prepare(`
      INSERT OR IGNORE INTO family_chat_message_reads (message_id, username, display_name, seen_at)
      SELECT id, ?, ?, ? FROM family_chat_messages WHERE id = ?
    `).bind(auth.user.username, auth.user.displayName, now, id)));
    const placeholders = ids.map(() => "?").join(", ");
    const saved = await getD1().prepare(`
      SELECT message_id
      FROM family_chat_message_reads
      WHERE username = ? AND message_id IN (${placeholders})
    `).bind(auth.user.username, ...ids).all<{ message_id: number }>();
    return json({ seen: (saved.results ?? []).map((receipt: { message_id: number }) => ({
      messageId: String(receipt.message_id),
      user: { username: auth.user!.username, name: auth.user!.displayName },
    })) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Seen status could not be saved." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const payload = await request.json() as { id?: unknown; body?: unknown };
    const id = positiveId(typeof payload.id === "string" ? payload.id : String(payload.id ?? ""));
    if (!id) return json({ error: "That chat message is invalid." }, { status: 400 });
    const body = messageBody(payload.body);
    await ensureFamilyChatSchema();
    const existing = await getD1().prepare(`SELECT author_username FROM family_chat_messages WHERE id = ?`).bind(id).first<{ author_username: string }>();
    if (!existing) return json({ error: "That chat message no longer exists." }, { status: 404 });
    if (existing.author_username !== auth.user.username) return json({ error: "Only the sender can edit this message." }, { status: 403 });
    const now = new Date().toISOString();
    await getD1().prepare(`UPDATE family_chat_messages SET body = ?, updated_at = ? WHERE id = ?`).bind(body, now, id).run();
    const updated = await getD1().prepare(`
      SELECT ${chatColumns}
      FROM family_chat_messages WHERE id = ?
    `).bind(id).first<ChatRecord>();
    return json({ message: updated ? (await publicMessages([updated]))[0] : null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The message could not be edited." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const payload = await request.json() as { id?: unknown };
    const id = positiveId(typeof payload.id === "string" ? payload.id : String(payload.id ?? ""));
    if (!id) return json({ error: "That chat message is invalid." }, { status: 400 });
    await ensureFamilyChatSchema();
    const existing = await getD1().prepare(`SELECT author_username, audio_key FROM family_chat_messages WHERE id = ?`).bind(id).first<{ author_username: string; audio_key: string | null }>();
    if (!existing) return json({ error: "That chat message no longer exists." }, { status: 404 });
    if (existing.author_username !== auth.user.username) return json({ error: "Only the sender can delete this message." }, { status: 403 });
    if (existing.audio_key) await getChatAudioBucket().delete(existing.audio_key);
    await getD1().batch([
      getD1().prepare(`DELETE FROM family_chat_message_reads WHERE message_id = ?`).bind(id),
      getD1().prepare(`DELETE FROM family_chat_messages WHERE id = ?`).bind(id),
    ]);
    return json({ deleted: String(id) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The message could not be deleted." }, { status: 400 });
  }
}
