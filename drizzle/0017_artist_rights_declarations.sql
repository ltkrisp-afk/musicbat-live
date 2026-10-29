-- Additive only: no legacy catalog changes, agreement activation or review approvals.
CREATE TABLE artist_rights_declarations (
 acceptance_id TEXT PRIMARY KEY NOT NULL REFERENCES artist_license_acceptances(id),
 track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id),
 declaration_version TEXT NOT NULL,
 declaration_json TEXT NOT NULL CHECK(json_valid(declaration_json)),
 review_required INTEGER NOT NULL CHECK(review_required IN (0,1))
);
--> statement-breakpoint
CREATE TRIGGER artist_rights_declarations_no_update BEFORE UPDATE ON artist_rights_declarations BEGIN SELECT RAISE(ABORT, 'Rights declarations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER artist_rights_declarations_no_delete BEFORE DELETE ON artist_rights_declarations BEGIN SELECT RAISE(ABORT, 'Rights declarations are retained'); END;
--> statement-breakpoint
-- An authorized review is a separate append-only decision, never an artist form value.
CREATE TABLE artist_rights_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 acceptance_id TEXT NOT NULL REFERENCES artist_rights_declarations(acceptance_id),
 decision TEXT NOT NULL CHECK(decision IN ('hold','cleared')),
 reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
 reviewed_at INTEGER NOT NULL CHECK(reviewed_at>0),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>0)
);
--> statement-breakpoint
CREATE TRIGGER artist_rights_reviews_no_update BEFORE UPDATE ON artist_rights_reviews BEGIN SELECT RAISE(ABORT, 'Rights reviews are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER artist_rights_reviews_no_delete BEFORE DELETE ON artist_rights_reviews BEGIN SELECT RAISE(ABORT, 'Rights reviews are retained'); END;
--> statement-breakpoint
CREATE VIEW artist_rights_holds AS SELECT d.track_id FROM artist_rights_declarations d
 WHERE (d.review_required=1 AND COALESCE((SELECT r.decision FROM artist_rights_reviews r WHERE r.acceptance_id=d.acceptance_id ORDER BY r.id DESC LIMIT 1),'hold')!='cleared')
 OR (SELECT r.decision FROM artist_rights_reviews r WHERE r.acceptance_id=d.acceptance_id ORDER BY r.id DESC LIMIT 1)='hold';
--> statement-breakpoint
CREATE TRIGGER artist_rights_hold_sale BEFORE UPDATE OF sale_enabled,radio_enabled ON tracks
 WHEN (NEW.sale_enabled=1 OR NEW.radio_enabled=1) AND EXISTS(SELECT 1 FROM artist_rights_holds WHERE track_id=NEW.id)
 BEGIN SELECT RAISE(ABORT, 'Rights review is required'); END;
--> statement-breakpoint
CREATE TRIGGER artist_rights_hold_playback BEFORE INSERT ON playback_permissions
 WHEN EXISTS(SELECT 1 FROM artist_rights_holds WHERE track_id=NEW.track_id)
 BEGIN SELECT RAISE(ABORT, 'Rights review is required'); END;
--> statement-breakpoint
CREATE TRIGGER artist_rights_hold_playback_update BEFORE UPDATE ON playback_permissions
 WHEN NEW.withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM artist_rights_holds WHERE track_id=NEW.track_id)
 BEGIN SELECT RAISE(ABORT, 'Rights review is required'); END;
--> statement-breakpoint
CREATE TRIGGER artist_rights_review_hold AFTER INSERT ON artist_rights_reviews WHEN NEW.decision='hold'
 BEGIN
 UPDATE tracks SET sale_enabled=0,radio_enabled=0 WHERE id=(SELECT track_id FROM artist_rights_declarations WHERE acceptance_id=NEW.acceptance_id);
 UPDATE playback_permissions SET withdrawn_at=NEW.reviewed_at WHERE track_id=(SELECT track_id FROM artist_rights_declarations WHERE acceptance_id=NEW.acceptance_id);
 END;
--> statement-breakpoint
CREATE TRIGGER direct_license_no_draft_insert BEFORE INSERT ON direct_license_current WHEN lower(NEW.version) LIKE 'draft-%'
 BEGIN SELECT RAISE(ABORT, 'Draft agreements cannot be activated'); END;
--> statement-breakpoint
CREATE TRIGGER direct_license_no_draft_update BEFORE UPDATE ON direct_license_current WHEN lower(NEW.version) LIKE 'draft-%'
 BEGIN SELECT RAISE(ABORT, 'Draft agreements cannot be activated'); END;
