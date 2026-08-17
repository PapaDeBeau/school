import { readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

export async function GET(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  const user = await readFamilySession(request);
  return Response.json(
    user ? { authenticated: true, user } : { authenticated: false },
    {
      status: user ? 200 : 401,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
