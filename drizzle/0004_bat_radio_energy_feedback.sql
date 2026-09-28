ALTER TABLE `tracks` ADD `energy_lane` text DEFAULT 'medium' NOT NULL CHECK (`energy_lane` IN ('soft', 'medium', 'hard', 'turbo'));
--> statement-breakpoint
CREATE TABLE `radio_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` integer NOT NULL,
	`artist_id` text NOT NULL,
	`listener_id` text NOT NULL,
	`listen_id` text NOT NULL,
	`energy_lane` text NOT NULL CHECK (`energy_lane` IN ('soft', 'medium', 'hard', 'turbo')),
	`signal` text NOT NULL CHECK (`signal` IN ('up', 'down')),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_radio_feedback_lane_track` ON `radio_feedback` (`energy_lane`,`track_id`);
--> statement-breakpoint
CREATE INDEX `idx_radio_feedback_listener_lane` ON `radio_feedback` (`listener_id`,`energy_lane`);
--> statement-breakpoint
CREATE INDEX `idx_radio_feedback_listen` ON `radio_feedback` (`listen_id`);
