CREATE TABLE `family_alert_rules` (
	`id` text NOT NULL,
	`owner_username` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`weekday_mask` integer DEFAULT 127 NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`sound_key` text DEFAULT 'chime' NOT NULL,
	`image_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_username`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_family_alert_rules_owner_updated` ON `family_alert_rules` (`owner_username`,`updated_at`);