-- Append-only operational cases. A complaint is an allegation; only a reviewed hold gates a use.
CREATE TABLE rights_case_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 case_id TEXT NOT NULL,track_id INTEGER NOT NULL REFERENCES tracks(id),
 use TEXT NOT NULL CHECK(use IN ('discovery-preview','noninteractive-radio','free-stream','member-stream','download-sale','other')),
 state TEXT NOT NULL CHECK(state IN ('received','hold','resolved')),
 actor_id TEXT NOT NULL CHECK(length(trim(actor_id))>0),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference))>0),created_at INTEGER NOT NULL
);
CREATE INDEX rights_case_recording ON rights_case_events(track_id,use,case_id,id);
CREATE VIEW rights_case_current AS SELECT * FROM rights_case_events e WHERE e.id=(SELECT MAX(id) FROM rights_case_events WHERE case_id=e.case_id);
CREATE TRIGGER rights_case_no_update BEFORE UPDATE ON rights_case_events BEGIN SELECT RAISE(ABORT,'Rights case evidence is append-only'); END;
CREATE TRIGGER rights_case_no_delete BEFORE DELETE ON rights_case_events BEGIN SELECT RAISE(ABORT,'Rights case evidence is retained'); END;
CREATE TRIGGER rights_case_sale_guard BEFORE UPDATE OF sale_enabled ON tracks WHEN NEW.sale_enabled=1 AND EXISTS(SELECT 1 FROM rights_case_current WHERE track_id=NEW.id AND use='download-sale' AND state='hold') BEGIN SELECT RAISE(ABORT,'Reviewed download rights case is on hold'); END;
CREATE TRIGGER rights_case_purchase_guard BEFORE INSERT ON purchases WHEN EXISTS(SELECT 1 FROM rights_case_current WHERE track_id=NEW.track_id AND use='download-sale' AND state='hold') BEGIN SELECT RAISE(ABORT,'Reviewed download rights case is on hold'); END;
CREATE TRIGGER rights_case_hold_new_sales AFTER INSERT ON rights_case_events WHEN NEW.state='hold' AND NEW.use='download-sale' BEGIN UPDATE tracks SET sale_enabled=0 WHERE id=NEW.track_id; END;
DROP VIEW recording_payment_eligibility;
CREATE VIEW recording_payment_eligibility AS SELECT t.id AS track_id,CASE WHEN EXISTS(SELECT 1 FROM recording_use_eligible r WHERE r.track_id=t.id AND r.use IN ('download-sale','member-stream') AND NOT EXISTS(SELECT 1 FROM rights_case_current c WHERE c.track_id=r.track_id AND c.use=r.use AND c.state='hold')) THEN 1 ELSE 0 END AS is_payable FROM tracks t JOIN artist_license_acceptances a ON a.track_id=t.id WHERE a.agreement_version='2026-10-29.3';
-- Preserve explicitly known historical agreements; unknown future versions fail closed.
CREATE TABLE agreement_clearance_policy(version TEXT PRIMARY KEY,model TEXT NOT NULL CHECK(model IN ('legacy','scoped')));
INSERT INTO agreement_clearance_policy SELECT version,'legacy' FROM direct_license_versions WHERE version!='2026-10-29.3' AND lower(version) NOT LIKE 'draft-%' AND lower(version) NOT LIKE 'proposed-%';
INSERT INTO agreement_clearance_policy VALUES('2026-10-29.3','scoped');
