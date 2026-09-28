CREATE TABLE `track_keeps` (
	`track_id` integer NOT NULL,
	`listener_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_track_keeps_track_listener` ON `track_keeps` (`track_id`,`listener_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `track_keeps` (`track_id`, `listener_id`)
SELECT h.track_id, h.listener_id FROM `hangers` h
JOIN `tracks` t ON t.id = h.track_id
WHERE h.kind = 'keep_in_rotation' AND h.listener_id != t.artist_id;--> statement-breakpoint
INSERT INTO `radio_feedback` (`id`, `track_id`, `artist_id`, `listener_id`, `listen_id`, `energy_lane`, `signal`)
SELECT lower(hex(randomblob(16))), h.track_id, t.artist_id, h.listener_id,
  (SELECT l.id FROM `listens` l WHERE l.track_id = h.track_id AND l.listener_id = h.listener_id AND l.qualified = 1 ORDER BY l.qualified_at DESC LIMIT 1),
  t.energy_lane, 'up'
FROM `hangers` h JOIN `tracks` t ON t.id = h.track_id
WHERE h.kind IN ('standout', 'want_more') AND h.listener_id != t.artist_id
  AND EXISTS (SELECT 1 FROM `listens` l WHERE l.track_id = h.track_id AND l.listener_id = h.listener_id AND l.qualified = 1);--> statement-breakpoint
DROP TABLE `hangers`;--> statement-breakpoint
ALTER TABLE `listens` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `primary_genre` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `subgenre` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `mood_tags` text DEFAULT '[]' NOT NULL;
