ALTER TABLE purchases ADD COLUMN processing_cents INTEGER NOT NULL DEFAULT 0 CHECK (processing_cents >= 0);
