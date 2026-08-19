import { eq } from "drizzle-orm";
import { ensureCanvasConnectionSchema, getDb } from "../../../db";
import { canvasConnections } from "../../../db/schema";
import { CANVAS_BASE_URL, canvasGet, canvasPostForm, canvasUploadConversationFile } from "../../../lib/canvas-client";
import { decryptCanvasToken } from "../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type CanvasParticipant = {
  id: number;
  name?: string;
  full_name?: string;
  avatar_url?: string;
};

type CanvasAttachment = {
  id?: number;
  display_name?: string;
  filename?: string;
  url?: string;
  size?: number;
  "content-type"?: string;
};

type CanvasMessage = {
  id: number;
  author_id?: number;
  created_at?: string;
  body?: string;
  generated?: boolean;
  attachments?: CanvasAttachment[];
};

type CanvasConversation = {
  id: number;
  subject?: string;
  workflow_state?: string;
  last_message?: string;
  last_message_at?: string;
  start_at?: string;
  message_count?: number;
  context_name?: string;
  avatar_url?: string;
  audience?: number[];
  participants?: CanvasParticipant[];
  messages?: CanvasMessage[];
};

function serializeThread(conversation: CanvasConversation) {
  const participants = new Map(
    (conversation.participants ?? []).map((participant) => [participant.id, participant])
  );
  const audience = new Set(conversation.audience ?? []);
  const ownParticipant = (conversation.participants ?? []).find((participant) => !audience.has(participant.id));
  const messages = [...(conversation.messages ?? [])]
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
    .map((message) => ({
      id: String(message.id),
      createdAt: message.created_at ?? null,
      body: canvasHtmlToText(message.body) || "Canvas did not include message text.",
      generated: Boolean(message.generated),
      isOwn: Boolean(ownParticipant && message.author_id === ownParticipant.id),
      author: participantData(message.author_id ? participants.get(message.author_id) : null),
      attachments: (message.attachments ?? []).map((attachment) => ({
        id: String(attachment.id ?? attachment.url ?? attachment.filename ?? "attachment"),
        name: attachment.display_name?.trim() || attachment.filename?.trim() || "Attachment",
        url: safeCanvasUrl(attachment.url),
        size: attachment.size ?? null,
        contentType: attachment["content-type"] ?? null,
      })),
    }));

  return {
    id: String(conversation.id),
    subject: conversation.subject?.trim() || "Canvas message",
    contextName: conversation.context_name?.trim() || "Canvas Inbox",
    workflowState: conversation.workflow_state ?? "read",
    sourceUrl: `${CANVAS_BASE_URL}/conversations#filter=type=inbox`,
    participants: (conversation.participants ?? []).map(participantData).filter(Boolean),
    currentUserId: ownParticipant ? String(ownParticipant.id) : null,
    messages,
  };
}

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
  const entities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
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

function safeCanvasUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, CANVAS_BASE_URL);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function participantData(participant?: CanvasParticipant | null) {
  if (!participant) return null;
  return {
    id: String(participant.id),
    name: participant.full_name?.trim() || participant.name?.trim() || "Canvas user",
    avatarUrl: safeCanvasUrl(participant.avatar_url),
  };
}

function conversationSender(conversation: CanvasConversation) {
  const participants = conversation.participants ?? [];
  const audienceId = conversation.audience?.[0];
  const participant = participants.find((item) => item.id === audienceId) ?? participants[0] ?? null;
  return participantData(participant);
}

async function readCanvasToken() {
  await ensureCanvasConnectionSchema();
  const [connection] = await getDb()
    .select()
    .from(canvasConnections)
    .where(eq(canvasConnections.id, 1))
    .limit(1);
  if (!connection) throw new Error("Canvas is not connected.");
  return decryptCanvasToken(connection.encryptedToken, connection.tokenIv);
}

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();

  try {
    const token = await readCanvasToken();
    const conversationId = new URL(request.url).searchParams.get("conversation_id");

    if (conversationId) {
      if (!/^\d{1,20}$/.test(conversationId)) {
        return json({ error: "That Canvas conversation could not be opened." }, { status: 400 });
      }

      const conversation = await canvasGet<CanvasConversation>(
        `/api/v1/conversations/${conversationId}?include[]=participant_avatars`,
        token
      );
      return json({ thread: serializeThread(conversation) });
    }

    const conversations = await canvasGet<CanvasConversation[]>(
      "/api/v1/conversations?per_page=10&include[]=participant_avatars",
      token
    );

    return json({
      conversations: conversations.slice(0, 10).map((conversation) => ({
        id: String(conversation.id),
        subject: conversation.subject?.trim() || "Canvas message",
        preview: canvasHtmlToText(conversation.last_message) || "Open this conversation to read it.",
        lastMessageAt: conversation.last_message_at ?? conversation.start_at ?? null,
        messageCount: conversation.message_count ?? 0,
        contextName: conversation.context_name?.trim() || "Canvas Inbox",
        workflowState: conversation.workflow_state ?? "read",
        from: conversationSender(conversation),
        avatarUrl: safeCanvasUrl(conversation.avatar_url),
      })),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Canvas Inbox could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();

  try {
    const form = await request.formData();
    const conversationId = typeof form.get("conversationId") === "string" ? String(form.get("conversationId")) : "";
    const body = typeof form.get("body") === "string" ? String(form.get("body")).trim() : "";
    if (!/^\d{1,20}$/.test(conversationId)) return json({ error: "That Canvas conversation could not be opened." }, { status: 400 });
    const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if ((!body && !files.length) || body.length > 10_000) return json({ error: "Enter a reply or add an attachment." }, { status: 400 });
    if (files.length > 4) return json({ error: "Attach no more than four files at once." }, { status: 400 });
    if (files.some((file) => file.size > 15 * 1024 * 1024)) return json({ error: "Each attachment must be 15 MB or smaller." }, { status: 400 });
    const token = await readCanvasToken();
    const uploaded = [];
    for (const file of files) uploaded.push(await canvasUploadConversationFile(file, token));
    const messageForm = new URLSearchParams({ body: body || "Attachment" });
    for (const file of uploaded) messageForm.append("attachment_ids[]", String(file.id));
    await canvasPostForm(`/api/v1/conversations/${conversationId}/add_message`, token, messageForm);
    const conversation = await canvasGet<CanvasConversation>(
      `/api/v1/conversations/${conversationId}?include[]=participant_avatars`,
      token
    );
    return json({ thread: serializeThread(conversation) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Your reply could not be sent to Canvas." }, { status: 500 });
  }
}
