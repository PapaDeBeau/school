import { ensureFamilyAuthSchema, getAppEnv, getD1 } from "../db";

export const FAMILY_SESSION_COOKIE = "beau-family-session";

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

type ConfiguredFamilyUser = {
  displayName: string;
  pinHash: string;
};

type FamilyAuthConfig = Record<string, ConfiguredFamilyUser>;

export type FamilyUser = {
  username: string;
  displayName: string;
};

type FamilySessionPayload = {
  version: 1;
  username: string;
  issuedAt: number;
  expiresAt: number;
};

type AttemptRecord = {
  key_hash: string;
  attempt_count: number;
  window_started_at: string;
  locked_until: string | null;
};

const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getSigningSecret() {
  const secret = getAppEnv().FAMILY_AUTH_SIGNING_KEY?.trim();
  if (!secret) throw new Error("Family login is not configured.");
  return secret;
}

function getFamilyUsers(): FamilyAuthConfig {
  const source = getAppEnv().FAMILY_AUTH_USERS?.trim();
  if (!source) throw new Error("Family accounts are not configured.");

  try {
    const parsed = JSON.parse(source) as FamilyAuthConfig;
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid account list.");
    return parsed;
  } catch {
    throw new Error("Family accounts are not configured correctly.");
  }
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export function normalizeFamilyUsername(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export async function verifyFamilyPin(usernameInput: string, pin: string): Promise<FamilyUser | null> {
  const username = normalizeFamilyUsername(usernameInput);
  const users = getFamilyUsers();
  const account = users[username];
  const suppliedHash = await hmac(`pin|${username}|${pin}`);
  const expectedHash = account?.pinHash ?? await hmac(`pin|unknown|0000`);

  if (!account || !constantTimeEqual(suppliedHash, expectedHash)) return null;
  return { username, displayName: account.displayName };
}

export async function createFamilySession(user: FamilyUser, now = Date.now()) {
  const payload: FamilySessionPayload = {
    version: 1,
    username: user.username,
    issuedAt: now,
    expiresAt: now + SESSION_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(`session|${encodedPayload}`);
  return `${encodedPayload}.${signature}`;
}

function readCookie(request: Request, name: string) {
  const source = request.headers.get("cookie") ?? "";
  for (const pair of source.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

export async function readFamilySession(request: Request): Promise<FamilyUser | null> {
  const token = readCookie(request, FAMILY_SESSION_COOKIE);
  if (!token) return null;

  try {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = await hmac(`session|${encodedPayload}`);
    if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as FamilySessionPayload;
    if (payload.version !== 1 || !payload.username || payload.expiresAt <= Date.now()) return null;

    const account = getFamilyUsers()[payload.username];
    if (!account) return null;
    return { username: payload.username, displayName: account.displayName };
  } catch {
    return null;
  }
}

export function familySessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${FAMILY_SESSION_COOKIE}=${token}; Path=/school; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearedFamilySessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${FAMILY_SESSION_COOKIE}=; Path=/school; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function attemptKeys(usernameInput: string, request: Request) {
  const username = normalizeFamilyUsername(usernameInput).slice(0, 64) || "blank";
  const ip = requestIp(request);
  return [
    await hmac(`login-rate|user|${username}`),
    await hmac(`login-rate|user-ip|${username}|${ip}`),
  ];
}

async function readAttempts(keys: string[]) {
  await ensureFamilyAuthSchema();
  const result = await getD1()
    .prepare(`
      SELECT key_hash, attempt_count, window_started_at, locked_until
      FROM family_login_attempts
      WHERE key_hash IN (?, ?)
    `)
    .bind(keys[0], keys[1])
    .all<AttemptRecord>();
  return new Map((result.results ?? []).map((record) => [record.key_hash, record]));
}

export async function getLoginLock(username: string, request: Request) {
  const keys = await attemptKeys(username, request);
  const records = await readAttempts(keys);
  const now = Date.now();
  let lockedUntil = 0;
  for (const record of records.values()) {
    const value = record.locked_until ? new Date(record.locked_until).getTime() : 0;
    if (value > lockedUntil) lockedUntil = value;
  }
  return lockedUntil > now ? Math.max(1, Math.ceil((lockedUntil - now) / 1000)) : 0;
}

export async function registerFailedLogin(username: string, request: Request) {
  const keys = await attemptKeys(username, request);
  const records = await readAttempts(keys);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const statements = keys.map((key) => {
    const current = records.get(key);
    const windowStarted = current ? new Date(current.window_started_at).getTime() : 0;
    const inWindow = now - windowStarted < LOGIN_WINDOW_MS;
    const attemptCount = inWindow ? (current?.attempt_count ?? 0) + 1 : 1;
    const lockedUntil = attemptCount >= MAX_LOGIN_ATTEMPTS
      ? new Date(now + LOGIN_LOCK_MS).toISOString()
      : null;

    return getD1()
      .prepare(`
        INSERT INTO family_login_attempts
          (key_hash, attempt_count, window_started_at, locked_until, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key_hash) DO UPDATE SET
          attempt_count = excluded.attempt_count,
          window_started_at = excluded.window_started_at,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at
      `)
      .bind(key, attemptCount, inWindow && current ? current.window_started_at : nowIso, lockedUntil, nowIso);
  });
  await getD1().batch(statements);
  return Math.max(...keys.map((key) => {
    const current = records.get(key);
    const windowStarted = current ? new Date(current.window_started_at).getTime() : 0;
    const inWindow = now - windowStarted < LOGIN_WINDOW_MS;
    const attemptCount = inWindow ? (current?.attempt_count ?? 0) + 1 : 1;
    return attemptCount >= MAX_LOGIN_ATTEMPTS ? Math.ceil(LOGIN_LOCK_MS / 1000) : 0;
  }));
}

export async function clearLoginAttempts(username: string, request: Request) {
  const keys = await attemptKeys(username, request);
  await ensureFamilyAuthSchema();
  await getD1()
    .prepare("DELETE FROM family_login_attempts WHERE key_hash IN (?, ?)")
    .bind(keys[0], keys[1])
    .run();
}

export function familyUnauthorizedResponse() {
  return Response.json(
    { error: "Sign in to open the family dashboard." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
