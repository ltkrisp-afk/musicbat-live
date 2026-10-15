"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

function time(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function MusicBatPlayer({ src, title, replay, autoPlay, onPlay, onProgress, onEnded, onError, onUnavailable }: {
  src: string; title: string; replay: number; autoPlay: boolean;
  onPlay: () => void; onProgress: (seconds: number) => void;
  onEnded: () => void; onError: (message: string) => void;
  onUnavailable: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    setPosition(0);
    setDuration(0);
    setPlaying(false);
    if (audio) {
      audio.disableRemotePlayback = true;
      audio.load();
      if (autoPlayRef.current) void audio.play().catch((error: DOMException) => {
        if (error.name !== "AbortError") errorRef.current("Press Play to resume Radio. Your browser paused automatic playback.");
      });
    }
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
      advanceRef.current = null;
    };
  }, [src, replay]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (advanceRef.current) { clearTimeout(advanceRef.current); advanceRef.current = null; }
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); } catch { onError("This track could not play. Press Play to try again."); }
  }

  return <div className="flex min-w-0 flex-1 basis-[240px] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-2 py-1">
    <audio ref={audioRef} preload="metadata" src={src} controlsList="nodownload noremoteplayback" aria-label={title}
      onPlay={() => { setPlaying(true); onPlay(); }} onPause={() => setPlaying(false)}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => { setPosition(event.currentTarget.currentTime); onProgress(event.currentTarget.currentTime); }}
      onEnded={(event) => {
        setPlaying(false);
        onProgress(event.currentTarget.currentTime);
        if (advanceRef.current) clearTimeout(advanceRef.current);
        advanceRef.current = setTimeout(() => { advanceRef.current = null; onEnded(); }, 500);
      }}
      onError={onUnavailable} />
    <Button type="button" variant="ghost" size="icon" onClick={() => void togglePlay()} aria-label={playing ? "Pause Radio" : "Play Radio"} className="rounded-full text-white hover:bg-white/10 hover:text-white">{playing ? <Pause /> : <Play />}</Button>
    <span className="text-xs tabular-nums text-white/70">{time(position)} / {time(duration)}</span>
    <input type="range" aria-label="Playback position" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.1" value={Math.min(position, Number.isFinite(duration) ? duration : 0)} disabled={!duration || !Number.isFinite(duration)}
      onChange={(event) => { const audio = audioRef.current; if (audio) { audio.currentTime = Number(event.target.value); setPosition(audio.currentTime); } }} className="h-8 min-w-16 flex-1 cursor-pointer accent-[#ff3ea5]" />
    <Button type="button" variant="ghost" size="icon" aria-label={muted ? "Unmute Radio" : "Mute Radio"} onClick={() => { const audio = audioRef.current; if (audio) { audio.muted = !muted; setMuted(audio.muted); } }} className="rounded-full text-white hover:bg-white/10 hover:text-white">{muted ? <VolumeX /> : <Volume2 />}</Button>
    <input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.volume = value; setVolume(value); }} className="h-8 w-14 cursor-pointer accent-[#ff3ea5]" />
  </div>;
}
