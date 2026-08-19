import { ensureXaiConnectionSchema, getD1 } from "../../../../db";
import { decryptServerSecret, encryptServerSecret } from "../../../../lib/canvas-vault";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return { response: unauthorizedAppResponse(), user: null };
  const user = await readFamilySession(request);
  return user ? { response: null, user } : { response: familyUnauthorizedResponse(), user: null };
}

export async function GET(request: Request) {
  const auth = await authorize(request); if (auth.response) return auth.response;
  await ensureXaiConnectionSchema();
  const row = await getD1().prepare("SELECT verified_at FROM xai_connections WHERE id = 1").first<{ verified_at: string }>();
  return json({ connected: Boolean(row), verifiedAt: row?.verified_at ?? null });
}

export async function POST(request: Request) {
  const auth = await authorize(request); if (auth.response || !auth.user) return auth.response ?? familyUnauthorizedResponse();
  try {
    const payload = await request.json() as { apiKey?: unknown };
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    if (apiKey.length < 20 || apiKey.length > 500) return json({ error: "Paste a valid xAI API key." }, { status: 400 });
    const verification = await fetch("https://api.x.ai/v1/tts/voices", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!verification.ok) return json({ error: verification.status === 401 ? "That xAI API key was not accepted." : "xAI could not verify the API key right now." }, { status: 400 });
    const voices = await verification.json() as { voices?: Array<{ voice_id?: string }> };
    const ids = new Set((voices.voices ?? []).map((voice) => voice.voice_id?.toLocaleLowerCase("en-US")));
    if (!ids.has("luna") || !ids.has("lux")) return json({ error: "This xAI account does not currently provide both Luna and Lux." }, { status: 400 });
    const encrypted = await encryptServerSecret(apiKey);
    const now = new Date().toISOString(); await ensureXaiConnectionSchema();
    await getD1().prepare(`INSERT INTO xai_connections (id, encrypted_api_key, api_key_iv, verified_at, updated_by, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET encrypted_api_key=excluded.encrypted_api_key, api_key_iv=excluded.api_key_iv, verified_at=excluded.verified_at, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).bind(encrypted.ciphertext, encrypted.iv, now, auth.user.username, now).run();
    return json({ connected: true, verifiedAt: now });
  } catch { return json({ error: "The secure xAI connection could not be saved." }, { status: 400 }); }
}

export async function readXaiApiKey() {
  await ensureXaiConnectionSchema();
  const row = await getD1().prepare("SELECT encrypted_api_key, api_key_iv FROM xai_connections WHERE id = 1").first<{ encrypted_api_key: string; api_key_iv: string }>();
  return row ? decryptServerSecret(row.encrypted_api_key, row.api_key_iv) : null;
}
