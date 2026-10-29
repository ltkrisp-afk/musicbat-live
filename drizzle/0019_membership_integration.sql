-- Additive only; no activation or provider settings are changed.
CREATE TABLE radio_plus_enrollment_modes (
 enrollment_id TEXT PRIMARY KEY REFERENCES radio_plus_enrollments(id),
 mode TEXT NOT NULL CHECK(mode IN ('test','live'))
);
--> statement-breakpoint
CREATE TRIGGER enrollment_modes_immutable BEFORE UPDATE ON radio_plus_enrollment_modes BEGIN SELECT RAISE(ABORT,'Enrollment mode is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER enrollment_modes_retained BEFORE DELETE ON radio_plus_enrollment_modes BEGIN SELECT RAISE(ABORT,'Enrollment mode is retained'); END;
--> statement-breakpoint
CREATE TABLE membership_settlement_sources (
 id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 provider_account TEXT NOT NULL,provider_balance_reference TEXT NOT NULL,settled_at INTEGER NOT NULL,
 gross_cents INTEGER NOT NULL CHECK(gross_cents>=0),tax_cents INTEGER NOT NULL CHECK(tax_cents>=0),
 fee_cents INTEGER NOT NULL CHECK(fee_cents>=0),currency TEXT NOT NULL CHECK(currency='usd'),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),verified_at INTEGER NOT NULL,
 UNIQUE(mode,provider_account,provider_balance_reference)
);
--> statement-breakpoint
CREATE TABLE membership_test_revenue_events (
 source_id TEXT PRIMARY KEY,source_reference TEXT NOT NULL,month TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('receipt','principal-reversal','processing-fee','fee-credit')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),principal_reference TEXT,
 livemode INTEGER NOT NULL CHECK(livemode=0),settled INTEGER NOT NULL CHECK(settled=1),
 verified_by TEXT NOT NULL,verified_at INTEGER NOT NULL,UNIQUE(kind,source_reference)
);
--> statement-breakpoint
CREATE TABLE streaming_delivery_evidence (
 id TEXT PRIMARY KEY,listener_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),
 performance_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 delivered_ms INTEGER NOT NULL CHECK(delivered_ms>=0),delivered_at INTEGER NOT NULL,
 source_reference TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_stream_delivery_lookup ON streaming_delivery_evidence(listener_id,performance_id,mode,delivered_at);
--> statement-breakpoint
CREATE TABLE streaming_listening_sessions (
 id TEXT PRIMARY KEY,listener_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),
 performance_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 started_at INTEGER NOT NULL,last_at INTEGER NOT NULL,observed_ms INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL CHECK(duration_ms>0),rights_review_id INTEGER NOT NULL,
 beneficiary_reference TEXT NOT NULL,UNIQUE(listener_id,performance_id,mode)
);
--> statement-breakpoint
CREATE TABLE streaming_test_eligible_plays (
 id TEXT PRIMARY KEY,month TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),listener_id TEXT NOT NULL,
 performance_id TEXT NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER NOT NULL,duration_ms INTEGER NOT NULL,
 delivered_ms INTEGER NOT NULL,member_verified INTEGER NOT NULL CHECK(member_verified=1),
 rights_review_id INTEGER NOT NULL,beneficiary_reference TEXT NOT NULL,delivery_reference TEXT NOT NULL,verified_by TEXT NOT NULL,
 UNIQUE(listener_id,track_id,performance_id)
);
--> statement-breakpoint
CREATE TABLE membership_test_pool_statements (
 month TEXT PRIMARY KEY,source_digest TEXT NOT NULL,statement_json TEXT NOT NULL CHECK(json_valid(statement_json)),
 closed_by TEXT NOT NULL,closed_at INTEGER NOT NULL,previous_month TEXT
);

--> statement-breakpoint
CREATE TRIGGER membership_settlement_sources_no_update BEFORE UPDATE ON membership_settlement_sources BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER membership_settlement_sources_no_delete BEFORE DELETE ON membership_settlement_sources BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER membership_test_revenue_events_no_update BEFORE UPDATE ON membership_test_revenue_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER membership_test_revenue_events_no_delete BEFORE DELETE ON membership_test_revenue_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_delivery_evidence_no_update BEFORE UPDATE ON streaming_delivery_evidence BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_delivery_evidence_no_delete BEFORE DELETE ON streaming_delivery_evidence BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_test_eligible_plays_no_update BEFORE UPDATE ON streaming_test_eligible_plays BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_test_eligible_plays_no_delete BEFORE DELETE ON streaming_test_eligible_plays BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER membership_test_pool_statements_no_update BEFORE UPDATE ON membership_test_pool_statements BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER membership_test_pool_statements_no_delete BEFORE DELETE ON membership_test_pool_statements BEGIN SELECT RAISE(ABORT,'Evidence is append-only'); END;

--> statement-breakpoint
CREATE TABLE membership_reconciliation_jobs (
 invoice_id TEXT PRIMARY KEY REFERENCES radio_plus_invoices(invoice_id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','completed','review')),
 attempts INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT
);
--> statement-breakpoint
CREATE TRIGGER membership_invoice_reconcile AFTER INSERT ON radio_plus_invoices
 BEGIN INSERT OR IGNORE INTO membership_reconciliation_jobs(invoice_id,mode) VALUES(NEW.invoice_id,COALESCE((SELECT mode FROM radio_plus_enrollment_modes WHERE enrollment_id=NEW.enrollment_id),'test')); END;
--> statement-breakpoint
CREATE TRIGGER test_play_evidence_guard BEFORE INSERT ON streaming_test_eligible_plays
 WHEN NEW.listener_id=(SELECT artist_id FROM tracks WHERE id=NEW.track_id)
 OR NEW.ended_at-NEW.started_at<MIN(30000,NEW.duration_ms) OR NEW.delivered_ms<MIN(30000,NEW.duration_ms)
 OR NOT EXISTS(SELECT 1 FROM recording_use_reviews r WHERE r.id=NEW.rights_review_id AND r.track_id=NEW.track_id AND r.use='member-stream' AND r.decision='cleared' AND r.starts_at<=NEW.started_at AND r.expires_at>=NEW.ended_at)
 OR EXISTS(SELECT 1 FROM streaming_test_eligible_plays p WHERE p.listener_id=NEW.listener_id AND p.started_at<NEW.ended_at AND p.ended_at>NEW.started_at)
 BEGIN SELECT RAISE(ABORT,'Test play evidence is ineligible or overlaps'); END;
--> statement-breakpoint
CREATE TRIGGER closed_test_revenue BEFORE INSERT ON membership_test_revenue_events WHEN EXISTS(SELECT 1 FROM membership_test_pool_statements WHERE month=NEW.month)
 BEGIN SELECT RAISE(ABORT,'Closed test month; use linked next-open correction'); END;
--> statement-breakpoint
CREATE TRIGGER closed_test_plays BEFORE INSERT ON streaming_test_eligible_plays WHEN EXISTS(SELECT 1 FROM membership_test_pool_statements WHERE month=NEW.month)
 BEGIN SELECT RAISE(ABORT,'Closed test month'); END;
