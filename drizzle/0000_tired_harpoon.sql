CREATE TABLE `canvas_connections` (
	`id` integer PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`canvas_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`token_iv` text NOT NULL,
	`token_version` integer DEFAULT 1 NOT NULL,
	`course_count` integer DEFAULT 0 NOT NULL,
	`verified_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
