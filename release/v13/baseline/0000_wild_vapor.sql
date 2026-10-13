CREATE TABLE `hangers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` integer NOT NULL,
	`listener_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_hangers_track_listener` ON `hangers` (`track_id`,`listener_id`);--> statement-breakpoint
CREATE TABLE `listens` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` integer NOT NULL,
	`listener_id` text NOT NULL,
	`qualified` integer DEFAULT false NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`qualified_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_listens_track_listener_qualified` ON `listens` (`track_id`,`listener_id`,`qualified`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`title` text NOT NULL,
	`audio_url` text NOT NULL,
	`rights_attested` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
