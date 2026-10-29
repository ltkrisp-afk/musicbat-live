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
  buyerAccountId: text("buyer_account_id"),
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
  index("idx_purchases_buyer_account").on(table.buyerAccountId, table.createdAt),
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

export const checkoutRecoveryJobs = sqliteTable("checkout_recovery_jobs", {
  purchaseId: text("purchase_id").primaryKey().references(() => purchases.id),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
  lastError: text("last_error"),
  scanCursor: text("scan_cursor"),
  observedSessionStatus: text("observed_session_status"),
  observedPaymentStatus: text("observed_payment_status"),
}, (table) => [index("idx_checkout_recovery_due").on(table.state, table.nextAttemptAt, table.leaseUntil)]);

export const checkoutPaymentEvidence = sqliteTable("checkout_payment_evidence", {
  eventId: text("event_id").primaryKey(),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id),
  sessionId: text("session_id").notNull(),
  stripeCreated: integer("stripe_created"),
  paidSnapshot: integer("paid_snapshot").notNull().default(0),
}, (table) => [index("idx_checkout_evidence_purchase").on(table.purchaseId, table.sessionId, table.stripeCreated)]);

export const purchaseOwnershipAudit = sqliteTable("purchase_ownership_audit", {
  purchaseId: text("purchase_id").primaryKey().references(() => purchases.id),
  accountId: text("account_id").notNull(),
  evidenceType: text("evidence_type").notNull(),
  processorSessionId: text("processor_session_id").notNull(),
  claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Immutable text/version and append-only acceptance enforcement live in migration 0016.
export const directLicenseVersions = sqliteTable("direct_license_versions", {
  version: text("version").primaryKey().notNull(),
  body: text("body").notNull(),
  acceptanceText: text("acceptance_text").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: integer("approved_at").notNull(),
});
export const directLicenseCurrent = sqliteTable("direct_license_current", {
  id: integer("id").primaryKey(),
  version: text("version").notNull().references(() => directLicenseVersions.version),
});
export const artistLicenseAcceptances = sqliteTable("artist_license_acceptances", {
  id: text("id").primaryKey().notNull(),
  trackId: integer("track_id").notNull().references(() => tracks.id),
  accountId: text("account_id").notNull(),
  agreementVersion: text("agreement_version").notNull().references(() => directLicenseVersions.version),
  accepted: integer("accepted").notNull(),
  acceptedAt: integer("accepted_at").notNull(),
}, table => [index("idx_artist_license_acceptances_account").on(table.accountId, table.acceptedAt)]);

export const artistRightsDeclarations = sqliteTable("artist_rights_declarations", {
  acceptanceId: text("acceptance_id").primaryKey().notNull().references(() => artistLicenseAcceptances.id),
  trackId: integer("track_id").notNull().unique().references(() => tracks.id),
  declarationVersion: text("declaration_version").notNull(),
  declarationJson: text("declaration_json").notNull(),
  reviewRequired: integer("review_required").notNull(),
});
export const artistRightsReviews = sqliteTable("artist_rights_reviews", {
  id: integer("id").primaryKey({autoIncrement:true}),
  acceptanceId: text("acceptance_id").notNull().references(() => artistRightsDeclarations.acceptanceId),
  decision: text("decision").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
});

// Final licensing tables; migration 0018 also defines append-only triggers,
// independent eligibility views and validation constraints. Preserve that SQL.
export const agreementIntegrity = sqliteTable("agreement_integrity", {
  version: text("version").primaryKey(),
  sha256: text("sha256").notNull(),
  releaseApproved: integer("release_approved").notNull(),
  approvalReference: text("approval_reference").notNull(),
});
export const agreementReviewReceipts = sqliteTable("agreement_review_receipts", {id:text("id").primaryKey(),accountId:text("account_id").notNull(),agreementVersion:text("agreement_version").notNull(),sha256:text("sha256").notNull(),reviewedAt:integer("reviewed_at").notNull()});
export const artistAcceptanceEvidence = sqliteTable("artist_acceptance_evidence", {
  reviewReceiptId: text("review_receipt_id").notNull(),
  acceptanceId: text("acceptance_id").primaryKey(),
  sha256: text("sha256").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
  electronicConsent: integer("electronic_consent").notNull(),
  retainableCopyConfirmed: integer("retainable_copy_confirmed").notNull(),
  legalName: text("legal_name").notNull(),
  capacity: text("capacity").notNull(),
  schedulesJson: text("schedules_json").notNull(),
});
export const recordingIngestionEvents = sqliteTable("recording_ingestion_events", {
  id: integer("id").primaryKey({autoIncrement:true}),
  trackId: integer("track_id").notNull(),
  state: text("state").notNull(),
  uploadedAt: integer("uploaded_at").notNull(),
  verificationExpiresAt: integer("verification_expires_at").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
  reviewer: text("reviewer").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
});
export const recordingUseReviews = sqliteTable("recording_use_reviews", {
  id: integer("id").primaryKey({autoIncrement:true}),
  trackId: integer("track_id").notNull(),
  use: text("use").notNull(),
  decision: text("decision").notNull(),
  masterVerified: integer("master_verified").notNull(),
  compositionVerified: integer("composition_verified").notNull(),
  authorityReference: text("authority_reference").notNull(),
  compensationReference: text("compensation_reference").notNull(),
  recipientReference: text("recipient_reference").notNull(),
  territory: text("territory").notNull(),
  startsAt: integer("starts_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  licenseRequired: integer("license_required").notNull(),
  platformCostCents: integer("platform_cost_cents"),
  payer: text("payer"),
  fundingSource: text("funding_source"),
  ceilingBps: integer("ceiling_bps"),
  ceilingReference: text("ceiling_reference"),
  counselRequired: integer("counsel_required").notNull(),
  counselReference: text("counsel_reference"),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
});
export const platformLicenseExpenses = sqliteTable("platform_license_expenses", {
  id: text("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  useReviewId: integer("use_review_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  payer: text("payer").notNull(),
  payeeReference: text("payee_reference").notNull(),
  fundingSource: text("funding_source").notNull(),
  processorReference: text("processor_reference").notNull(),
  recordedAt: integer("recorded_at").notNull(),
});
export const membershipRevenueEvents = sqliteTable("membership_revenue_events", {
  sourceId: text("source_id").primaryKey(),
  sourceReference: text("source_reference").notNull(),
  month: text("month").notNull(),
  kind: text("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  principalReference: text("principal_reference"),
  livemode: integer("livemode").notNull(),
  settled: integer("settled").notNull(),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: integer("verified_at").notNull(),
});
export const streamingEligiblePlays = sqliteTable("streaming_eligible_plays", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),
  trackId: integer("track_id").notNull(),
  listenerId: text("listener_id").notNull(),
  performanceId: text("performance_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  deliveredMs: integer("delivered_ms").notNull(),
  memberVerified: integer("member_verified").notNull(),
  rightsReviewId: integer("rights_review_id").notNull(),
  beneficiaryReference: text("beneficiary_reference").notNull(),
  deliveryReference: text("delivery_reference").notNull(),
  verifiedBy: text("verified_by").notNull(),
});
export const membershipPoolStatements = sqliteTable("membership_pool_statements", {
  month: text("month").primaryKey(),
  sourceDigest: text("source_digest").notNull(),
  statementJson: text("statement_json").notNull(),
  closedBy: text("closed_by").notNull(),
  closedAt: integer("closed_at").notNull(),
  previousMonth: text("previous_month"),
});
export const legalRecordHolds = sqliteTable("legal_record_holds", {
  id: text("id").primaryKey(),
  trackId: integer("track_id"),
  category: text("category").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
  releasedByEvent: text("released_by_event"),
});
export const recordingDeliveryRestrictions = sqliteTable("recording_delivery_restrictions", {
  id: integer("id").primaryKey({autoIncrement:true}),
  trackId: integer("track_id").notNull(),
  restricted: integer("restricted").notNull(),
  reason: text("reason").notNull(),
  authorityReference: text("authority_reference").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
});
export const streamingBeneficiaryInstructions = sqliteTable("streaming_beneficiary_instructions", {
  id: text("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  designatedRecipient: text("designated_recipient").notNull(),
  collectionAuthorityReference: text("collection_authority_reference").notNull(),
  payoutVerifiedReference: text("payout_verified_reference").notNull(),
  signedModelReference: text("signed_model_reference").notNull(),
  beneficiariesJson: text("beneficiaries_json").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
});

// Additive membership integration tables; SQL 0019 owns validation/triggers.
export const radioPlusEnrollmentModes = sqliteTable("radio_plus_enrollment_modes", {
  enrollmentId: text("enrollment_id").primaryKey(),
  mode: text("mode").notNull(),
});
export const membershipSettlementSources = sqliteTable("membership_settlement_sources", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  mode: text("mode").notNull(),
  providerAccount: text("provider_account").notNull(),
  providerBalanceReference: text("provider_balance_reference").notNull(),
  settledAt: integer("settled_at").notNull(),
  grossCents: integer("gross_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  currency: text("currency").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  verifiedAt: integer("verified_at").notNull(),
});
export const membershipTestRevenueEvents = sqliteTable("membership_test_revenue_events", {
  sourceId: text("source_id").primaryKey(),
  sourceReference: text("source_reference").notNull(),
  month: text("month").notNull(),
  kind: text("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  principalReference: text("principal_reference"),
  livemode: integer("livemode").notNull(),
  settled: integer("settled").notNull(),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: integer("verified_at").notNull(),
});
export const streamingDeliveryEvidence = sqliteTable("streaming_delivery_evidence", {
  id: text("id").primaryKey(),
  listenerId: text("listener_id").notNull(),
  trackId: integer("track_id").notNull(),
  performanceId: text("performance_id").notNull(),
  mode: text("mode").notNull(),
  deliveredMs: integer("delivered_ms").notNull(),
  deliveredAt: integer("delivered_at").notNull(),
  sourceReference: text("source_reference").notNull(),
});
export const streamingListeningSessions = sqliteTable("streaming_listening_sessions", {
  id: text("id").primaryKey(),
  listenerId: text("listener_id").notNull(),
  trackId: integer("track_id").notNull(),
  performanceId: text("performance_id").notNull(),
  mode: text("mode").notNull(),
  startedAt: integer("started_at").notNull(),
  lastAt: integer("last_at").notNull(),
  observedMs: integer("observed_ms").notNull(),
  durationMs: integer("duration_ms").notNull(),
  rightsReviewId: integer("rights_review_id").notNull(),
  beneficiaryReference: text("beneficiary_reference").notNull(),
});
export const streamingTestEligiblePlays = sqliteTable("streaming_test_eligible_plays", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),
  trackId: integer("track_id").notNull(),
  listenerId: text("listener_id").notNull(),
  performanceId: text("performance_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  deliveredMs: integer("delivered_ms").notNull(),
  memberVerified: integer("member_verified").notNull(),
  rightsReviewId: integer("rights_review_id").notNull(),
  beneficiaryReference: text("beneficiary_reference").notNull(),
  deliveryReference: text("delivery_reference").notNull(),
  verifiedBy: text("verified_by").notNull(),
});
export const membershipTestPoolStatements = sqliteTable("membership_test_pool_statements", {
  month: text("month").primaryKey(),
  sourceDigest: text("source_digest").notNull(),
  statementJson: text("statement_json").notNull(),
  closedBy: text("closed_by").notNull(),
  closedAt: integer("closed_at").notNull(),
  previousMonth: text("previous_month"),
});
export const membershipReconciliationJobs = sqliteTable("membership_reconciliation_jobs", {
  invoiceId: text("invoice_id").primaryKey(),
  mode: text("mode").notNull(),
  state: text("state").notNull(),
  attempts: integer("attempts").notNull(),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until"),
  nextAttempt: integer("next_attempt").notNull(),
  lastError: text("last_error"),
});
