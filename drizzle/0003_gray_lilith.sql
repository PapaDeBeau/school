CREATE TABLE `family_course_grades` (
	`course_key` text PRIMARY KEY NOT NULL,
	`course_name` text NOT NULL,
	`percentage` real NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_dashboard_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`show_due_today_when_empty` integer DEFAULT true NOT NULL,
	`show_due_tomorrow_when_empty` integer DEFAULT true NOT NULL,
	`show_due_week_when_empty` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
