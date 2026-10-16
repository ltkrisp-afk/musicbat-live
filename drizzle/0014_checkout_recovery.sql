CREATE TABLE checkout_recovery_jobs (
  purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES purchases(id),
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scan_cursor TEXT,
  observed_session_status TEXT,
  observed_payment_status TEXT
);
--> statement-breakpoint
CREATE INDEX idx_checkout_recovery_due ON checkout_recovery_jobs(state,next_attempt_at,lease_until);
--> statement-breakpoint
CREATE TABLE checkout_payment_evidence (
  event_id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  session_id TEXT NOT NULL,
  stripe_created INTEGER,
  paid_snapshot INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX idx_checkout_evidence_purchase ON checkout_payment_evidence(purchase_id,session_id,stripe_created);
--> statement-breakpoint
-- Captures both withdrawal and ambiguous creation. Existing completed records
-- are only resolved in the job table: no financial/entitlement rewrite.
CREATE TRIGGER checkout_recovery_enqueue AFTER UPDATE OF cleanup_state, processor_session_id, sale_withdrawn_at, status ON purchases
WHEN NEW.sale_withdrawn_at IS NOT NULL OR NEW.cleanup_state IS NOT NULL OR EXISTS(SELECT 1 FROM checkout_recovery_jobs WHERE purchase_id=NEW.id)
BEGIN
  INSERT INTO checkout_recovery_jobs(purchase_id,state,next_attempt_at,updated_at)
  VALUES(NEW.id, CASE WHEN NEW.status IN ('paid','refunded') OR (NEW.cleanup_state='expired' AND NEW.status!='payment_review') OR (NEW.sale_withdrawn_at IS NULL AND NEW.status='pending' AND NEW.processor_session_id IS NOT NULL AND NEW.cleanup_state IS NULL) THEN 'completed' ELSE 'pending' END,0,0)
  ON CONFLICT(purchase_id) DO UPDATE SET
    state=CASE
      WHEN NEW.status IN ('paid','refunded') OR (NEW.cleanup_state='expired' AND NEW.status!='payment_review') OR (NEW.sale_withdrawn_at IS NULL AND NEW.status='pending' AND NEW.processor_session_id IS NOT NULL AND NEW.cleanup_state IS NULL) THEN 'completed'
      WHEN checkout_recovery_jobs.state='completed' THEN 'pending'
      ELSE checkout_recovery_jobs.state END,
    next_attempt_at=CASE WHEN (OLD.sale_withdrawn_at IS NULL AND NEW.sale_withdrawn_at IS NOT NULL)
      OR (OLD.processor_session_id IS NULL AND NEW.processor_session_id IS NOT NULL AND NEW.sale_withdrawn_at IS NOT NULL)
      THEN 0 ELSE checkout_recovery_jobs.next_attempt_at END,
    lease_token=CASE WHEN NEW.status IN ('paid','refunded') THEN NULL ELSE checkout_recovery_jobs.lease_token END,
    lease_until=CASE WHEN NEW.status IN ('paid','refunded') THEN 0 ELSE checkout_recovery_jobs.lease_until END,
    last_error=CASE WHEN NEW.status IN ('paid','refunded') THEN NULL ELSE checkout_recovery_jobs.last_error END,
    updated_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER);
END;
--> statement-breakpoint
INSERT INTO checkout_recovery_jobs(purchase_id,state)
SELECT id,CASE WHEN status IN ('paid','refunded') OR (cleanup_state='expired' AND status!='payment_review') THEN 'completed' ELSE 'pending' END
FROM purchases WHERE sale_withdrawn_at IS NOT NULL OR cleanup_state IS NOT NULL;

--> statement-breakpoint
CREATE TRIGGER checkout_recovery_draft AFTER INSERT ON purchases
WHEN NEW.status='awaiting_checkout'
BEGIN
  INSERT INTO checkout_recovery_jobs(purchase_id,state,next_attempt_at)
  VALUES(NEW.id,'pending',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)+120000);
END;
--> statement-breakpoint
INSERT OR IGNORE INTO checkout_recovery_jobs(purchase_id,state,next_attempt_at)
SELECT id,'pending',0 FROM purchases WHERE status='awaiting_checkout' AND processor_session_id IS NULL;
