import { ensureFamilyPostsSchema, getD1 } from "../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

type Board = "inspiration" | "resources";

type PostRecord = {
  id: number;
  board: Board;
  title: string;
  body: string;
  url: string | null;
  author_username: string;
  author_name: string;
  created_at: string;
  updated_at: string;
};

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...responseHeaders, ...init?.headers } });
}

function readBoard(request: Request): Board | null {
  const board = new URL(request.url).searchParams.get("board");
  return board === "inspiration" || board === "resources" ? board : null;
}

function positiveId(value: unknown) {
  const input = typeof value === "string" ? value : String(value ?? "");
  return /^\d+$/.test(input) && Number(input) > 0 ? Number(input) : null;
}

function publicPost(record: PostRecord) {
  return {
    id: String(record.id),
    board: record.board,
    title: record.title,
    body: record.body,
    url: record.url,
    author: { username: record.author_username, name: record.author_name },
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function safeUrl(value: unknown) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return null;
  if (input.length > 2_000) throw new Error("The link is too long.");
  const parsed = new URL(input);
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    throw new Error("Use a normal http or https link.");
  }
  return parsed.href;
}

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return { response: unauthorizedAppResponse(), user: null };
  const user = await readFamilySession(request);
  return user ? { response: null, user } : { response: familyUnauthorizedResponse(), user: null };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const board = readBoard(request);
  if (!board) return json({ error: "Choose the Inspiration or Resources board." }, { status: 400 });

  await ensureFamilyPostsSchema();
  const result = await getD1()
    .prepare(`
      SELECT id, board, title, body, url, author_username, author_name, created_at, updated_at
      FROM family_posts
      WHERE board = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `)
    .bind(board)
    .all<PostRecord>();
  return json({ board, posts: (result.results ?? []).map(publicPost) });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  const board = readBoard(request);
  if (!board) return json({ error: "Choose the Inspiration or Resources board." }, { status: 400 });

  try {
    const payload = await request.json() as { title?: unknown; body?: unknown; url?: unknown };
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!title || title.length > 140) return json({ error: "Add a title of 140 characters or fewer." }, { status: 400 });
    if (body.length > 8_000) return json({ error: "Keep the post text under 8,000 characters." }, { status: 400 });
    const url = safeUrl(payload.url);
    if (!body && !url) return json({ error: "Add some text, a YouTube video, or a link." }, { status: 400 });

    await ensureFamilyPostsSchema();
    const now = new Date().toISOString();
    const insert = await getD1()
      .prepare(`
        INSERT INTO family_posts
          (board, title, body, url, author_username, author_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(board, title, body, url, auth.user.username, auth.user.displayName, now, now)
      .run();
    const id = Number(insert.meta.last_row_id);
    const post: PostRecord = {
      id,
      board,
      title,
      body,
      url,
      author_username: auth.user.username,
      author_name: auth.user.displayName,
      created_at: now,
      updated_at: now,
    };
    return json({ post: publicPost(post) }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The post could not be saved." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  const board = readBoard(request);
  if (!board) return json({ error: "Choose the Inspiration or Resources board." }, { status: 400 });

  try {
    const payload = await request.json() as { id?: unknown };
    const id = positiveId(payload.id);
    if (!id) return json({ error: "That post is invalid." }, { status: 400 });
    await ensureFamilyPostsSchema();
    const existing = await getD1()
      .prepare(`SELECT author_username FROM family_posts WHERE id = ? AND board = ?`)
      .bind(id, board)
      .first<{ author_username: string }>();
    if (!existing) return json({ error: "That post no longer exists." }, { status: 404 });
    if (existing.author_username !== auth.user.username) {
      return json({ error: "Only the person who made this post can delete it." }, { status: 403 });
    }
    await getD1().prepare(`DELETE FROM family_posts WHERE id = ? AND board = ?`).bind(id, board).run();
    return json({ deleted: String(id) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The post could not be deleted." }, { status: 400 });
  }
}
