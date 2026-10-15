ALTER TABLE `purchases` ADD COLUMN `processing_cents` integer DEFAULT 0 NOT NULL CONSTRAINT purchases_processing_nonnegative CHECK (`processing_cents` >= 0);
