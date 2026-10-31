-- Additive release preparation only. No final agreement, acceptance or rights are seeded.
CREATE TABLE agreement_integrity (
 version TEXT PRIMARY KEY REFERENCES direct_license_versions(version),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 release_approved INTEGER NOT NULL DEFAULT 0 CHECK(release_approved IN (0,1)),
 approval_reference TEXT NOT NULL CHECK(length(trim(approval_reference))>0)
);
--> statement-breakpoint
CREATE TABLE agreement_review_receipts (
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL,agreement_version TEXT NOT NULL REFERENCES direct_license_versions(version),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),reviewed_at INTEGER NOT NULL CHECK(reviewed_at>0)
);
--> statement-breakpoint
CREATE TABLE artist_acceptance_evidence (
 acceptance_id TEXT PRIMARY KEY REFERENCES artist_license_acceptances(id),
 review_receipt_id TEXT NOT NULL REFERENCES agreement_review_receipts(id),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 reviewed_at INTEGER NOT NULL CHECK(reviewed_at>0),
 electronic_consent INTEGER NOT NULL CHECK(electronic_consent=1),
 retainable_copy_confirmed INTEGER NOT NULL CHECK(retainable_copy_confirmed=1),
 legal_name TEXT NOT NULL CHECK(length(trim(legal_name))>0),
 capacity TEXT NOT NULL CHECK(length(trim(capacity))>0),
 schedules_json TEXT NOT NULL CHECK(json_valid(schedules_json))
);
--> statement-breakpoint
CREATE TABLE recording_ingestion_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 state TEXT NOT NULL CHECK(state IN ('PENDING','CLAIMED','VERIFIED','FAILED')),
 uploaded_at INTEGER NOT NULL,
 verification_expires_at INTEGER NOT NULL,
 reviewed_at INTEGER NOT NULL,
 reviewer TEXT NOT NULL CHECK(length(trim(reviewer))>0),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>0),
 CHECK(verification_expires_at=uploaded_at+259200000),
 CHECK(state NOT IN ('CLAIMED','VERIFIED') OR reviewed_at<=verification_expires_at)
);
--> statement-breakpoint
CREATE INDEX idx_recording_ingestion_lookup ON recording_ingestion_events(track_id,verification_expires_at,state);
--> statement-breakpoint
CREATE VIEW recording_ingestion_current AS SELECT * FROM recording_ingestion_events e WHERE e.id=(SELECT MAX(id) FROM recording_ingestion_events WHERE track_id=e.track_id);
--> statement-breakpoint
CREATE TABLE recording_use_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 use TEXT NOT NULL CHECK(use IN ('discovery-preview','noninteractive-radio','free-stream','member-stream','download-sale','other')),
 decision TEXT NOT NULL CHECK(decision IN ('hold','cleared')),
 master_verified INTEGER NOT NULL CHECK(master_verified IN (0,1)),
 composition_verified INTEGER NOT NULL CHECK(composition_verified IN (0,1)),
 authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference))>0),
 compensation_reference TEXT NOT NULL CHECK(length(trim(compensation_reference))>0),
 recipient_reference TEXT NOT NULL CHECK(length(trim(recipient_reference))>0),
 territory TEXT NOT NULL CHECK(length(trim(territory))>0),
 starts_at INTEGER NOT NULL,expires_at INTEGER NOT NULL CHECK(expires_at>starts_at),
 license_required INTEGER NOT NULL CHECK(license_required IN (0,1)),
 platform_cost_cents INTEGER CHECK(platform_cost_cents>=0),
 payer TEXT CHECK(payer IN ('MusicBat','external')),funding_source TEXT,
 ceiling_bps INTEGER CHECK(ceiling_bps BETWEEN 0 AND 10000),ceiling_reference TEXT,
 counsel_required INTEGER NOT NULL DEFAULT 0 CHECK(counsel_required IN (0,1)),counsel_reference TEXT,
 reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),reviewed_at INTEGER NOT NULL CHECK(reviewed_at>0)
);
--> statement-breakpoint
CREATE VIEW recording_use_current AS SELECT * FROM recording_use_reviews e WHERE e.id=(SELECT MAX(id) FROM recording_use_reviews WHERE track_id=e.track_id AND use=e.use);
--> statement-breakpoint
-- A final-version signature grants private review only. Independent clearances follow.
CREATE TRIGGER final_license_upload_hold AFTER INSERT ON artist_license_acceptances WHEN NEW.agreement_version='2026-10-29.3'
 BEGIN
 UPDATE tracks SET sale_enabled=0,radio_enabled=0 WHERE id=NEW.track_id;
 INSERT INTO recording_ingestion_events(track_id,state,uploaded_at,verification_expires_at,reviewed_at,reviewer,evidence_reference)
 VALUES(NEW.track_id,'PENDING',NEW.accepted_at,NEW.accepted_at+259200000,NEW.accepted_at,'upload-server','signature-checked; content and rights review pending');
 END;
