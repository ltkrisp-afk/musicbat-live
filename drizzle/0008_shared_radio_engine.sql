-- Offline engine ledger. No production migration or audio delivery is authorized.
CREATE TABLE radio_engine_channels (
 id TEXT PRIMARY KEY, config_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 last_clock INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 ledger_sequence INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE radio_engine_catalog (
 id TEXT PRIMARY KEY, track_json TEXT NOT NULL
);
CREATE TABLE radio_engine_events (
 channel_id TEXT NOT NULL REFERENCES radio_engine_channels(id), sequence INTEGER NOT NULL,
 track_json TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
 closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
 CHECK(ended_at > started_at), PRIMARY KEY(channel_id,sequence)
);
CREATE TABLE radio_engine_decisions (
 channel_id TEXT NOT NULL REFERENCES radio_engine_channels(id), revision INTEGER NOT NULL,
 decided_at INTEGER NOT NULL, decisions_json TEXT NOT NULL, reason TEXT NOT NULL,
 PRIMARY KEY(channel_id,revision)
);
CREATE TABLE radio_engine_sessions (
 listener_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES radio_engine_channels(id),
 updated_at INTEGER NOT NULL
);
CREATE INDEX radio_engine_event_time ON radio_engine_events(channel_id,ended_at);
