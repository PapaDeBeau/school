import { getAppEnv } from "../db";

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function isAuthorizedAppRequest(request: Request) {
  const expected = getAppEnv().BEAU_PROXY_ACCESS_KEY?.trim();
  if (!expected) {
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  const supplied = request.headers.get("x-beau-proxy-key")?.trim() ?? "";
  return constantTimeEqual(supplied, expected);
}

export function unauthorizedAppResponse() {
  return Response.json(
    { error: "Open this dashboard through BeauVizenor.com/school." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
