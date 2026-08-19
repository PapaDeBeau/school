CREATE TABLE `xai_connections` (
	`id` integer PRIMARY KEY NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`verified_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
