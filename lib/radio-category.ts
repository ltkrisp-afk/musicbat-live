import { simulateRadioSchedule, type ComplianceTrack, type ComplianceContext } from './radio-compliance';

export type Category = { genre: string; subgenre?: string; style?: string };
export type CategoryTrack = ComplianceTrack & { category: Category; creationClassification?: 'Human'|'Human + AI'|'AI'|null };
export type Channel = { id: string; category: Category; eligibilityReview: { reference: string; verifiedAt: number; expiresAt: number } | null };
/** AI is a creation filter, independent of the recording's musical genre. Unknown is excluded. */
export function matchesRadioCategory(track: CategoryTrack, category: Category | null): boolean {
  if (!category) return true;
  if (category.genre === 'AI') return !category.subgenre && !category.style && ['Human + AI','AI'].includes(track.creationClassification ?? '');
  return track.category.genre === category.genre && (!category.subgenre || track.category.subgenre === category.subgenre) && (!category.style || track.category.style === category.style);
}
/** Dial commands contain categories only. Reject track IDs, seek, replay, votes and unknown fields. */
export function parseCategoryCommand(value: unknown): Category | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['genre', 'subgenre', 'style'].includes(k))) return null;
  if (typeof v.genre !== 'string' || !v.genre.trim() || v.genre.length > 100) return null;
  for (const k of ['subgenre', 'style']) if (v[k] !== undefined &&
    (typeof v[k] !== 'string' || !(v[k] as string).trim() || (v[k] as string).length > 100)) return null;
  if (v.style !== undefined && v.subgenre === undefined) return null;
  return { genre: v.genre, ...(v.subgenre === undefined ? {} : {subgenre: v.subgenre as string}),
    ...(v.style === undefined ? {} : {style: v.style as string}) };
}
/** Offline only: resolve a pre-existing shared channel, never create a listener-specific track queue. */
export function simulateCategoryRadio(command: unknown, channels: Channel[], catalog: CategoryTrack[], context: ComplianceContext) {
  const category = parseCategoryCommand(command);
  const deny = (reason: string) => ({track: null, decisions: [], reason});
  if (context.execution !== 'simulation') return deny('offline-only');
  if (!category) return deny('invalid-category-command');
  const matches = channels.filter(c => c.category.genre === category.genre && c.category.subgenre === category.subgenre && c.category.style === category.style);
  if (matches.length !== 1 || matches[0].id !== context.channelId) return deny('shared-channel-not-established');
  const channel = matches[0];
  const review = channel.eligibilityReview;
  if (!review?.reference.trim() || !Number.isFinite(review.verifiedAt) || review.verifiedAt < 0 || review.verifiedAt > context.now ||
      !Number.isFinite(review.expiresAt) || review.expiresAt <= context.now + context.durationMs) return deny('category-channel-review-missing');
  const pool = catalog.filter(t => matchesRadioCategory(t,category));
  return simulateRadioSchedule(pool, context);
}
