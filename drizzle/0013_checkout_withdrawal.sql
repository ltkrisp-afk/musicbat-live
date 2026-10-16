ALTER TABLE purchases ADD COLUMN sale_withdrawn_at INTEGER;
--> statement-breakpoint
ALTER TABLE purchases ADD COLUMN checkout_request_json TEXT;
--> statement-breakpoint
ALTER TABLE purchases ADD COLUMN cleanup_state TEXT;
--> statement-breakpoint
ALTER TABLE purchases ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE purchases ADD COLUMN cleanup_error TEXT;
--> statement-breakpoint
ALTER TABLE purchases ADD COLUMN payment_review_reason TEXT;
--> statement-breakpoint
CREATE INDEX idx_purchases_withdrawal_cleanup ON purchases(track_id, cleanup_state);
--> statement-breakpoint
-- Same SQLite transaction as the artist's permission write. Repeated withdrawal
-- and re-enabling never erase the first cutoff for an already-issued purchase.
CREATE TRIGGER track_sales_withdrawal AFTER UPDATE OF sale_enabled, sale_rights_attested, rights_attested, status ON tracks
WHEN NEW.sale_enabled != 1 OR NEW.sale_rights_attested != 1 OR NEW.rights_attested != 1 OR NEW.status != 'active'
BEGIN
  UPDATE purchases SET
    sale_withdrawn_at = COALESCE(sale_withdrawn_at, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
    cleanup_state = CASE WHEN cleanup_state IN ('expired','payment_review') THEN cleanup_state ELSE 'pending' END
  WHERE track_id = NEW.id AND status NOT IN ('paid','refunded');
END;
--> statement-breakpoint
-- Existing withdrawn/unresolved orders have no reliable historical cutoff.
-- Zero deliberately routes them to review rather than inventing permission.
UPDATE purchases SET sale_withdrawn_at=0, cleanup_state='pending'
WHERE status NOT IN ('paid','refunded') AND EXISTS (
  SELECT 1 FROM tracks t WHERE t.id=purchases.track_id AND
  (t.sale_enabled!=1 OR t.sale_rights_attested!=1 OR t.rights_attested!=1 OR t.status!='active')
);
