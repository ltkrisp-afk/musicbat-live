import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  artistId: text("artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  title: text("title").notNull(),
  audioUrl: text("audio_url").notNull(),
  recordingMetadata: text("recording_metadata").notNull().default("{}"),
  technicalMetadata: text("technical_metadata").notNull().default("{}"),
  compilationAllowed: integer("compilation_allowed", {mode:"boolean"}).notNull().default(false),
  licensingAllowed: integer("licensing_allowed", {mode:"boolean"}).notNull().default(false),
  rightsAttested: integer("rights_attested", { mode: "boolean" }).notNull().default(true),
  keepInRotation: integer("keep_in_rotation", { mode: "boolean" }).notNull().default(false),
  energyLane: text("energy_lane").notNull().default("medium"),
  primaryGenre: text("primary_genre").notNull().default("Other"),
  subgenre: text("subgenre"),
  style: text("style"),
  radioEnabled: integer("radio_enabled", {mode:"boolean"}).notNull().default(true),
  moodTags: text("mood_tags").notNull().default("[]"),
  saleEnabled: integer("sale_enabled", { mode: "boolean" }).notNull().default(false),
  saleRightsAttested: integer("sale_rights_attested", { mode: "boolean" }).notNull().default(false),
  salePriceCents: integer("sale_price_cents"),
  saleCurrency: text("sale_currency").notNull().default("usd"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const radioFeedback = sqliteTable("radio_feedback", {
  id: text("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  artistId: text("artist_id").notNull(),
  listenerId: text("listener_id").notNull(),
  listenId: text("listen_id").notNull(),
  energyLane: text("energy_lane").notNull(),
  signal: text("signal").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_radio_feedback_lane_track").on(table.energyLane, table.trackId),
  index("idx_radio_feedback_listener_lane").on(table.listenerId, table.energyLane),
  index("idx_radio_feedback_listen").on(table.listenId),
]);

export const listens = sqliteTable(
  "listens",
  {
    id: text("id").primaryKey(),
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    qualified: integer("qualified", { mode: "boolean" }).notNull().default(false),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    qualifiedAt: text("qualified_at"),
    completedAt: text("completed_at"),
    radioPerformance: text("radio_performance"),
  },
  (table) => [
    index("idx_listens_track_listener_qualified").on(
      table.trackId,
      table.listenerId,
      table.qualified,
    ),
  ],
);

export const trackKeeps = sqliteTable(
  "track_keeps",
  {
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_track_keeps_track_listener").on(table.trackId, table.listenerId),
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
  artistShareCents: integer("artist_share_cents"),
  platformFeeCents: integer("platform_fee_cents"),
  processingCents: integer("processing_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  processorAccountId: text("processor_account_id"),
  processorSessionId: text("processor_session_id"),
  paymentIntentId: text("payment_intent_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: text("paid_at"),
  saleWithdrawnAt: integer("sale_withdrawn_at"),
  checkoutRequestJson: text("checkout_request_json"),
  cleanupState: text("cleanup_state"),
  cleanupAttempts: integer("cleanup_attempts").notNull().default(0),
  cleanupError: text("cleanup_error"),
  paymentReviewReason: text("payment_review_reason"),
}, (table) => [
  uniqueIndex("idx_purchases_processor_session").on(table.processorSessionId),
  index("idx_purchases_payment_intent").on(table.paymentIntentId),
  index("idx_purchases_withdrawal_cleanup").on(table.trackId, table.cleanupState),
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

export const playbackPermissions = sqliteTable("playback_permissions", {
  trackId: integer("track_id").primaryKey().references(() => tracks.id),
  recordingBasis: text("recording_basis").notNull(),
  recordingEvidence: text("recording_evidence").notNull(),
  compositionEvidence: text("composition_evidence").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
  artistAuthorized: integer("artist_authorized").notNull().default(0),
  freeAllowed: integer("free_allowed").notNull().default(0),
  plusAllowed: integer("plus_allowed").notNull().default(0),
  startsAt: integer("starts_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  withdrawnAt: integer("withdrawn_at"),
  territory: text("territory").notNull(),
});
export const playbackDecisions = sqliteTable("playback_decisions", {
  id: text("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  mode: text("mode").notNull(),
  allowed: integer("allowed").notNull(),
  reason: text("reason").notNull(),
  decidedAt: integer("decided_at").notNull(),
  permissionSnapshot: text("permission_snapshot").notNull(),
}, table => [index("idx_playback_decisions_track_time").on(table.trackId, table.decidedAt)]);

export const artistProfiles = sqliteTable('artist_profiles', {
  accountId:text('account_id').primaryKey(), artistName:text('artist_name').notNull(),
  verifiedAccountAt:integer('verified_account_at').notNull(), updatedAt:integer('updated_at').notNull(),
});
export const trackAuthority = sqliteTable('track_authority', {
  trackId:integer('track_id').notNull().references(()=>tracks.id), accountId:text('account_id').notNull(),
  grantedBy:text('granted_by').notNull(), grantedAt:integer('granted_at').notNull(), revokedAt:integer('revoked_at'),
},table=>[uniqueIndex('idx_track_authority').on(table.trackId,table.accountId)]);
export const artistTrackAudit = sqliteTable('artist_track_audit', {
  id:text('id').primaryKey(), trackId:integer('track_id').notNull(), accountId:text('account_id').notNull(),
  action:text('action').notNull(), detail:text('detail').notNull(), createdAt:integer('created_at').notNull(),
});
