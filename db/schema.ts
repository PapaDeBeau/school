import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const canvasConnections = sqliteTable("canvas_connections", {
  id: integer("id").primaryKey(),
  baseUrl: text("base_url").notNull(),
  canvasUserId: text("canvas_user_id").notNull(),
  displayName: text("display_name").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenVersion: integer("token_version").notNull().default(1),
  courseCount: integer("course_count").notNull().default(0),
  verifiedAt: text("verified_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
