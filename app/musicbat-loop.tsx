"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Disc3, Gauge, Radio, ShieldCheck, SkipForward, Sparkles, Upload } from "lucide-react";
import { selectNextTrack } from "./rotation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Track = {
  id: number;
  title: string;
  artist_name: string;
  audio_url: string;
  created_at: string;
  signal_count: number;
  keep_in_rotation: number;
  keep_count: number;
  viewer_keep_in_rotation: number;
  can_manage: number;
  viewer_qualified: number;
  rotation_eligible: boolean;
};

type WeightRow = {
  track_id: number;
  title: string;
  artist_name: string;
  signal_count: number;
  citizen_count: number;
};

type ToolContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "MusicBat request failed.");
  return data;
}

const hangerLabels = {
  keep_in_rotation: "Keep in rotation",
  standout: "Standout",
  want_more: "Want more",
} as const;

export default function MusicBatLoop({ displayName }: { displayName: string }) {
  const [tab, setTab] = useState("radio");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [weightRows, setWeightRows] = useState<WeightRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [listenId, setListenId] = useState<string | null>(null);
  const [qualified, setQualified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const purchaseStartingRef = useRef(false);
  const [message, setMessage] = useState("Loading rights-cleared Radio…");
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rightsAttested, setRightsAttested] = useState(false);
  const startingRef = useRef(false);
  const qualifyingRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const creditsRef = useRef(new Map<number, number>());
  const failedRef = useRef(new Set<number>());
  const continuingRef = useRef(false);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const current = tracks[currentIndex] ?? null;
  const currentIdRef = useRef(current?.id);
  currentIdRef.current = current?.id;
  const keepActive = Boolean(current?.can_manage ? current.keep_in_rotation : current?.viewer_keep_in_rotation);

  const refresh = useCallback(async () => {
    const [trackData, weightData] = await Promise.all([
      api<{ tracks: Track[] }>("/api/musicbat?view=tracks"),
      api<{ rows: WeightRow[] }>("/api/musicbat?view=weight-room"),
    ]);
    const nextTracks = trackData.tracks.map((track) => ({ ...track, id: Number(track.id), signal_count: Number(track.signal_count) }));
    const selectedIndex = nextTracks.findIndex((track) => track.id === currentIdRef.current);
    setTracks(nextTracks);
    setCurrentIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setWeightRows(weightData.rows.map((row) => ({
      ...row,
      track_id: Number(row.track_id),
      signal_count: Number(row.signal_count),
      citizen_count: Number(row.citizen_count),
    })));
  }, []);

  useEffect(() => {
    refresh()
      .then(() => setMessage("Choose a track and press play."))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Radio unavailable."))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    setListenId(null);
    setPurchaseMessage("");
    setQualified(false);
    startingRef.current = false;
    qualifyingRef.current = false;
  }, [current?.id, playbackCycle]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "list_musicbat_tracks",
        title: "List MusicBat tracks",
        description: "List rights-cleared tracks currently available in MusicBat Radio.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => api<{ tracks: Track[] }>("/api/musicbat?view=tracks"),
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "get_musicbat_weight_room",
        title: "Read the Weight Room",
        description: "Read the current MusicBat ranking created by qualified listener Hangers.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => api<{ rows: WeightRow[] }>("/api/musicbat?view=weight-room"),
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  useEffect(() => {
    if (!continuingRef.current || !audioRef.current) return;
    void audioRef.current.play().catch(() => {
      continuingRef.current = false;
      setMessage("Next track is ready. Press play to continue.");
    });
  }, [current?.id, playbackCycle, tab]);

  async function toggleKeep(track: Track) {
    setBusy(true);
    const active = Boolean(track.can_manage ? track.keep_in_rotation : track.viewer_keep_in_rotation);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({
        action: track.can_manage ? "set_rotation_priority" : "toggle_rotation_hanger",
        trackId: track.id, enabled: !active,
      }) });
      await refresh();
      setMessage(active ? "Rotation priority off. This track remains in normal Radio rotation." : "Keep in rotation is on. Rotation priority saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rotation setting could not be saved.");
    } finally { setBusy(false); }
  }

  async function startListen() {
    if (!current || listenId || startingRef.current) return;
    startingRef.current = true;
    const startedTrackId = current.id;
    try {
      const result = await api<{ listenId: string; minimumSeconds: number }>("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "start_listen", trackId: current.id }),
      });
      if (currentIdRef.current !== startedTrackId) return;
      setListenId(result.listenId);
      setMessage(`Listen for ${result.minimumSeconds} seconds to unlock your Hanger.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the listen.");
    } finally {
      startingRef.current = false;
    }
  }

  async function qualifyListen(currentTime: number) {
    if (!current || !listenId || qualified || qualifyingRef.current || currentTime < 12) return;
    qualifyingRef.current = true;
    const qualifyingTrackId = current.id;
    try {
      await api("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "qualify_listen", trackId: current.id, listenId }),
      });
      if (currentIdRef.current !== qualifyingTrackId) return;
      setQualified(true);
      setMessage("Qualified listen. Choose the response that carries weight.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Keep listening.");
    } finally {
      qualifyingRef.current = false;
    }
  }

  async function placeHanger(kind: keyof typeof hangerLabels) {
    if (!current || !qualified) return;
    setBusy(true);
    try {
      await api("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "hanger", trackId: current.id, kind }),
      });
      await refresh();
      setMessage(`${hangerLabels[kind]} recorded. The Weight Room has been updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hanger could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function buyCurrentTrack() {
    if (!current || purchaseStartingRef.current) return;
    // Capture before awaiting: Radio can change without changing this purchase.
    const selected = { id: current.id, title: current.title };
    purchaseStartingRef.current = true;
    setPurchaseBusy(true);
    setPurchaseMessage(`Selecting “${selected.title}”…`);
    try {
      const result = await api<{ purchase: { id: string }; message: string; checkoutAvailable: false }>("/api/musicbat/purchase", {
        method: "POST", body: JSON.stringify({ trackId: selected.id }),
      });
      setPurchaseMessage(result.message);
    } catch (error) {
      setPurchaseMessage(error instanceof Error ? error.message : "Could not prepare this purchase. Try again.");
    } finally {
      purchaseStartingRef.current = false;
      setPurchaseBusy(false);
    }
  }

  async function addTrack(event: FormEvent) {
    event.preventDefault();
    if (!audioFile) { setUploadError("Choose your music file first."); return; }
    setBusy(true);
    setUploadError("");
    setSignInRequired(false);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("artistName", artistName);
      form.set("audio", audioFile);
      form.set("rightsAttested", String(rightsAttested));
      await api("/api/musicbat", { method: "POST", body: form });
      setTitle("");
      setArtistName("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRightsAttested(false);
      await refresh();
      setCurrentIndex(0);
      setTab("radio");
      setMessage("Track accepted. It is now live in MusicBat Radio.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Track could not be added.";
      setUploadError(detail);
      setSignInRequired(detail === "Sign in to use MusicBat.");
      setMessage(detail);
    } finally {
      setBusy(false);
    }
  }

  function nextTrack(continuePlaying = !audioRef.current?.paused) {
    const next = selectNextTrack(tracks, current?.id, creditsRef.current, failedRef.current);
    if (!next) {
      continuingRef.current = false;
      setMessage("No playable eligible tracks are available. Choose a track to retry.");
      return;
    }
    continuingRef.current = continuePlaying;
    setCurrentIndex(tracks.findIndex((track) => track.id === next.id));
    setPlaybackCycle((cycle) => cycle + 1);
    setMessage(continuePlaying ? "Radio continues with the next track." : "New track selected. Press play to begin a qualified listen.");
  }

  const loopStatus = useMemo(() => {
    if (!tracks.length) return "Catalog is waiting for its first track";
    if (qualified) return "Hanger unlocked";
    if (listenId) return "Listen in progress";
    return `${tracks.length} track${tracks.length === 1 ? "" : "s"} in Radio`;
  }, [listenId, qualified, tracks.length]);

  return (
    <main className="min-h-screen bg-[#08070b] text-[#f7f4ed]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-6 lg:px-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full border border-[#ff3ea5]/40 bg-[#ff3ea5]/10 text-[#ff69bd] shadow-[0_0_34px_rgba(255,62,165,.18)]">
              <Activity className="size-5" />
            </div>
            <div><div className="text-[0.72rem] font-black uppercase tracking-[0.24em] text-[#ff69bd]">MusicBat</div><div className="text-lg font-black tracking-tight">Minimum Working Loop</div></div>
          </div>
          <div className="text-right"><div className="text-sm font-semibold text-white/90">{displayName}</div><div className="text-xs text-white/45">{loopStatus}</div></div>
        </header>

        <div className="mb-5 grid grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-center text-[0.68rem] font-black uppercase tracking-[0.12em] text-white/45">
          {["Catalog", "Radio", "Response", "Weight Room"].map((step, index) => <div key={step} className="border-r border-white/10 px-2 py-3 last:border-0"><span className="mr-1 text-[#ff69bd]">0{index + 1}</span> {step}</div>)}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1.5 sm:w-fit">
            <TabsTrigger value="radio" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Radio /> Radio</TabsTrigger>
            <TabsTrigger value="catalog" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Disc3 /> Add Track</TabsTrigger>
            <TabsTrigger value="weight" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Gauge /> Weight Room</TabsTrigger>
          </TabsList>

          <TabsContent value="radio">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,.65fr)]">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 shadow-[0_28px_90px_rgba(0,0,0,.45)] sm:p-9">
                <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#ff3ea5]/10 blur-3xl" />
                <div className="relative">
                  <div className="mb-10 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]"><span className="size-2 rounded-full bg-[#ff3ea5] shadow-[0_0_14px_#ff3ea5]" /> Now in the cave</div><div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">{tracks.length ? `${currentIndex + 1} / ${tracks.length}` : "0 / 0"}</div></div>
                  {current ? <>
                    <div className="mb-8 min-h-36"><div className="mb-3 text-sm uppercase tracking-[0.16em] text-white/38">Independent signal</div><h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{current.title}</h1><p className="mt-4 text-lg font-semibold text-white/58">{current.artist_name}</p></div>
                    <div className="flex flex-wrap items-center gap-3">
                      <audio ref={audioRef} key={`${current.id}:${playbackCycle}`} className="musicbat-audio min-w-0 flex-1 basis-[240px]" controls controlsList="nodownload noplaybackrate noremoteplayback" preload="metadata" src={current.audio_url} onPlay={() => { continuingRef.current = true; void startListen(); }} onPause={() => { continuingRef.current = false; }} onTimeUpdate={(event) => void qualifyListen(event.currentTarget.currentTime)} onEnded={() => nextTrack(true)} onError={() => { failedRef.current.add(current.id); nextTrack(continuingRef.current); }} />
                      <Button type="button" disabled={purchaseBusy} aria-busy={purchaseBusy} onClick={() => void buyCurrentTrack()} aria-label={`Buy ${current.title}`} data-track-id={current.id} className="h-12 shrink-0 rounded-full border border-[#ff3ea5]/50 bg-[#ff3ea5]/20 px-6 text-base font-black text-white disabled:opacity-60">Buy</Button>
                    </div>
                    {purchaseMessage && <p role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-white/65">{purchaseMessage}</p>}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button type="button" aria-pressed={keepActive} disabled={busy || (!current.can_manage && !qualified && !current.viewer_qualified && !keepActive)} onClick={() => void toggleKeep(current)} className={keepActive ? "h-11 rounded-full bg-[#ff3ea5] px-5 text-white hover:bg-[#ff69bd]" : "h-11 rounded-full border border-white/15 bg-white/[0.045] px-5 text-white hover:bg-white/10"}>Keep in rotation</Button>
                      {(["standout", "want_more"] as const).map((kind) => <Button key={kind} disabled={!qualified || busy} onClick={() => void placeHanger(kind)} className="h-11 rounded-full border border-white/15 bg-white/[0.045] px-5 text-white hover:bg-white/10">{hangerLabels[kind]}</Button>)}
                      <Button variant="ghost" onClick={() => nextTrack()} className="h-11 rounded-full px-4 text-white/55 hover:bg-white/10 hover:text-white"><SkipForward /> Next</Button>
                    </div>
                  </> : <div className="grid min-h-[390px] place-items-center text-center"><div><Disc3 className="mx-auto mb-5 size-12 text-[#ff69bd]" /><h1 className="text-3xl font-black tracking-tight">Radio needs its first track.</h1><p className="mx-auto mt-3 max-w-md text-white/52">Upload your music file and confirm your rights to enter Radio.</p><Button onClick={() => setTab("catalog")} className="mt-6 rounded-full bg-[#ff3ea5] px-6 text-white hover:bg-[#ff69bd]">Add the first track</Button></div></div>}
                </div>
              </div>
              <aside className="flex flex-col gap-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6"><div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45"><Sparkles className="size-4 text-[#ff69bd]" /> Signal status</div><p className="text-lg font-semibold leading-snug">{loading ? "Loading the loop…" : message}</p><div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-[#ff3ea5] transition-all ${qualified ? "w-full" : listenId ? "w-2/3" : tracks.length ? "w-1/3" : "w-0"}`} /></div></div>
                <div className="rounded-[1.5rem] border border-white/10 bg-[#15121b] p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-[#ff69bd]">Current consequence</div><div className="mt-5 flex items-end justify-between gap-4"><div><div className="text-5xl font-black tracking-[-0.06em]">{current?.signal_count ?? 0}</div><div className="mt-1 text-sm text-white/45">validated Hangers</div></div><Gauge className="size-9 text-white/18" /></div></div>
              </aside>
            </section>
          </TabsContent>

          <TabsContent value="catalog">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <form onSubmit={addTrack} aria-busy={busy} className="rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 sm:p-8">
                <div className="mb-7"><div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]">Artist catalog</div><h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">Put one track into motion.</h1></div>
                <div className="space-y-4">
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Track title</span><Input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white placeholder:text-white/25" placeholder="Track title" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Artist or band name</span><Input value={artistName} onChange={(event) => setArtistName(event.target.value)} required maxLength={80} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white placeholder:text-white/25" placeholder="Artist or band name" /></label>
                  <div className="block">
                    <span className="mb-2 block text-sm font-semibold text-white/65">Upload your music here</span>
                    <input ref={fileInputRef} type="file" aria-label="Choose your music file" accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac" className="sr-only" disabled={busy} onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setAudioFile(null);
                      setUploadError("");
                      if (file && file.size > 25 * 1024 * 1024) { setUploadError("Choose an audio file under 25 MB."); event.target.value = ""; return; }
                      if (file && (!file.size || !/\.(mp3|wav|flac)$/i.test(file.name))) { setUploadError("Choose an MP3, WAV, or FLAC audio file."); event.target.value = ""; return; }
                      setAudioFile(file);
                    }} />
                    <Button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="h-12 w-full justify-start rounded-xl border border-white/12 bg-white/[0.045] px-4 text-sm font-normal text-white/65 hover:bg-white/10"><Upload /> <span className="truncate">{audioFile ? audioFile.name : "Choose music file"}</span></Button>
                    <p className="mt-2 text-sm text-white/45">MP3, WAV, or FLAC · up to 25 MB.</p>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><Checkbox checked={rightsAttested} onCheckedChange={(value) => setRightsAttested(value === true)} className="mt-0.5 border-white/25 data-[state=checked]:border-[#ff3ea5] data-[state=checked]:bg-[#ff3ea5]" /><span className="text-sm leading-relaxed text-white/62">I own this recording or am authorized to present it, and I permit MusicBat to stream it in this test loop.</span></label>
                  <Button disabled={busy || !rightsAttested || !audioFile} type="submit" className="h-12 w-full rounded-xl bg-[#ff3ea5] text-base font-black text-white hover:bg-[#ff69bd]">{busy ? "Uploading your track…" : "Add to Radio"}</Button>
                  {uploadError && <p role="alert" className="text-sm text-[#ff9dcc]">{uploadError}{signInRequired && <> <a className="font-bold underline" href="/signin-with-chatgpt?return_to=%2F">Sign in to upload</a></>}</p>}
                </div>
              </form>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-white/42">Rights-cleared catalog</div><h2 className="mt-2 text-2xl font-black">{tracks.length} active track{tracks.length === 1 ? "" : "s"}</h2></div><ShieldCheck className="size-7 text-[#ff69bd]" /></div>
                <div className="space-y-2">{tracks.map((track) => <div key={track.id} className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { failedRef.current.delete(track.id); continuingRef.current = false; setCurrentIndex(tracks.findIndex((item) => item.id === track.id)); setPlaybackCycle((cycle) => cycle + 1); setTab("radio"); }} className="flex min-w-0 flex-1 basis-[220px] items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.035] p-4 text-left transition hover:border-[#ff3ea5]/40 hover:bg-[#ff3ea5]/5"><div className="min-w-0"><div className="truncate font-bold">{track.title}</div><div className="truncate text-sm text-white/42">{track.artist_name}</div></div><div className="shrink-0 text-xs font-black uppercase tracking-wider text-[#ff69bd]">Play</div></button>{Boolean(track.can_manage) && <Button type="button" aria-label={`Keep ${track.title} in rotation`} aria-pressed={Boolean(track.keep_in_rotation)} disabled={busy} onClick={() => void toggleKeep(track)} className={track.keep_in_rotation ? "h-11 rounded-full bg-[#ff3ea5] px-4 text-white hover:bg-[#ff69bd]" : "h-11 rounded-full border border-white/15 bg-white/[0.045] px-4 text-white hover:bg-white/10"}>Keep in rotation</Button>}</div>)}</div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="weight">
            <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111018]">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 p-6 sm:p-8"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]">The Weight Room</div><h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">Where listening becomes leverage.</h1></div><div className="text-sm text-white/42">One Hanger per listener per track</div></div>
              {weightRows.length ? <div>{weightRows.map((row, index) => <div key={row.track_id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-b border-white/8 px-6 py-5 last:border-0 sm:px-8"><div className="text-3xl font-black text-[#ff69bd]">{String(index + 1).padStart(2, "0")}</div><div className="min-w-0"><div className="truncate text-lg font-black">{row.title}</div><div className="truncate text-sm text-white/42">{row.artist_name} · {row.citizen_count} listener{row.citizen_count === 1 ? "" : "s"}</div></div><div className="text-right"><div className="text-3xl font-black">{row.signal_count}</div><div className="text-xs uppercase tracking-wider text-white/35">Hangers</div></div></div>)}</div> : <div className="grid min-h-72 place-items-center p-8 text-center"><div><Gauge className="mx-auto mb-4 size-11 text-white/20" /><div className="text-xl font-black">No signal has weight yet.</div><p className="mt-2 text-white/45">Complete a qualified listen in Radio and place the first Hanger.</p></div></div>}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
