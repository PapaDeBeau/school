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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(`${CANVAS_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Canvas request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.text();

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Canvas redirected the request unexpectedly.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Canvas authorization failed for ${path.split("?")[0]}.`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Canvas returned status ${response.status} for ${path.split("?")[0]}.`);
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch {
    throw new Error("Canvas returned an unreadable response.");
  }
}
