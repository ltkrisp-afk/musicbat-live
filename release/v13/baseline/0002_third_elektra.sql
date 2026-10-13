ALTER TABLE `tracks` ADD `keep_in_rotation` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Preserve an uploading artist's existing Keep in Rotation choice.
UPDATE tracks SET keep_in_rotation = 1
WHERE EXISTS (SELECT 1 FROM hangers h WHERE h.track_id = tracks.id
  AND h.listener_id = tracks.artist_id AND h.kind = 'keep_in_rotation');
