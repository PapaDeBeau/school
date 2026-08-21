import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const xaiConnections = sqliteTable("xai_connections", {
  id: integer("id").primaryKey(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  apiKeyIv: text("api_key_iv").notNull(),
  verifiedAt: text("verified_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const familyLoginAttempts = sqliteTable("family_login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const familyPosts = sqliteTable("family_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  board: text("board").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  url: text("url"),
  authorUsername: text("author_username").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_family_posts_board_created_at").on(table.board, table.createdAt),
]);

export const familyChatMessages = sqliteTable("family_chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  audioKey: text("audio_key"),
  audioContentType: text("audio_content_type"),
  audioDurationMs: integer("audio_duration_ms"),
  authorUsername: text("author_username").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_family_chat_messages_created_at").on(table.createdAt),
]);

export const familyChatMessageReads = sqliteTable("family_chat_message_reads", {
  messageId: integer("message_id").notNull().references(() => familyChatMessages.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  seenAt: text("seen_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.username] }),
]);

export const familyDashboardSettings = sqliteTable("family_dashboard_settings", {
  id: integer("id").primaryKey(),
  showAnnouncements: integer("show_announcements", { mode: "boolean" }).notNull().default(true),
  showDueTodayWhenEmpty: integer("show_due_today_when_empty", { mode: "boolean" }).notNull().default(true),
  showDueTomorrowWhenEmpty: integer("show_due_tomorrow_when_empty", { mode: "boolean" }).notNull().default(true),
  showDueWeekWhenEmpty: integer("show_due_week_when_empty", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const familyCourseGrades = sqliteTable("family_course_grades", {
  courseKey: text("course_key").primaryKey(),
  courseName: text("course_name").notNull(),
  percentage: real("percentage").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const familyAlertRules = sqliteTable("family_alert_rules", {
  id: text("id").notNull(),
  ownerUsername: text("owner_username").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  scheduleType: text("schedule_type").notNull().default("recurring"),
  oneTimeAt: integer("one_time_at", { mode: "number" }),
  oneTimeLocal: text("one_time_local"),
  weekdayMask: integer("weekday_mask").notNull().default(127),
  hour: integer("hour").notNull(),
  minute: integer("minute").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  soundKey: text("sound_key").notNull().default("chime"),
  imageUrl: text("image_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerUsername, table.id] }),
  index("idx_family_alert_rules_owner_updated").on(table.ownerUsername, table.updatedAt),
]);
