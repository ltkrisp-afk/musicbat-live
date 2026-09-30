// Session-local smooth fair rotation. Only catalog eligibility determines the pool;
// listener responses are reported separately as category-position signals.
export type RotationTrack = {
  id: number;
  rotation_eligible: boolean;
};
export function selectNextTrack<T extends RotationTrack>(
  tracks: T[], currentId: number | undefined, credits: Map<number, number>, failed: Set<number>,
): T | null {
  const eligible = tracks.filter((track) => track.rotation_eligible && !failed.has(track.id));
  for (const id of credits.keys()) if (!eligible.some((track) => track.id === id)) credits.delete(id);
  if (!eligible.length) return null;
  let total = 0;
  for (const track of eligible) {
    const weight = 1;
    total += weight;
    credits.set(track.id, (credits.get(track.id) ?? 0) + weight);
  }
  const alternatives = eligible.filter((track) => track.id !== currentId);
  const candidates = alternatives.length ? alternatives : eligible;
  const next = candidates.reduce((best, track) => (credits.get(track.id) ?? 0) > (credits.get(best.id) ?? 0) ? track : best);
  credits.set(next.id, (credits.get(next.id) ?? 0) - total);
  return next;
}
