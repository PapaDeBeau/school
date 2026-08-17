import { clearedFamilySessionCookie } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || origin === "https://beauvizenor.com" || origin === "https://www.beauvizenor.com";
}

export async function POST(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Cross-origin sign-out is not allowed." }, { status: 403 });
  }
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Set-Cookie": clearedFamilySessionCookie(request),
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
