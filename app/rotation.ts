// Session-local smooth weighted rotation. Every eligible track has a positive
// baseline; priority and existing Hanger signals increase frequency, not eligibility.
export type RotationTrack = {
  id: number;
  rotation_eligible: boolean;
  keep_in_rotation: number;
  keep_count: number;
  signal_count: number;
};
export function selectNextTrack<T extends RotationTrack>(
  tracks: T[], currentId: number | undefined, credits: Map<number, number>, failed: Set<number>,
): T | null {
  const eligible = tracks.filter((track) => track.rotation_eligible && !failed.has(track.id));
  for (const id of credits.keys()) if (!eligible.some((track) => track.id === id)) credits.delete(id);
  if (!eligible.length) return null;
  let total = 0;
  for (const track of eligible) {
    const weight = 1 + Math.max(0, track.signal_count) + 2 * (Number(Boolean(track.keep_in_rotation)) + Math.max(0, track.keep_count));
    total += weight;
    credits.set(track.id, (credits.get(track.id) ?? 0) + weight);
  }
  const alternatives = eligible.filter((track) => track.id !== currentId);
  const candidates = alternatives.length ? alternatives : eligible;
  const next = candidates.reduce((best, track) => (credits.get(track.id) ?? 0) > (credits.get(best.id) ?? 0) ? track : best);
  credits.set(next.id, (credits.get(next.id) ?? 0) - total);
  return next;
}
