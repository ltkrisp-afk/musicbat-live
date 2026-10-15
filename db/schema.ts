import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  artistId: text("artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  title: text("title").notNull(),
  audioUrl: text("audio_url").notNull(),
  rightsAttested: integer("rights_attested", { mode: "boolean" }).notNull().default(true),
  keepInRotation: integer("keep_in_rotation", { mode: "boolean" }).notNull().default(false),
  saleEnabled: integer("sale_enabled", { mode: "boolean" }).notNull().default(false),
  saleRightsAttested: integer("sale_rights_attested", { mode: "boolean" }).notNull().default(false),
  salePriceCents: integer("sale_price_cents"),
  saleCurrency: text("sale_currency").notNull().default("usd"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const listens = sqliteTable(
  "listens",
  {
    id: text("id").primaryKey(),
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    qualified: integer("qualified", { mode: "boolean" }).notNull().default(false),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    qualifiedAt: text("qualified_at"),
  },
  (table) => [
    index("idx_listens_track_listener_qualified").on(
      table.trackId,
      table.listenerId,
      table.qualified,
    ),
  ],
);

export const hangers = sqliteTable(
  "hangers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_hangers_track_listener").on(table.trackId, table.listenerId),
  ],
);

// Snapshot the song at Buy time so rotation or catalog edits cannot change delivery.
// Checkout integration fills amount/session/account only after pricing and sale rights are approved.
export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  buyerHash: text("buyer_hash").notNull(),
  trackId: integer("track_id").notNull(),
  title: text("title").notNull(),
  artistName: text("artist_name").notNull(),
  artistId: text("artist_id"),
  audioPath: text("audio_path").notNull(),
  status: text("status").notNull().default("awaiting_checkout"),
  amountCents: integer("amount_cents"),
  processingCents: integer("processing_cents").notNull().default(0),
  artistShareCents: integer("artist_share_cents"),
  platformFeeCents: integer("platform_fee_cents"),
  currency: text("currency").notNull().default("usd"),
  processorAccountId: text("processor_account_id"),
  processorSessionId: text("processor_session_id"),
  paymentIntentId: text("payment_intent_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: text("paid_at"),
}, (table) => [
  check("purchases_processing_nonnegative", sql`${table.processingCents} >= 0`),
  uniqueIndex("idx_purchases_processor_session").on(table.processorSessionId),
  index("idx_purchases_payment_intent").on(table.paymentIntentId),
]);

export const artistAccounts = sqliteTable("artist_accounts", {
  artistId: text("artist_id").primaryKey(),
  stripeAccountId: text("stripe_account_id").notNull(),
  chargesEnabled: integer("charges_enabled", { mode: "boolean" }).notNull().default(false),
  payoutsEnabled: integer("payouts_enabled", { mode: "boolean" }).notNull().default(false),
  detailsSubmitted: integer("details_submitted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_artist_accounts_stripe_account").on(table.stripeAccountId),
]);

export const stripeEvents = sqliteTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: text("processed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Current listener choices; legacy hangers remain immutable and are read as fallback.
export const radioFeedback = sqliteTable("radio_feedback", {
  trackId: integer("track_id").notNull(),
  listenerId: text("listener_id").notNull(),
  signal: text("signal", { enum: ["up", "down"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_radio_feedback_track_listener").on(table.trackId, table.listenerId),
  check("radio_feedback_signal", sql`${table.signal} IN ('up', 'down')`),
]);

export const trackKeeps = sqliteTable("track_keeps", {
  trackId: integer("track_id").notNull(),
  listenerId: text("listener_id").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_track_keeps_track_listener").on(table.trackId, table.listenerId),
  check("track_keeps_enabled", sql`${table.enabled} IN (0, 1)`),
]);
