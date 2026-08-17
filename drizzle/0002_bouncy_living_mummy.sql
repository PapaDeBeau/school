CREATE TABLE `family_chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`body` text NOT NULL,
	`author_username` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_family_chat_messages_created_at` ON `family_chat_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `family_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text,
	`author_username` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_family_posts_board_created_at` ON `family_posts` (`board`,`created_at`);