import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type AppEnv = {
  DB?: D1Database;
  CHAT_AUDIO?: R2Bucket;
  CANVAS_TOKEN_WRAP_KEY?: string;
  BEAU_PROXY_ACCESS_KEY?: string;
  FAMILY_AUTH_SIGNING_KEY?: string;
  FAMILY_AUTH_USERS?: string;
};

export function getAppEnv() {
  return env as unknown as AppEnv;
}

export function getD1() {
  const d1 = getAppEnv().DB;
  if (!d1) {
    throw new Error("The local encrypted connection store is unavailable.");
  }
  return d1;
}

export function getChatAudioBucket() {
  const bucket = getAppEnv().CHAT_AUDIO;
  if (!bucket) throw new Error("Family chat audio storage is unavailable.");
  return bucket;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export async function ensureCanvasConnectionSchema() {
  await getD1()
    .prepare(`
      CREATE TABLE IF NOT EXISTS canvas_connections (
        id INTEGER PRIMARY KEY,
        base_url TEXT NOT NULL,
        canvas_user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        encrypted_token TEXT NOT NULL,
        token_iv TEXT NOT NULL,
        token_version INTEGER NOT NULL DEFAULT 1,
        course_count INTEGER NOT NULL DEFAULT 0,
        verified_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    .run();
}

export async function ensureFamilyAuthSchema() {
  await getD1()
    .prepare(`
      CREATE TABLE IF NOT EXISTS family_login_attempts (
        key_hash TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        locked_until TEXT,
        updated_at TEXT NOT NULL
      )
    `)
    .run();
}

export async function ensureFamilyPostsSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS family_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        url TEXT,
        author_username TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_family_posts_board_created_at
      ON family_posts(board, created_at)
    `),
  ]);
  await d1.prepare("PRAGMA optimize").run();
}

export async function ensureFamilyChatSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS family_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL,
        author_username TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    d1.prepare(`
      CREATE INDEX IF NOT EXISTS idx_family_chat_messages_created_at
      ON family_chat_messages(created_at)
    `),
  ]);
  const columns = await d1.prepare("PRAGMA table_info(family_chat_messages)").all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  const additions = [
    ["audio_key", "ALTER TABLE family_chat_messages ADD COLUMN audio_key TEXT"],
    ["audio_content_type", "ALTER TABLE family_chat_messages ADD COLUMN audio_content_type TEXT"],
    ["audio_duration_ms", "ALTER TABLE family_chat_messages ADD COLUMN audio_duration_ms INTEGER"],
  ] as const;
  for (const [name, sql] of additions) if (!names.has(name)) await d1.prepare(sql).run();
  await d1.prepare("PRAGMA optimize").run();
}

export async function ensureFamilyAdminSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS family_dashboard_settings (
        id INTEGER PRIMARY KEY,
        show_due_today_when_empty INTEGER NOT NULL DEFAULT 1,
        show_due_tomorrow_when_empty INTEGER NOT NULL DEFAULT 1,
        show_due_week_when_empty INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    d1.prepare(`
      CREATE TABLE IF NOT EXISTS family_course_grades (
        course_key TEXT PRIMARY KEY,
        course_name TEXT NOT NULL,
        percentage REAL NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
  ]);
  await d1.prepare("PRAGMA optimize").run();
}
