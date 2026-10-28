-- Existing enrollment and invoice amounts remain historical evidence.
ALTER TABLE radio_plus_enrollments ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 300 CHECK(price_cents IN (300,500));
--> statement-breakpoint
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
