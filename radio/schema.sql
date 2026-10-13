-- Private runtime authority. Deliberately separate from D1/application migrations.
CREATE TABLE IF NOT EXISTS radio_sources (
 id TEXT PRIMARY KEY, track_json TEXT NOT NULL, asset_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','withdrawn')), updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS radio_memberships (
 listener_id TEXT PRIMARY KEY, plus_until INTEGER, evidence TEXT NOT NULL,
 withdrawn_at INTEGER
);
CREATE TABLE IF NOT EXISTS radio_runtime_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, track_id TEXT, action TEXT NOT NULL,
 decided_at INTEGER NOT NULL, detail TEXT NOT NULL
);
