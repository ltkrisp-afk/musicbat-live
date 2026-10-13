-- Pause every writer first. One-time rollback only; additive and financial tables retained.
-- Keep target evidence permanently. Never restore a pre-sale database over new writes.
ALTER TABLE radio_feedback RENAME TO release_radio_feedback_archive;
ALTER TABLE track_keeps RENAME TO release_track_keeps_archive;
DROP INDEX idx_radio_feedback_track_listener;
DROP INDEX idx_track_keeps_track_listener;
CREATE TABLE radio_feedback(track_id INTEGER NOT NULL,listener_id TEXT NOT NULL,signal TEXT NOT NULL CHECK(signal IN ('up','down')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_radio_feedback_track_listener ON radio_feedback(track_id,listener_id);
INSERT INTO radio_feedback SELECT track_id,listener_id,signal,created_at,updated_at FROM v13_radio_feedback_archive;
INSERT INTO radio_feedback(track_id,listener_id,signal,created_at,updated_at)
SELECT f.track_id,f.listener_id,f.signal,f.created_at,f.created_at FROM release_radio_feedback_archive f
WHERE f.rowid=(SELECT f2.rowid FROM release_radio_feedback_archive f2 WHERE f2.track_id=f.track_id AND f2.listener_id=f.listener_id ORDER BY f2.created_at DESC,f2.rowid DESC LIMIT 1)
ON CONFLICT(track_id,listener_id) DO UPDATE SET signal=excluded.signal,updated_at=excluded.updated_at WHERE excluded.updated_at>=radio_feedback.updated_at;
CREATE TABLE track_keeps(track_id INTEGER NOT NULL,listener_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX idx_track_keeps_track_listener ON track_keeps(track_id,listener_id);
INSERT INTO track_keeps SELECT track_id,listener_id,enabled,created_at,updated_at FROM v13_track_keeps_archive;
-- Deleted converted Keeps stay disabled; self/invalid archived rows remain untouched.
UPDATE track_keeps SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE enabled=1 AND listener_id!=(SELECT artist_id FROM tracks WHERE id=track_keeps.track_id) AND EXISTS(SELECT 1 FROM tracks WHERE id=track_keeps.track_id) AND NOT EXISTS(SELECT 1 FROM release_track_keeps_archive k WHERE k.track_id=track_keeps.track_id AND k.listener_id=track_keeps.listener_id);
INSERT INTO track_keeps(track_id,listener_id,enabled,created_at,updated_at)
SELECT track_id,listener_id,1,created_at,created_at FROM release_track_keeps_archive WHERE true
ON CONFLICT(track_id,listener_id) DO UPDATE SET updated_at=CASE WHEN track_keeps.enabled=1 AND excluded.created_at=track_keeps.created_at THEN track_keeps.updated_at ELSE excluded.updated_at END,enabled=1;
