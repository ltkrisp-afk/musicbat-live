-- Independent of catalog status and permission review. No legacy backfill.
CREATE TABLE track_ingestion (
 track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
 source_key TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 source_size INTEGER NOT NULL CHECK(source_size>0 AND source_size<=26214400),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED','CHECKED','VERIFIED','FAILED')),
 uploaded_at INTEGER NOT NULL,
 verification_expires_at INTEGER NOT NULL CHECK(verification_expires_at=uploaded_at+259200000),
 is_payable INTEGER NOT NULL DEFAULT 0 CHECK(is_payable IN (0,1) AND (is_payable=0 OR state='VERIFIED')),
 claim_token TEXT,
 claim_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 technical_passed_at INTEGER,
 hold_reason TEXT,
 last_error TEXT,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_tracks_verification_lookup ON track_ingestion(state,verification_expires_at,next_attempt_at,claim_until);
--> statement-breakpoint
CREATE TABLE ingestion_reports (
 id TEXT PRIMARY KEY,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 event TEXT NOT NULL,
 detail TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
-- Final admission guard also covers a race after the checkout route's read.
CREATE TRIGGER ingestion_purchase_guard BEFORE INSERT ON purchases
WHEN EXISTS(SELECT 1 FROM track_ingestion i WHERE i.track_id=NEW.track_id AND
 (i.state!='VERIFIED' OR i.is_payable!=1 OR i.hold_reason IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Track verification is incomplete'); END;
