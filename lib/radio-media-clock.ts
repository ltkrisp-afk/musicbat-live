/** Do not replace an outstanding range seek while it is still buffering. */
export function correctRadioMediaOffset(media: Pick<HTMLAudioElement, 'readyState' | 'seeking' | 'currentTime'>, offset: number) {
  if (media.readyState >= 1 && !media.seeking && Math.abs(media.currentTime - offset) > 0.1) media.currentTime = offset;
}
