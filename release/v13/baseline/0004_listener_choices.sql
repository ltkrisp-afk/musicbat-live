CREATE TABLE `radio_feedback` (
	`track_id` integer NOT NULL,
	`listener_id` text NOT NULL,
	`signal` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "radio_feedback_signal" CHECK("radio_feedback"."signal" IN ('up', 'down'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_radio_feedback_track_listener` ON `radio_feedback` (`track_id`,`listener_id`);--> statement-breakpoint
CREATE TABLE `track_keeps` (
	`track_id` integer NOT NULL,
	`listener_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "track_keeps_enabled" CHECK("track_keeps"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_track_keeps_track_listener` ON `track_keeps` (`track_id`,`listener_id`);