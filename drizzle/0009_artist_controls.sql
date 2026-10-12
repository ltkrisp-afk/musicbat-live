-- Additive only: retain existing owners, purchases, audio and audit history.
ALTER TABLE tracks ADD COLUMN style TEXT;
ALTER TABLE tracks ADD COLUMN radio_enabled INTEGER NOT NULL DEFAULT 1 CHECK(radio_enabled IN (0,1));
CREATE TABLE artist_profiles (
 account_id TEXT PRIMARY KEY, artist_name TEXT NOT NULL,
 verified_account_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE track_authority (
 track_id INTEGER NOT NULL REFERENCES tracks(id), account_id TEXT NOT NULL,
 granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_at INTEGER,
 PRIMARY KEY(track_id,account_id)
);
CREATE TABLE artist_track_audit (
 id TEXT PRIMARY KEY, track_id INTEGER NOT NULL, account_id TEXT NOT NULL,
 action TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL
);

ALTER TABLE listens ADD COLUMN radio_performance TEXT;