--> statement-breakpoint
-- Preserve blanket legacy holds; final-version decisions are independently gated.
DROP VIEW artist_rights_holds;
--> statement-breakpoint
CREATE VIEW artist_rights_holds AS SELECT d.track_id FROM artist_rights_declarations d JOIN artist_license_acceptances a ON a.id=d.acceptance_id
 WHERE a.agreement_version!='2026-10-29.3' AND ((d.review_required=1 AND COALESCE((SELECT r.decision FROM artist_rights_reviews r WHERE r.acceptance_id=d.acceptance_id ORDER BY r.id DESC LIMIT 1),'hold')!='cleared')
 OR (SELECT r.decision FROM artist_rights_reviews r WHERE r.acceptance_id=d.acceptance_id ORDER BY r.id DESC LIMIT 1)='hold');
--> statement-breakpoint
CREATE TRIGGER final_agreement_activation_insert BEFORE INSERT ON direct_license_current WHEN NEW.version='2026-10-29.3' AND NOT EXISTS(SELECT 1 FROM agreement_integrity WHERE version=NEW.version AND release_approved=1)
 BEGIN SELECT RAISE(ABORT,'Final agreement release approval required'); END;
--> statement-breakpoint
CREATE TRIGGER final_agreement_activation_update BEFORE UPDATE ON direct_license_current WHEN NEW.version='2026-10-29.3' AND NOT EXISTS(SELECT 1 FROM agreement_integrity WHERE version=NEW.version AND release_approved=1)
 BEGIN SELECT RAISE(ABORT,'Final agreement release approval required'); END;
--> statement-breakpoint
CREATE TRIGGER final_acceptance_digest BEFORE INSERT ON artist_acceptance_evidence
 WHEN NOT EXISTS(SELECT 1 FROM agreement_integrity WHERE version=(SELECT agreement_version FROM artist_license_acceptances WHERE id=NEW.acceptance_id)) OR NEW.sha256!=(SELECT sha256 FROM agreement_integrity WHERE version=(SELECT agreement_version FROM artist_license_acceptances WHERE id=NEW.acceptance_id))
 OR NEW.reviewed_at>(SELECT accepted_at FROM artist_license_acceptances WHERE id=NEW.acceptance_id)
 BEGIN SELECT RAISE(ABORT,'Acceptance integrity or review time mismatch'); END;
--> statement-breakpoint
CREATE TABLE platform_license_expenses (
 id TEXT PRIMARY KEY,track_id INTEGER NOT NULL REFERENCES tracks(id),use_review_id INTEGER NOT NULL REFERENCES recording_use_reviews(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),currency TEXT NOT NULL CHECK(currency='usd'),
 payer TEXT NOT NULL CHECK(payer='MusicBat'),payee_reference TEXT NOT NULL,funding_source TEXT NOT NULL,processor_reference TEXT NOT NULL UNIQUE,recorded_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE membership_revenue_events (
 source_id TEXT PRIMARY KEY,source_reference TEXT NOT NULL,month TEXT NOT NULL CHECK(length(month)=7),
 kind TEXT NOT NULL CHECK(kind IN ('receipt','principal-reversal','processing-fee','fee-credit')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 principal_reference TEXT,livemode INTEGER NOT NULL CHECK(livemode=1),settled INTEGER NOT NULL CHECK(settled=1),
 verified_by TEXT NOT NULL CHECK(length(trim(verified_by))>0),verified_at INTEGER NOT NULL,
 UNIQUE(kind,source_reference)
);
--> statement-breakpoint
CREATE TABLE streaming_eligible_plays (
 id TEXT PRIMARY KEY,month TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),listener_id TEXT NOT NULL,
 performance_id TEXT NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER NOT NULL,
 duration_ms INTEGER NOT NULL CHECK(duration_ms>0),delivered_ms INTEGER NOT NULL,
 member_verified INTEGER NOT NULL CHECK(member_verified=1),rights_review_id INTEGER NOT NULL REFERENCES recording_use_reviews(id),
 beneficiary_reference TEXT NOT NULL,delivery_reference TEXT NOT NULL,verified_by TEXT NOT NULL,
 CHECK(ended_at-started_at>=MIN(30000,duration_ms)),CHECK(delivered_ms>=MIN(30000,duration_ms)),
 UNIQUE(listener_id,track_id,performance_id)
);
--> statement-breakpoint
CREATE TABLE membership_pool_statements (
 month TEXT PRIMARY KEY,source_digest TEXT NOT NULL,statement_json TEXT NOT NULL CHECK(json_valid(statement_json)),
 closed_by TEXT NOT NULL CHECK(length(trim(closed_by))>0),closed_at INTEGER NOT NULL,previous_month TEXT REFERENCES membership_pool_statements(month)
);
--> statement-breakpoint
CREATE TABLE legal_record_holds (
 id TEXT PRIMARY KEY,track_id INTEGER REFERENCES tracks(id),category TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,released_by_event TEXT
);
--> statement-breakpoint
CREATE TABLE recording_delivery_restrictions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,track_id INTEGER NOT NULL REFERENCES tracks(id),restricted INTEGER NOT NULL CHECK(restricted IN (0,1)),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference))>0),reviewed_by TEXT NOT NULL,reviewed_at INTEGER NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER agreement_integrity_no_update BEFORE UPDATE ON agreement_integrity BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER agreement_integrity_no_delete BEFORE DELETE ON agreement_integrity BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER artist_acceptance_evidence_no_update BEFORE UPDATE ON artist_acceptance_evidence BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER artist_acceptance_evidence_no_delete BEFORE DELETE ON artist_acceptance_evidence BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_ingestion_events_no_update BEFORE UPDATE ON recording_ingestion_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_ingestion_events_no_delete BEFORE DELETE ON recording_ingestion_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_use_reviews_no_update BEFORE UPDATE ON recording_use_reviews BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_use_reviews_no_delete BEFORE DELETE ON recording_use_reviews BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER platform_license_expenses_no_update BEFORE UPDATE ON platform_license_expenses BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER platform_license_expenses_no_delete BEFORE DELETE ON platform_license_expenses BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER membership_revenue_events_no_update BEFORE UPDATE ON membership_revenue_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER membership_revenue_events_no_delete BEFORE DELETE ON membership_revenue_events BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_eligible_plays_no_update BEFORE UPDATE ON streaming_eligible_plays BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER streaming_eligible_plays_no_delete BEFORE DELETE ON streaming_eligible_plays BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER membership_pool_statements_no_update BEFORE UPDATE ON membership_pool_statements BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER membership_pool_statements_no_delete BEFORE DELETE ON membership_pool_statements BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER legal_record_holds_no_update BEFORE UPDATE ON legal_record_holds BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER legal_record_holds_no_delete BEFORE DELETE ON legal_record_holds BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_delivery_restrictions_no_update BEFORE UPDATE ON recording_delivery_restrictions BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;

