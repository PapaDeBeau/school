CREATE TABLE IF NOT EXISTS `family_chat_message_reads` (
	`message_id` integer NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`seen_at` text NOT NULL,
	PRIMARY KEY(`message_id`, `username`),
	FOREIGN KEY (`message_id`) REFERENCES `family_chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
