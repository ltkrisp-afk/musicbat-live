CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_hash` text NOT NULL,
	`track_id` integer NOT NULL,
	`title` text NOT NULL,
	`artist_name` text NOT NULL,
	`audio_path` text NOT NULL,
	`status` text DEFAULT 'awaiting_checkout' NOT NULL,
	`amount_cents` integer,
	`currency` text DEFAULT 'usd' NOT NULL,
	`processor_account_id` text,
	`processor_session_id` text,
	`payment_intent_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_processor_session` ON `purchases` (`processor_session_id`);--> statement-breakpoint
CREATE INDEX `idx_purchases_payment_intent` ON `purchases` (`payment_intent_id`);