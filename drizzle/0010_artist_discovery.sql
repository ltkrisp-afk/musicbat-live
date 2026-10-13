-- Additive discovery identity and opt-in follows. No historical rows removed.
CREATE TABLE artist_pages (account_id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO artist_pages(account_id,slug)
 SELECT artist_id,'artist-' || lower(hex(artist_id)) FROM tracks GROUP BY artist_id;
--> statement-breakpoint
INSERT OR IGNORE INTO artist_pages(account_id,slug)
 SELECT account_id,'artist-' || lower(hex(account_id)) FROM artist_profiles;
--> statement-breakpoint
CREATE TABLE artist_follows (
 listener_id TEXT NOT NULL, artist_id TEXT NOT NULL REFERENCES artist_pages(account_id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(listener_id,artist_id)
);
