-- Additive metadata; identifiers and credits are declarations, never proof of rights.
ALTER TABLE tracks ADD COLUMN recording_metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tracks ADD COLUMN technical_metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tracks ADD COLUMN compilation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(compilation_allowed IN (0,1));
ALTER TABLE tracks ADD COLUMN licensing_allowed INTEGER NOT NULL DEFAULT 0 CHECK(licensing_allowed IN (0,1));
CREATE INDEX idx_tracks_artist_status ON tracks(artist_id,status,id);
CREATE INDEX idx_track_authority_account ON track_authority(account_id,revoked_at,track_id);
