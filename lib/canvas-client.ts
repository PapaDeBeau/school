import { request as httpsRequest } from "node:https";

export const CANVAS_BASE_URL = "https://sequoiagrove.instructure.com";

export async function canvasGet<T>(path: string, token: string): Promise<T> {
  return canvasRequest<T>(path, token, "GET");
}

export async function canvasPostForm<T>(path: string, token: string, form: URLSearchParams): Promise<T> {
  return canvasRequest<T>(path, token, "POST", form.toString());
}

type CanvasUploadTarget = { upload_url: string; upload_params: Record<string, string> };
type CanvasUploadedFile = { id: number; url?: string; display_name?: string; filename?: string; "content-type"?: string; size?: number };

export async function canvasUploadConversationFile(file: File, token: string): Promise<CanvasUploadedFile> {
  const target = await canvasPostForm<CanvasUploadTarget>("/api/v1/users/self/files", token, new URLSearchParams({
    name: file.name,
    size: String(file.size),
    content_type: file.type || "application/octet-stream",
    parent_folder_path: "conversation attachments",
    on_duplicate: "rename",
  }));
  const uploadUrl = new URL(target.upload_url);
  if (uploadUrl.protocol !== "https:") throw new Error("Canvas returned an unsafe upload address.");

  const uploadBody = new FormData();
  for (const [key, value] of Object.entries(target.upload_params)) uploadBody.append(key, value);
  uploadBody.append("file", file, file.name);
  const uploaded = await fetch(uploadUrl, { method: "POST", body: uploadBody, redirect: "manual" });
  const completionUrl = uploaded.headers.get("location");
  if (completionUrl) {
    const completion = new URL(completionUrl, CANVAS_BASE_URL);
    if (completion.origin !== new URL(CANVAS_BASE_URL).origin) throw new Error("Canvas returned an unsafe completion address.");
    const finalized = await fetch(completion, { method: "POST", headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" } });
    if (!finalized.ok) throw new Error(`Canvas could not finish the ${file.name} upload.`);
    return await finalized.json() as CanvasUploadedFile;
  }
  if (!uploaded.ok) throw new Error(`Canvas could not upload ${file.name}.`);
  return await uploaded.json() as CanvasUploadedFile;
}

async function canvasRequest<T>(path: string, token: string, method: "GET" | "POST", body?: string): Promise<T> {
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpsRequest(
      `${CANVAS_BASE_URL}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) } : {}),
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
    request.end(body);
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
