-- Version 13 only. Immutable deployed migrations 0000–0004 precede this file.
-- Run with writes paused. Retain all original rows and timestamps in archives.
ALTER TABLE radio_feedback RENAME TO v13_radio_feedback_archive;
--> statement-breakpoint
ALTER TABLE track_keeps RENAME TO v13_track_keeps_archive;
--> statement-breakpoint
DROP INDEX idx_track_keeps_track_listener;
--> statement-breakpoint
ALTER TABLE tracks ADD energy_lane TEXT NOT NULL DEFAULT 'medium' CHECK(energy_lane IN ('soft','medium','hard','turbo'));
--> statement-breakpoint
CREATE TABLE radio_feedback (id TEXT PRIMARY KEY NOT NULL, track_id INTEGER NOT NULL, artist_id TEXT NOT NULL, listener_id TEXT NOT NULL, listen_id TEXT NOT NULL, energy_lane TEXT NOT NULL CHECK(energy_lane IN ('soft','medium','hard','turbo')), signal TEXT NOT NULL CHECK(signal IN ('up','down')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE INDEX idx_radio_feedback_lane_track ON radio_feedback(energy_lane,track_id);
--> statement-breakpoint
CREATE INDEX idx_radio_feedback_listener_lane ON radio_feedback(listener_id,energy_lane);
--> statement-breakpoint
CREATE INDEX idx_radio_feedback_listen ON radio_feedback(listen_id);
--> statement-breakpoint
INSERT INTO radio_feedback
SELECT 'v13-feedback-' || f.rowid, f.track_id,t.artist_id,f.listener_id,
 (SELECT l.id FROM listens l WHERE l.track_id=f.track_id AND l.listener_id=f.listener_id AND l.qualified=1 AND l.qualified_at<=f.updated_at ORDER BY l.qualified_at DESC,l.id DESC LIMIT 1),
 t.energy_lane,f.signal,f.updated_at
FROM v13_radio_feedback_archive f JOIN tracks t ON t.id=f.track_id
WHERE f.listener_id!=t.artist_id AND EXISTS(SELECT 1 FROM listens l WHERE l.track_id=f.track_id AND l.listener_id=f.listener_id AND l.qualified=1 AND l.qualified_at<=f.updated_at);
--> statement-breakpoint
CREATE TABLE track_keeps(track_id INTEGER NOT NULL,listener_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_track_keeps_track_listener ON track_keeps(track_id,listener_id);
--> statement-breakpoint
INSERT INTO track_keeps SELECT k.track_id,k.listener_id,k.created_at FROM v13_track_keeps_archive k JOIN tracks t ON t.id=k.track_id WHERE k.enabled=1 AND k.listener_id!=t.artist_id;
--> statement-breakpoint
-- Legacy Hangers remain unchanged. Explicit disabled Keeps/choices take precedence.
INSERT OR IGNORE INTO track_keeps SELECT h.track_id,h.listener_id,h.created_at FROM hangers h JOIN tracks t ON t.id=h.track_id WHERE h.kind='keep_in_rotation' AND h.listener_id!=t.artist_id AND NOT EXISTS(SELECT 1 FROM v13_track_keeps_archive k WHERE k.track_id=h.track_id AND k.listener_id=h.listener_id);
--> statement-breakpoint
INSERT INTO radio_feedback SELECT 'v13-hanger-'||h.id,h.track_id,t.artist_id,h.listener_id,
 (SELECT l.id FROM listens l WHERE l.track_id=h.track_id AND l.listener_id=h.listener_id AND l.qualified=1 AND l.qualified_at<=h.created_at ORDER BY l.qualified_at DESC,l.id DESC LIMIT 1),
 t.energy_lane,'up',h.created_at FROM hangers h JOIN tracks t ON t.id=h.track_id
WHERE h.kind IN ('standout','want_more') AND h.listener_id!=t.artist_id
 AND NOT EXISTS(SELECT 1 FROM v13_radio_feedback_archive f WHERE f.track_id=h.track_id AND f.listener_id=h.listener_id)
 AND EXISTS(SELECT 1 FROM listens l WHERE l.track_id=h.track_id AND l.listener_id=h.listener_id AND l.qualified=1 AND l.qualified_at<=h.created_at);
--> statement-breakpoint
ALTER TABLE listens ADD completed_at TEXT;
--> statement-breakpoint
ALTER TABLE tracks ADD primary_genre TEXT NOT NULL DEFAULT 'Other';
--> statement-breakpoint
ALTER TABLE tracks ADD subgenre TEXT;
--> statement-breakpoint
ALTER TABLE tracks ADD mood_tags TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
CREATE TABLE release_signal_reconciliation(scope TEXT PRIMARY KEY, source_rows INTEGER NOT NULL, archive_rows INTEGER NOT NULL, converted_rows INTEGER NOT NULL, excluded_rows INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO release_signal_reconciliation SELECT 'feedback',count(*),count(*),(SELECT count(*) FROM radio_feedback WHERE id LIKE 'v13-feedback-%'),count(*)-(SELECT count(*) FROM radio_feedback WHERE id LIKE 'v13-feedback-%') FROM v13_radio_feedback_archive;
--> statement-breakpoint
INSERT INTO release_signal_reconciliation SELECT 'keeps',count(*),count(*),(SELECT count(*) FROM track_keeps k JOIN v13_track_keeps_archive a USING(track_id,listener_id)),count(*)-(SELECT count(*) FROM track_keeps k JOIN v13_track_keeps_archive a USING(track_id,listener_id)) FROM v13_track_keeps_archive;
--> statement-breakpoint
INSERT INTO release_signal_reconciliation SELECT 'hangers',count(*),count(*),(SELECT count(*) FROM radio_feedback WHERE id LIKE 'v13-hanger-%')+(SELECT count(*) FROM track_keeps k WHERE NOT EXISTS(SELECT 1 FROM v13_track_keeps_archive a WHERE a.track_id=k.track_id AND a.listener_id=k.listener_id)),count(*)-(SELECT count(*) FROM radio_feedback WHERE id LIKE 'v13-hanger-%')-(SELECT count(*) FROM track_keeps k WHERE NOT EXISTS(SELECT 1 FROM v13_track_keeps_archive a WHERE a.track_id=k.track_id AND a.listener_id=k.listener_id)) FROM hangers;
