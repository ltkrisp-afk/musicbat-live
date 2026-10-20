ALTER TABLE purchases ADD COLUMN buyer_account_id TEXT;
--> statement-breakpoint
CREATE INDEX idx_purchases_buyer_account ON purchases(buyer_account_id, created_at);
--> statement-breakpoint
CREATE TABLE purchase_ownership_audit (
 purchase_id TEXT PRIMARY KEY REFERENCES purchases(id),
 account_id TEXT NOT NULL,
 evidence_type TEXT NOT NULL,
 processor_session_id TEXT NOT NULL,
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
