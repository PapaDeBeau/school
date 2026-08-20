import { ensureFamilyAlertSchema, getD1 } from "../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../lib/request-auth";

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const sounds = new Set(["chime", "bell", "alert", "greatpower", "longbell"]);

async function authorize(request: Request) {
  if (!isAuthorizedAppRequest(request)) return { response: unauthorizedAppResponse(), user: null };
  const user = await readFamilySession(request);
  return user ? { response: null, user } : { response: familyUnauthorizedResponse(), user: null };
}

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });
}

type RuleInput = { id?: unknown; enabled?: unknown; weekdayMask?: unknown; hour?: unknown; minute?: unknown; title?: unknown; message?: unknown; soundKey?: unknown; imageUrl?: unknown };

function validRule(value: RuleInput) {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const soundKey = typeof value.soundKey === "string" ? value.soundKey.trim() : "";
  const imageUrl = typeof value.imageUrl === "string" && value.imageUrl.trim() ? value.imageUrl.trim() : null;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || typeof value.enabled !== "boolean" ||
      !Number.isInteger(value.weekdayMask) || Number(value.weekdayMask) < 1 || Number(value.weekdayMask) > 127 ||
      !Number.isInteger(value.hour) || Number(value.hour) < 0 || Number(value.hour) > 23 ||
      !Number.isInteger(value.minute) || Number(value.minute) < 0 || Number(value.minute) > 59 ||
      !title || title.length > 80 || !message || message.length > 300 || !sounds.has(soundKey)) return null;
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl, "https://beauvizenor.com/school/");
      if (parsed.origin !== "https://beauvizenor.com" || !parsed.pathname.startsWith("/school/")) return null;
    } catch { return null; }
  }
  return { id, enabled: value.enabled, weekdayMask: Number(value.weekdayMask), hour: Number(value.hour), minute: Number(value.minute), title, message, soundKey, imageUrl };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response;
  await ensureFamilyAlertSchema();
  const result = await getD1().prepare(`
    SELECT id, enabled, weekday_mask, hour, minute, title, message, sound_key, image_url, updated_at
    FROM family_alert_rules WHERE owner_username = ? ORDER BY hour, minute, updated_at
  `).bind(auth.user.username).all();
  return json({ ownerUsername: auth.user.username, rules: (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id, enabled: Boolean(row.enabled), weekdayMask: row.weekday_mask, hour: row.hour, minute: row.minute,
    title: row.title, message: row.message, soundKey: row.sound_key, imageUrl: row.image_url, updatedAt: row.updated_at,
  })) });
}

export async function PUT(request: Request) {
  const auth = await authorize(request);
  if (auth.response || !auth.user) return auth.response;
  let payload: { rules?: RuleInput[] };
  try { payload = await request.json(); } catch { return json({ error: "Invalid alert data." }, { status: 400 }); }
  if (!Array.isArray(payload.rules) || payload.rules.length > 24) return json({ error: "Up to 24 alerts are allowed." }, { status: 400 });
  const rules = payload.rules.map(validRule);
  if (rules.some((rule) => !rule)) return json({ error: "One or more alerts are invalid." }, { status: 400 });
  await ensureFamilyAlertSchema();
  const d1 = getD1();
  const now = new Date().toISOString();
  const statements = [d1.prepare("DELETE FROM family_alert_rules WHERE owner_username = ?").bind(auth.user.username)];
  for (const rule of rules) if (rule) statements.push(d1.prepare(`
    INSERT INTO family_alert_rules (id, owner_username, enabled, weekday_mask, hour, minute, title, message, sound_key, image_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(rule.id, auth.user.username, rule.enabled ? 1 : 0, rule.weekdayMask, rule.hour, rule.minute, rule.title, rule.message, rule.soundKey, rule.imageUrl, now, now));
  await d1.batch(statements);
  return json({ ok: true, ownerUsername: auth.user.username, rules });
}