--> statement-breakpoint
CREATE TRIGGER recording_delivery_restrictions_no_delete BEFORE DELETE ON recording_delivery_restrictions BEGIN SELECT RAISE(ABORT,'Evidence is append-only; use linked review/correction events'); END;
--> statement-breakpoint
CREATE VIEW recording_use_eligible AS SELECT r.* FROM recording_use_current r JOIN tracks t ON t.id=r.track_id
 WHERE t.status='active' AND r.decision='cleared' AND r.master_verified=1 AND r.composition_verified=1
 AND r.starts_at<=unixepoch('now')*1000 AND r.expires_at>unixepoch('now')*1000
 AND EXISTS(SELECT 1 FROM recording_ingestion_current i WHERE i.track_id=r.track_id AND i.state='VERIFIED')
 AND EXISTS(SELECT 1 FROM artist_license_acceptances a JOIN artist_acceptance_evidence e ON e.acceptance_id=a.id WHERE a.track_id=r.track_id AND a.agreement_version='2026-10-29.3')
 AND (r.counsel_required=0 OR length(trim(r.counsel_reference))>0)
 AND (r.license_required=0 OR (length(trim(r.funding_source))>0 AND
 (r.payer='external' OR (r.payer='MusicBat' AND r.platform_cost_cents IS NOT NULL AND r.ceiling_bps IS NOT NULL AND length(trim(r.ceiling_reference))>0
 AND r.platform_cost_cents*10000<=(t.sale_price_cents-CAST((t.sale_price_cents*85+50)/100 AS INTEGER))*r.ceiling_bps))));
--> statement-breakpoint
CREATE TRIGGER final_recording_sale_guard BEFORE UPDATE OF sale_enabled ON tracks
 WHEN NEW.sale_enabled=1 AND EXISTS(SELECT 1 FROM artist_license_acceptances WHERE track_id=NEW.id AND agreement_version='2026-10-29.3')
 AND NOT EXISTS(SELECT 1 FROM recording_use_eligible WHERE track_id=NEW.id AND use='download-sale')
 BEGIN SELECT RAISE(ABORT,'Independent download rights and verification required'); END;
--> statement-breakpoint
CREATE TRIGGER final_recording_radio_guard BEFORE UPDATE OF radio_enabled ON tracks
 WHEN NEW.radio_enabled=1 AND EXISTS(SELECT 1 FROM artist_license_acceptances WHERE track_id=NEW.id AND agreement_version='2026-10-29.3')
 AND (NOT EXISTS(SELECT 1 FROM recording_use_eligible WHERE track_id=NEW.id AND use IN ('free-stream','member-stream')) OR NOT EXISTS(SELECT 1 FROM recording_use_eligible WHERE track_id=NEW.id AND use='noninteractive-radio'))
 BEGIN SELECT RAISE(ABORT,'Independent streaming rights and verification required'); END;
