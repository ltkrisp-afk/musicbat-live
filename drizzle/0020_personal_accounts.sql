-- Additive account surfaces and corroborated playback observations; no rights/payment activation.
CREATE TABLE account_preferences (
 account_id TEXT PRIMARY KEY,volume REAL NOT NULL DEFAULT 1 CHECK(volume>=0 AND volume<=1),
 muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN(0,1)),following_only INTEGER NOT NULL DEFAULT 0 CHECK(following_only IN(0,1)),updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE saved_recordings (
 account_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),saved_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,track_id)
);
--> statement-breakpoint
CREATE TABLE listening_delivery (
 id TEXT PRIMARY KEY,listener_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),performance_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN('test','live','unconfigured')),byte_start INTEGER NOT NULL,byte_end INTEGER NOT NULL,total_bytes INTEGER NOT NULL,
 delivered_at INTEGER NOT NULL,CHECK(byte_start>=0 AND byte_end>byte_start AND byte_end<=total_bytes)
);
--> statement-breakpoint
CREATE INDEX idx_observed_delivery ON listening_delivery(listener_id,performance_id,mode,delivered_at);
--> statement-breakpoint
CREATE TABLE listening_observations (
 listen_id TEXT PRIMARY KEY REFERENCES listens(id),listener_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),
 performance_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('test','live','unconfigured')),
 duration_ms INTEGER NOT NULL CHECK(duration_ms>0),performance_start INTEGER NOT NULL,performance_end INTEGER NOT NULL,
 first_offset_ms INTEGER NOT NULL,last_position_ms INTEGER NOT NULL,max_position_ms INTEGER NOT NULL,
 observed_ms INTEGER NOT NULL DEFAULT 0 CHECK(observed_ms>=0),last_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('active','paused','exited','completed')),exit_reason TEXT,
 verified_completion_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(listener_id,performance_id,mode)
);
--> statement-breakpoint
CREATE INDEX idx_observation_track_period ON listening_observations(track_id,mode,created_at);
--> statement-breakpoint
CREATE TABLE listening_observation_events (
 id TEXT PRIMARY KEY,listen_id TEXT NOT NULL REFERENCES listens(id),event TEXT NOT NULL,reason TEXT,observed_at INTEGER NOT NULL,
 position_ms INTEGER NOT NULL,accepted_ms INTEGER NOT NULL CHECK(accepted_ms>=0),
 UNIQUE(listen_id,event,observed_at,position_ms)
);
