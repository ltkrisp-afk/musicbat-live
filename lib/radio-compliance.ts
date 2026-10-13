import { authorizePlayback, type Permission, type PlaybackMode } from './playback-authorization';

/** Offline policy evaluator, NOT a transmitter or a statutory activation mechanism. */
export const STATUTORY_LIVE_ENABLED = false;
export const PERFORMANCE_WINDOW_MS = 3 * 60 * 60 * 1000;
export const COMPLIANCE_POLICY_VERSION = 'phase3-offline-v1';
export type Evidence = { reference: string; verifiedBy: string; verifiedAt: number; expiresAt: number };
export type StatutoryGate = {
  serviceEligibility: Evidence; noticeAndTiming: Evidence; royaltiesAndReporting: Evidence;
  compositionCoverage: Evidence; applicableRequirements: Evidence;
};
export type ComplianceTrack = {
  id: string; artistIds: string[]; albumId: string; compilationIds: string[];
  metadataReviewed: boolean; eligible: boolean; statutoryEligibility: Evidence | null;
  permission: Permission | null;
  /** Reviewed direct contract limits, independent of statutory restrictions. */
  directRestrictions?: { maxPlays: number; windowMs: number; minRepeatGapMs: number } | null;
};
export type PlaybackEvent = {
  channelId: string; track: ComplianceTrack; startedAt: number; endedAt: number;
};
export type ComplianceContext = {
  execution: 'simulation' | 'live'; mode: PlaybackMode; territory: string;
  channelId: string; now: number; durationMs: number;
  gate: StatutoryGate | null;
  /** A complete ordered channel ledger from channel creation; never listener-local. */
  channelCreatedAt: number; historyComplete: boolean; history: PlaybackEvent[];
  noninteractive: boolean; requirementsEnforced: boolean;
};
export type ComplianceDecision = {
  allowed: boolean; reason: string; policyVersion: string; trackId: string;
  channelId: string; decidedAt: number; pathway: string; simulation: boolean;
};
function evidenceValid(e: Evidence | null | undefined, now: number, end: number) {
  return !!e && !!e.reference?.trim() && !!e.verifiedBy?.trim() &&
    Number.isFinite(e.verifiedAt) && e.verifiedAt <= now && e.verifiedAt >= 0 &&
    Number.isFinite(e.expiresAt) && e.expiresAt > end;
}
function metadataValid(t: ComplianceTrack) {
  return !!t.id?.trim() && t.metadataReviewed === true && !!t.albumId?.trim() &&
    Array.isArray(t.artistIds) && t.artistIds.length > 0 && t.artistIds.every(id => !!id?.trim()) &&
    Array.isArray(t.compilationIds) && t.compilationIds.every(id => !!id?.trim());
}
export function evaluateRadioPlayback(track: ComplianceTrack, c: ComplianceContext): ComplianceDecision {
  const result = (allowed: boolean, reason: string): ComplianceDecision => ({
    allowed, reason, policyVersion: COMPLIANCE_POLICY_VERSION, trackId: track.id,
    channelId: c.channelId, decidedAt: c.now, pathway: track.permission?.recording_basis ?? 'missing',
    simulation: c.execution === 'simulation',
  });
  const deny = (reason: string) => result(false, reason);
  if (!['live', 'simulation'].includes(c.execution) || !['free-radio', 'radio-plus'].includes(c.mode) ||
      !Number.isFinite(c.now) || c.now < 0 || !Number.isFinite(c.durationMs) || c.durationMs <= 0 ||
      !Number.isFinite(c.now + c.durationMs) || !c.channelId?.trim()) return deny('invalid-playback-context');
  if (track.eligible !== true) return deny('track-ineligible');
  const p = track.permission;
  // Reuse independent recording/composition, review, time, territory and mode checks.
  // The statutory branch substitutes ONLY the basis for this shared validation.
  const rights = authorizePlayback(p?.recording_basis === 'statutory' ? { ...p, recording_basis: 'direct' } : p, c.mode, c.now, c.territory);
  if (!rights.allowed) return deny(rights.reason);
  const end = c.now + c.durationMs;
  if (p!.expires_at <= end) return deny('permission-expires-during-playback');
  if (p!.recording_basis === 'direct') {
    const limits = track.directRestrictions;
    if (limits) {
      if (!Number.isSafeInteger(limits.maxPlays) || limits.maxPlays < 1 ||
          !Number.isSafeInteger(limits.windowMs) || limits.windowMs < 1 ||
          !Number.isSafeInteger(limits.minRepeatGapMs) || limits.minRepeatGapMs < 0 ||
          c.historyComplete !== true || !Array.isArray(c.history)) return deny('direct-contract-limits-invalid');
      const history = c.history.filter(e => e.channelId === c.channelId && e.track.id === track.id);
      if (history.some(e => !Number.isSafeInteger(e.startedAt) || !Number.isSafeInteger(e.endedAt) ||
          e.endedAt <= e.startedAt || e.endedAt > c.now)) return deny('direct-contract-history-invalid');
      if (history.filter(e => e.endedAt > c.now - limits.windowMs).length >= limits.maxPlays)
        return deny('direct-contract-rolling-limit');
      if (history.some(e => c.now - e.endedAt < limits.minRepeatGapMs)) return deny('direct-contract-repeat-gap');
    }
    return result(true, 'reviewed-direct-permissions');
  }
  if (c.execution !== 'simulation') return deny('statutory-live-disabled');
  if (c.noninteractive !== true) return deny('statutory-interactivity-forbidden');
  if (c.territory !== 'US') return deny('statutory-territory-not-covered');
  if (!c.gate) return deny('statutory-prerequisites-missing');
  for (const key of ['serviceEligibility', 'noticeAndTiming', 'royaltiesAndReporting', 'compositionCoverage', 'applicableRequirements'] as const)
    if (!evidenceValid(c.gate[key], c.now, end)) return deny(`statutory-gate-${key}-unverified`);
  if (c.requirementsEnforced !== true) return deny('statutory-service-requirements-not-enforced');
  if (!evidenceValid(track.statutoryEligibility, c.now, end)) return deny('statutory-track-eligibility-unverified');
  if (!metadataValid(track)) return deny('performance-metadata-incomplete');
  if (c.historyComplete !== true || !Number.isFinite(c.channelCreatedAt) || c.channelCreatedAt < 0 ||
      c.channelCreatedAt > c.now || !Array.isArray(c.history)) return deny('channel-history-incomplete');
  const history = c.history.filter(e => e.channelId === c.channelId);
  for (let i = 0; i < history.length; i++) {
    const e = history[i];
    if (!metadataValid(e.track) || !Number.isFinite(e.startedAt) || !Number.isFinite(e.endedAt) ||
        e.startedAt < c.channelCreatedAt || e.endedAt <= e.startedAt || e.endedAt > c.now ||
        (i > 0 && e.startedAt < history[i - 1].endedAt)) return deny('channel-history-invalid');
  }
  // Count every performance conservatively (including repeats and direct plays on this channel).
  // Include recordings whose transmission overlaps the trailing window, not just start times.
  const window = history.filter(e => e.endedAt > c.now - PERFORMANCE_WINDOW_MS);
  const rules: { key: string; matches: (t: ComplianceTrack) => boolean; total: number; consecutive: number }[] = [
    { key: 'album', matches: t => t.albumId === track.albumId, total: 3, consecutive: 2 },
    ...track.artistIds.map(id => ({ key: 'artist', matches: (t: ComplianceTrack) => t.artistIds.includes(id), total: 4, consecutive: 3 })),
    ...track.compilationIds.map(id => ({ key: 'compilation', matches: (t: ComplianceTrack) => t.compilationIds.includes(id), total: 4, consecutive: 3 })),
  ];
  for (const rule of rules) {
    if (window.filter(e => rule.matches(e.track)).length >= rule.total) return deny(`${rule.key}-rolling-limit`);
    let consecutive = 0;
    for (let i = history.length - 1; i >= 0 && rule.matches(history[i].track); i--) consecutive++;
    if (consecutive >= rule.consecutive) return deny(`${rule.key}-consecutive-limit`);
  }
  return result(true, 'statutory-simulation-compliant');
}

/** Deterministic offline scheduling. No fallback may bypass a rejection; no media is read. */
export function simulateRadioSchedule(catalog: ComplianceTrack[], context: ComplianceContext) {
  const decisions = catalog.map(track => evaluateRadioPlayback(track, context));
  const index = decisions.findIndex(decision => decision.allowed);
  return { track: index < 0 ? null : catalog[index], decisions,
    reason: index < 0 ? 'no-authorized-compliant-track' : 'authorized-track-selected' };
}
