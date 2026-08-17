import { request as httpsRequest } from "node:https";

export const CANVAS_BASE_URL = "https://sequoiagrove.instructure.com";

export async function canvasGet<T>(path: string, token: string): Promise<T> {
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpsRequest(
      `${CANVAS_BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/json",
          "User-Agent": "Beau-School-Dashboard/0.1",
        },
      },
      (incoming) => {
        const chunks: Uint8Array[] = [];
        incoming.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        incoming.on("end", () => {
          const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const body = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve({
            status: incoming.statusCode ?? 500,
            body: new TextDecoder().decode(body),
          });
        });
      }
    );
    request.setTimeout(12_000, () => request.destroy(new Error("Canvas request timed out.")));
    request.on("error", reject);
    request.end();
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Canvas redirected the request unexpectedly.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Canvas authorization failed for ${path.split("?")[0]}.`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Canvas returned status ${response.status}.`);
  }

  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error("Canvas returned an unreadable response.");
  }
}