--> statement-breakpoint
CREATE TRIGGER final_purchase_guard BEFORE INSERT ON purchases
 WHEN EXISTS(SELECT 1 FROM artist_license_acceptances WHERE track_id=NEW.track_id AND agreement_version='2026-10-29.3')
 AND NOT EXISTS(SELECT 1 FROM recording_use_eligible WHERE track_id=NEW.track_id AND use='download-sale')
 BEGIN SELECT RAISE(ABORT,'Download rights unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER final_use_hold AFTER INSERT ON recording_use_reviews WHEN NEW.decision='hold'
 BEGIN
 UPDATE tracks SET sale_enabled=0 WHERE id=NEW.track_id AND NEW.use='download-sale';
 END;
--> statement-breakpoint
CREATE TRIGGER eligible_play_not_owner BEFORE INSERT ON streaming_eligible_plays
 WHEN NEW.listener_id=(SELECT artist_id FROM tracks WHERE id=NEW.track_id)
 OR NEW.started_at>NEW.ended_at OR NEW.started_at<0
 OR strftime('%Y-%m',NEW.started_at/1000,'unixepoch')!=NEW.month
 OR strftime('%Y-%m',(NEW.ended_at-1)/1000,'unixepoch')!=NEW.month
 OR NOT EXISTS(SELECT 1 FROM recording_use_reviews r WHERE r.id=NEW.rights_review_id AND r.track_id=NEW.track_id AND r.use='member-stream' AND r.decision='cleared' AND r.starts_at<=NEW.started_at AND r.expires_at>=NEW.ended_at)
 OR EXISTS(SELECT 1 FROM streaming_eligible_plays p WHERE p.listener_id=NEW.listener_id AND p.started_at<NEW.ended_at AND p.ended_at>NEW.started_at)
 BEGIN SELECT RAISE(ABORT,'Member play evidence is ineligible or overlaps'); END;
--> statement-breakpoint
CREATE TRIGGER closed_membership_events BEFORE INSERT ON membership_revenue_events WHEN EXISTS(SELECT 1 FROM membership_pool_statements WHERE month=NEW.month)
 BEGIN SELECT RAISE(ABORT,'Closed month; add a linked correction in the next open month'); END;
--> statement-breakpoint
CREATE TRIGGER closed_membership_plays BEFORE INSERT ON streaming_eligible_plays WHEN EXISTS(SELECT 1 FROM membership_pool_statements WHERE month=NEW.month)
 BEGIN SELECT RAISE(ABORT,'Closed month; preserve original play evidence'); END;
--> statement-breakpoint
CREATE TABLE streaming_beneficiary_instructions (
 id TEXT PRIMARY KEY,track_id INTEGER NOT NULL REFERENCES tracks(id),designated_recipient TEXT NOT NULL,
 collection_authority_reference TEXT NOT NULL,payout_verified_reference TEXT NOT NULL,
 signed_model_reference TEXT NOT NULL,beneficiaries_json TEXT NOT NULL CHECK(json_valid(beneficiaries_json)),
 reviewed_by TEXT NOT NULL,reviewed_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER streaming_instructions_no_update BEFORE UPDATE ON streaming_beneficiary_instructions BEGIN SELECT RAISE(ABORT,'Instructions are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER streaming_instructions_no_delete BEFORE DELETE ON streaming_beneficiary_instructions BEGIN SELECT RAISE(ABORT,'Instructions are retained'); END;
--> statement-breakpoint
CREATE VIEW recording_payment_eligibility AS SELECT t.id AS track_id,
 CASE WHEN EXISTS(SELECT 1 FROM recording_use_eligible r WHERE r.track_id=t.id AND r.use IN ('download-sale','member-stream')) THEN 1 ELSE 0 END AS is_payable
 FROM tracks t JOIN artist_license_acceptances a ON a.track_id=t.id WHERE a.agreement_version='2026-10-29.3';

--> statement-breakpoint
CREATE TRIGGER agreement_review_no_update BEFORE UPDATE ON agreement_review_receipts BEGIN SELECT RAISE(ABORT,'Review evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agreement_review_no_delete BEFORE DELETE ON agreement_review_receipts BEGIN SELECT RAISE(ABORT,'Review evidence is retained'); END;
--> statement-breakpoint
CREATE INDEX idx_acceptance_recording_time ON artist_license_acceptances(track_id,accepted_at DESC);
--> statement-breakpoint
CREATE INDEX idx_use_recording_kind ON recording_use_reviews(track_id,use,id DESC);
