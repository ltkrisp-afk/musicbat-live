-- No agreement is seeded: only complete, approved text may be activated.
CREATE TABLE direct_license_versions (
 version TEXT PRIMARY KEY NOT NULL CHECK(length(trim(version)) > 0),
 body TEXT NOT NULL CHECK(length(trim(body)) > 0),
 acceptance_text TEXT NOT NULL CHECK(length(trim(acceptance_text)) > 0),
 approved_by TEXT NOT NULL CHECK(length(trim(approved_by)) > 0),
 approved_at INTEGER NOT NULL CHECK(approved_at > 0)
);
--> statement-breakpoint
CREATE TABLE direct_license_current (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 version TEXT NOT NULL REFERENCES direct_license_versions(version)
);
--> statement-breakpoint
CREATE TABLE artist_license_acceptances (
 id TEXT PRIMARY KEY NOT NULL,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 account_id TEXT NOT NULL,
 agreement_version TEXT NOT NULL REFERENCES direct_license_versions(version),
 accepted INTEGER NOT NULL CHECK(accepted = 1),
 accepted_at INTEGER NOT NULL CHECK(accepted_at > 0)
);
--> statement-breakpoint
CREATE INDEX idx_artist_license_acceptances_account ON artist_license_acceptances(account_id, accepted_at);
--> statement-breakpoint
CREATE TRIGGER direct_license_versions_no_update BEFORE UPDATE ON direct_license_versions BEGIN SELECT RAISE(ABORT, 'Agreement versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER direct_license_versions_no_delete BEFORE DELETE ON direct_license_versions BEGIN SELECT RAISE(ABORT, 'Agreement versions are retained'); END;
--> statement-breakpoint
CREATE TRIGGER artist_license_acceptances_no_update BEFORE UPDATE ON artist_license_acceptances BEGIN SELECT RAISE(ABORT, 'Acceptance records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER artist_license_acceptances_no_delete BEFORE DELETE ON artist_license_acceptances BEGIN SELECT RAISE(ABORT, 'Acceptance records are retained'); END;
--> statement-breakpoint
-- Preserve historical $3 evidence while accepting the corrected $5 invoices.
CREATE TABLE radio_plus_invoices_v2 (
 invoice_id TEXT PRIMARY KEY,
 enrollment_id TEXT NOT NULL REFERENCES radio_plus_enrollments(id),
 subscription_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents IN (300,500)),
 paid_until INTEGER NOT NULL,
 verified_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO radio_plus_invoices_v2 SELECT * FROM radio_plus_invoices;
--> statement-breakpoint
DROP TABLE radio_plus_invoices;
--> statement-breakpoint
ALTER TABLE radio_plus_invoices_v2 RENAME TO radio_plus_invoices;
