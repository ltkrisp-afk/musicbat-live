/** Do not replace an outstanding range seek while it is still buffering. */
export function correctRadioMediaOffset(media: Pick<HTMLAudioElement, 'readyState' | 'seeking' | 'currentTime'>, offset: number) {
  if (media.readyState >= 1 && !media.seeking && Math.abs(media.currentTime - offset) > 0.1) media.currentTime = offset;
}

/** A pending play promise cannot override a newer user pause at a boundary. */
export function acceptRadioPlayEvent(media: Pick<HTMLAudioElement, 'pause'>, wanted: boolean) {
  if (!wanted) { media.pause(); return false; }
  return true;
}
