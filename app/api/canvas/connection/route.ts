import { eq } from "drizzle-orm";
import {
  ensureCanvasConnectionSchema,
  getDb,
} from "../../../../db";
import { canvasConnections } from "../../../../db/schema";
import { CANVAS_BASE_URL, canvasGet } from "../../../../lib/canvas-client";
import { encryptCanvasToken } from "../../../../lib/canvas-vault";

const MAX_TOKEN_LENGTH = 512;

type CanvasProfile = {
  id: number | string;
  name?: string;
  short_name?: string;
};

type CanvasCourse = {
  id: number | string;
};

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...responseHeaders, ...init?.headers },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  try {
    await ensureCanvasConnectionSchema();
    const [connection] = await getDb()
      .select({
        baseUrl: canvasConnections.baseUrl,
        displayName: canvasConnections.displayName,
        courseCount: canvasConnections.courseCount,
        verifiedAt: canvasConnections.verifiedAt,
      })
      .from(canvasConnections)
      .where(eq(canvasConnections.id, 1))
      .limit(1);

    if (!connection) return json({ connected: false });
    return json({ connected: true, connection });
  } catch {
    return json(
      { connected: false, error: "The local connection store is not ready." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Cross-origin connection requests are not allowed." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const payload = (await request.json()) as { baseUrl?: string; token?: string };
    const baseUrl = payload.baseUrl?.trim().replace(/\/$/, "") ?? "";
    const token = payload.token?.trim() ?? "";

    if (baseUrl !== CANVAS_BASE_URL) {
      return json({ error: "Only the approved Sequoia Grove Canvas address is allowed." }, { status: 400 });
    }
    if (token.length < 20 || token.length > MAX_TOKEN_LENGTH) {
      return json({ error: "Enter the complete Canvas access token." }, { status: 400 });
    }

    const [profile, courses] = await Promise.all([
      canvasGet<CanvasProfile>("/api/v1/users/self/profile", token),
      canvasGet<CanvasCourse[]>(
        "/api/v1/courses?enrollment_state=active&per_page=100",
        token
      ),
    ]);

    if (!profile.id || !profile.name) {
      throw new Error("Canvas returned an incomplete account profile.");
    }

    const encrypted = await encryptCanvasToken(token);
    const now = new Date().toISOString();
    await ensureCanvasConnectionSchema();
    await getDb()
      .insert(canvasConnections)
      .values({
        id: 1,
        baseUrl: CANVAS_BASE_URL,
        canvasUserId: String(profile.id),
        displayName: profile.name,
        encryptedToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenVersion: 1,
        courseCount: courses.length,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: canvasConnections.id,
        set: {
          baseUrl: CANVAS_BASE_URL,
          canvasUserId: String(profile.id),
          displayName: profile.name,
          encryptedToken: encrypted.ciphertext,
          tokenIv: encrypted.iv,
          tokenVersion: 1,
          courseCount: courses.length,
          verifiedAt: now,
          updatedAt: now,
        },
      });

    return json({
      connected: true,
      connection: {
        baseUrl: CANVAS_BASE_URL,
        displayName: profile.name,
        courseCount: courses.length,
        verifiedAt: now,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Canvas took too long to respond. Try again."
        : error instanceof Error
          ? error.message
          : "Canvas verification failed.";
    return json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  try {
    await ensureCanvasConnectionSchema();
    await getDb().delete(canvasConnections).where(eq(canvasConnections.id, 1));
    return json({ connected: false });
  } catch {
    return json({ error: "The connection could not be removed." }, { status: 500 });
  }
}
