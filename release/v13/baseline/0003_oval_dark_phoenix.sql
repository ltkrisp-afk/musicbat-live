CREATE TABLE `artist_accounts` (
	`artist_id` text PRIMARY KEY NOT NULL,
	`stripe_account_id` text NOT NULL,
	`charges_enabled` integer DEFAULT false NOT NULL,
	`payouts_enabled` integer DEFAULT false NOT NULL,
	`details_submitted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artist_accounts_stripe_account` ON `artist_accounts` (`stripe_account_id`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `purchases` ADD `artist_id` text;--> statement-breakpoint
ALTER TABLE `purchases` ADD `artist_share_cents` integer;--> statement-breakpoint
ALTER TABLE `purchases` ADD `platform_fee_cents` integer;--> statement-breakpoint
ALTER TABLE `tracks` ADD `sale_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `sale_rights_attested` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `sale_price_cents` integer;--> statement-breakpoint
ALTER TABLE `tracks` ADD `sale_currency` text DEFAULT 'usd' NOT NULL;