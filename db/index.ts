import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type AppEnv = {
  DB?: D1Database;
  CANVAS_TOKEN_WRAP_KEY?: string;
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
