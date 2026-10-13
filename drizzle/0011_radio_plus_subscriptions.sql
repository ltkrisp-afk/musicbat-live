CREATE TABLE IF NOT EXISTS radio_plus_enrollments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE,
 attempt INTEGER NOT NULL DEFAULT 0,
 checkout_session_id TEXT UNIQUE,
 subscription_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending',
 paid_until INTEGER NOT NULL DEFAULT 0,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS radio_plus_events (
 event_id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS radio_plus_invoices (
 invoice_id TEXT PRIMARY KEY,
 enrollment_id TEXT NOT NULL REFERENCES radio_plus_enrollments(id),
 subscription_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents = 300),
 paid_until INTEGER NOT NULL,
 verified_at INTEGER NOT NULL
);
