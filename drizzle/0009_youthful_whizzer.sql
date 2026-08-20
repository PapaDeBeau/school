ALTER TABLE `family_alert_rules` ADD `schedule_type` text DEFAULT 'recurring' NOT NULL;--> statement-breakpoint
ALTER TABLE `family_alert_rules` ADD `one_time_at` integer;