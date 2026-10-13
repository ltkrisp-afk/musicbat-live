-- Existing tracks receive no inferred grants. Evidence must be reviewed before activation.
CREATE TABLE playback_permissions (
 track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
 recording_basis TEXT NOT NULL CHECK(recording_basis IN ('direct','statutory')),
 recording_evidence TEXT NOT NULL, composition_evidence TEXT NOT NULL,
 reviewed_by TEXT NOT NULL, reviewed_at INTEGER NOT NULL,
 artist_authorized INTEGER NOT NULL DEFAULT 0 CHECK(artist_authorized IN (0,1)),
 free_allowed INTEGER NOT NULL DEFAULT 0 CHECK(free_allowed IN (0,1)),
 plus_allowed INTEGER NOT NULL DEFAULT 0 CHECK(plus_allowed IN (0,1)),
 starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 withdrawn_at INTEGER, territory TEXT NOT NULL
);
CREATE TABLE playback_decisions (
 id TEXT PRIMARY KEY, track_id INTEGER NOT NULL, mode TEXT NOT NULL,
 allowed INTEGER NOT NULL, reason TEXT NOT NULL, decided_at INTEGER NOT NULL,
 permission_snapshot TEXT NOT NULL
);
CREATE INDEX idx_playback_decisions_track_time ON playback_decisions(track_id,decided_at);
