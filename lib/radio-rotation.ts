type RadioTrack = { id: number; rotation_priority: number };

// Every eligible song gets turns. A Keep Hanger gives bounded extra priority.
export function nextRadioTrack(tracks: RadioTrack[], currentId: number, plays: Map<number, number>) {
  const candidates = tracks.length > 1 ? tracks.filter((track) => track.id !== currentId) : tracks;
  return candidates.reduce<RadioTrack | null>((best, track) => {
    const due = (item: RadioTrack) => ((plays.get(item.id) ?? 0) + 1) / (item.rotation_priority > 0 ? 2 : 1);
    return !best || due(track) < due(best) ? track : best;
  }, null)?.id ?? null;
}
