import {
  clearLoginAttempts,
  createFamilySession,
  familySessionCookie,
  getLoginLock,
  registerFailedLogin,
  verifyFamilyPin,
} from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...responseHeaders, ...init?.headers } });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || origin === "https://beauvizenor.com" || origin === "https://www.beauvizenor.com";
}

export async function POST(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!isSameOrigin(request)) return json({ error: "Cross-origin sign-in is not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const payload = await request.json() as { username?: string; pin?: string };
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const pin = typeof payload.pin === "string" ? payload.pin : "";
    if (!username || username.length > 64 || !/^\d{4}$/.test(pin)) {
      return json({ error: "Enter your username and four-digit PIN." }, { status: 400 });
    }

    const retryAfter = await getLoginLock(username, request);
    if (retryAfter > 0) {
      return json(
        { error: "Too many attempts. Please wait 15 minutes before trying again.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const user = await verifyFamilyPin(username, pin);
    if (!user) {
      const newlyLockedFor = await registerFailedLogin(username, request);
      return json(
        { error: newlyLockedFor ? "Too many attempts. Please wait 15 minutes before trying again." : "That username and PIN do not match." },
        { status: newlyLockedFor ? 429 : 401, ...(newlyLockedFor ? { headers: { "Retry-After": String(newlyLockedFor) } } : {}) }
      );
    }

    await clearLoginAttempts(username, request);
    const token = await createFamilySession(user);
    return json(
      { authenticated: true, user },
      { headers: { "Set-Cookie": familySessionCookie(token, request) } }
    );
  } catch {
    return json({ error: "Family login is temporarily unavailable." }, { status: 503 });
  }
}
