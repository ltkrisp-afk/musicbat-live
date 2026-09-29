"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Disc3, Gauge, Radio, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { MusicBatPlayer } from "@/components/musicbat-player";
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
  rotation_eligible: boolean;
  listener_hanger: keyof typeof hangerLabels | null;
  viewer_qualified: number;
  sale_enabled: number;
  sale_price_cents: number | null;
  sale_currency: string;
  seller_ready: number;
};

type ConnectStatus = {
  connected: boolean;
  ready: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
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
  const [replay, setReplay] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const creditsRef = useRef(new Map<number, number>());
  const failedRef = useRef(new Set<number>());
  const currentTrackIdRef = useRef<number | null>(null);
  const activeSessionRef = useRef("");
  const hangerStartingRef = useRef(false);
  const [listenId, setListenId] = useState<string | null>(null);
  const [qualified, setQualified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseDownloadUrl, setPurchaseDownloadUrl] = useState("");
  const purchaseStartingRef = useRef(false);
  const [message, setMessage] = useState("Loading rights-cleared Radio…");
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rightsAttested, setRightsAttested] = useState(false);
  const [sellTrack, setSellTrack] = useState(false);
  const [salePrice, setSalePrice] = useState("1.00");
  const [saleRightsAttested, setSaleRightsAttested] = useState(false);
  const [saleDrafts, setSaleDrafts] = useState<Record<number, string>>({});
  const [saleConsents, setSaleConsents] = useState<Record<number, boolean>>({});
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const startingRef = useRef(false);
  const qualifyingRef = useRef(false);

  const current = tracks[currentIndex] ?? null;
  currentTrackIdRef.current = current?.id ?? null;
  activeSessionRef.current = `${current?.id}:${replay}`;
  const canRespond = qualified || Boolean(current?.viewer_qualified);
  const keepActive = Boolean(current?.can_manage ? current.keep_in_rotation : current?.viewer_keep_in_rotation);

  const refresh = useCallback(async () => {
    const [trackData, weightData] = await Promise.all([
      api<{ tracks: Track[] }>("/api/musicbat?view=tracks"),
      api<{ rows: WeightRow[] }>("/api/musicbat?view=weight-room"),
    ]);
    const updated = trackData.tracks.map((track) => ({
      ...track,
      id: Number(track.id),
      signal_count: Number(track.signal_count),
      viewer_qualified: Number(track.viewer_qualified),
      sale_enabled: Number(track.sale_enabled),
      sale_price_cents: track.sale_price_cents == null ? null : Number(track.sale_price_cents),
      seller_ready: Number(track.seller_ready),
    }));
    setSaleDrafts((drafts) => {
      const next = { ...drafts };
      for (const track of updated) if (!(track.id in next)) next[track.id] = ((track.sale_price_cents ?? 100) / 100).toFixed(2);
      return next;
    });
    const selectedIndex = updated.findIndex((track) => track.id === currentTrackIdRef.current);
    setTracks(updated);
    setCurrentIndex(Math.max(0, selectedIndex));
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

  const refreshConnectStatus = useCallback(async () => {
    try {
      setConnectStatus(await api<ConnectStatus>("/api/musicbat/stripe/connect"));
    } catch { setConnectStatus(null); }
  }, []);

  useEffect(() => { void refreshConnectStatus(); }, [refreshConnectStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("purchase");
    const order = params.get("order");
    const stripeReturn = params.get("stripe");
    if (stripeReturn) {
      void refreshConnectStatus().then(() => setMessage(stripeReturn === "return" ? "Stripe setup returned to MusicBat. Payout status refreshed." : "Restart Stripe onboarding to finish payout setup."));
    }
    if (state === "cancelled") setPurchaseMessage("Checkout cancelled. The track remains locked and you were not charged.");
    if (state === "success" && order) {
      setPurchaseMessage("Payment received by Stripe. Confirming it securely…");
      void (async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            const result = await api<{ purchase: { status: string }; downloadUrl: string | null }>(`/api/musicbat/purchase?id=${encodeURIComponent(order)}`);
            if (result.purchase.status === "paid" && result.downloadUrl) {
              setPurchaseDownloadUrl(result.downloadUrl);
              setPurchaseMessage("Payment confirmed. Your track is ready to download.");
              window.history.replaceState({}, "", window.location.pathname);
              return;
            }
          } catch { /* The buyer cookie or webhook may not be ready yet. */ }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        setPurchaseMessage("Stripe is still confirming the payment. Refresh this page in a moment; the track stays locked until confirmation arrives.");
      })();
    }
    if (state === "cancelled" || stripeReturn) window.history.replaceState({}, "", window.location.pathname);
  }, [refreshConnectStatus]);

  useEffect(() => {
    setListenId(null);
    setPurchaseMessage("");
    setQualified(false);
    startingRef.current = false;
    qualifyingRef.current = false;
  }, [current?.id, replay]);

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

  async function startListen() {
    if (!current || listenId || startingRef.current) return;
    const session = activeSessionRef.current;
    startingRef.current = true;
    try {
      const result = await api<{ listenId: string; minimumSeconds: number }>("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "start_listen", trackId: current.id }),
      });
      if (activeSessionRef.current !== session) return;
      setListenId(result.listenId);
      setMessage(`Listen for ${result.minimumSeconds} seconds to unlock your Hanger.`);
    } catch (error) {
      if (activeSessionRef.current !== session) return;
      setMessage(error instanceof Error ? error.message : "Could not start the listen.");
    } finally {
      if (activeSessionRef.current === session) startingRef.current = false;
    }
  }

  async function qualifyListen(currentTime: number) {
    if (!current || !listenId || qualified || qualifyingRef.current || currentTime < 12) return;
    qualifyingRef.current = true;
    const session = activeSessionRef.current;
    try {
      await api("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "qualify_listen", trackId: current.id, listenId }),
      });
      if (activeSessionRef.current !== session) return;
      setQualified(true);
      setMessage("Qualified listen. Choose the response that carries weight.");
    } catch (error) {
      if (activeSessionRef.current !== session) return;
      setMessage(error instanceof Error ? error.message : "Keep listening.");
    } finally {
      if (activeSessionRef.current === session) qualifyingRef.current = false;
    }
  }

  async function toggleKeep(track: Track) {
    if (hangerStartingRef.current) return;
    const session = activeSessionRef.current;
    const active = Boolean(track.can_manage ? track.keep_in_rotation : track.viewer_keep_in_rotation);
    hangerStartingRef.current = true;
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({
        action: track.can_manage ? "set_rotation_priority" : "toggle_rotation_hanger",
        trackId: track.id, enabled: !active,
      }) });
      await refresh();
      if (activeSessionRef.current === session) setMessage(active ? "Keep in rotation is off. This song remains in normal Radio rotation." : "Keep in rotation is on. Rotation priority saved.");
    } catch (error) {
      if (activeSessionRef.current === session) setMessage(error instanceof Error ? error.message : "Rotation setting could not be saved.");
    } finally { setBusy(false); hangerStartingRef.current = false; }
  }

  async function placeHanger(kind: keyof typeof hangerLabels) {
    if (kind === "keep_in_rotation") { if (current) await toggleKeep(current); return; }
    if (!current || !canRespond || hangerStartingRef.current) return;
    const selected = current;
    const session = activeSessionRef.current;
    hangerStartingRef.current = true;
    setBusy(true);
    try {
      await api("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "hanger", trackId: selected.id, kind }),
      });
      await refresh();
      if (activeSessionRef.current === session) setMessage(`${hangerLabels[kind]} recorded. The Weight Room has been updated.`);
    } catch (error) {
      if (activeSessionRef.current === session) setMessage(error instanceof Error ? error.message : "Hanger could not be recorded.");
    } finally {
      setBusy(false);
      hangerStartingRef.current = false;
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
      const result = await api<{ purchase: { id: string }; checkoutAvailable: true; checkoutUrl: string }>("/api/musicbat/purchase", {
        method: "POST", body: JSON.stringify({ trackId: selected.id }),
      });
      window.location.assign(result.checkoutUrl);
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
      form.set("saleEnabled", String(sellTrack));
      form.set("saleRightsAttested", String(saleRightsAttested));
      form.set("salePriceCents", String(Math.round(Number(salePrice) * 100)));
      await api("/api/musicbat", { method: "POST", body: form });
      setTitle("");
      setArtistName("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRightsAttested(false);
      setSellTrack(false);
      setSalePrice("1.00");
      setSaleRightsAttested(false);
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

  async function connectStripe() {
    if (connectBusy) return;
    setConnectBusy(true);
    try {
      const result = await api<ConnectStatus & { onboardingUrl: string | null }>("/api/musicbat/stripe/connect", { method: "POST", body: "{}" });
      setConnectStatus(result);
      if (result.onboardingUrl) window.location.assign(result.onboardingUrl);
      else setMessage("Stripe payouts are ready for your MusicBat track sales.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stripe payout setup could not start.");
    } finally { setConnectBusy(false); }
  }

  async function saveSale(track: Track, enabled: boolean) {
    const price = Math.round(Number(saleDrafts[track.id]) * 100);
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({
        action: "set_sale_settings",
        trackId: track.id,
        saleEnabled: enabled,
        salePriceCents: price,
        saleRightsAttested: enabled ? Boolean(saleConsents[track.id]) : false,
      }) });
      await refresh();
      setMessage(enabled ? `“${track.title}” is offered for sale. Checkout opens after Stripe payouts are ready.` : `Sales are off for “${track.title}”. Radio playback is unchanged.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sale settings could not be saved.");
    } finally { setBusy(false); }
  }

  function nextTrack(continuePlaying = true) {
    const next = selectNextTrack(tracks, current?.id, creditsRef.current, failedRef.current);
    if (!next) { setAutoPlay(false); setMessage("No playable eligible tracks are available. Choose a track to retry."); return; }
    setAutoPlay(continuePlaying);
    setCurrentIndex(tracks.findIndex((track) => track.id === next.id));
    setReplay((value) => value + 1);
    setMessage("Radio continues. Every song remains eligible for rotation.");
  }

  const loopStatus = useMemo(() => {
    if (!tracks.length) return "Catalog is waiting for its first track";
    if (canRespond) return "Hanger unlocked";
    if (listenId) return "Listen in progress";
    return `${tracks.length} track${tracks.length === 1 ? "" : "s"} in Radio`;
  }, [listenId, canRespond, tracks.length]);

  return (
    <main className="min-h-screen bg-[#08070b] text-[#f7f4ed]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-6 lg:px-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full border border-[#ff3ea5]/40 bg-[#ff3ea5]/10 text-[#ff69bd] shadow-[0_0_34px_rgba(255,62,165,.18)]">
              <Activity className="size-5" />
            </div>
            <div><div className="text-[0.72rem] font-black uppercase tracking-[0.24em] text-[#ff69bd]">MusicBat</div></div>
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
                      <MusicBatPlayer src={current.audio_url} title={current.title} replay={replay} autoPlay={autoPlay} onPlay={() => { setAutoPlay(true); void startListen(); }} onProgress={(seconds) => void qualifyListen(seconds)} onEnded={() => nextTrack(true)} onError={setMessage} onUnavailable={() => { failedRef.current.add(current.id); nextTrack(autoPlay); }} />
                      <Button type="button" disabled={purchaseBusy} aria-busy={purchaseBusy} onClick={() => void buyCurrentTrack()} aria-label={`Buy ${current.title}`} data-track-id={current.id} className="h-12 shrink-0 rounded-full border border-[#ff3ea5]/50 bg-[#ff3ea5]/20 px-6 text-base font-black text-white disabled:opacity-60">{current.sale_enabled && current.sale_price_cents ? `Buy $${(current.sale_price_cents / 100).toFixed(2)}` : "Buy"}</Button>
                    </div>
                    {purchaseMessage && <p role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-white/65">{purchaseMessage}{purchaseDownloadUrl && <> <a className="font-black text-[#ff69bd] underline" href={purchaseDownloadUrl}>Download track</a></>}</p>}
                    <div className="mt-6 flex flex-wrap gap-3">
                      {(Object.keys(hangerLabels) as Array<keyof typeof hangerLabels>).map((kind) => <Button key={kind} aria-pressed={kind === "keep_in_rotation" ? keepActive : current.listener_hanger === kind} disabled={busy || (kind === "keep_in_rotation" ? !current.can_manage && !canRespond && !keepActive : !canRespond)} onClick={() => void placeHanger(kind)} title={kind === "keep_in_rotation" ? "On gives extra rotation priority. Off keeps normal Radio eligibility." : kind === "standout" ? "Mark this song as exceptional." : "Tell the artist you want to hear more."} className={(kind === "keep_in_rotation" ? keepActive : current.listener_hanger === kind) ? "h-11 rounded-full border border-[#ff69bd] bg-[#ff3ea5] px-5 text-white shadow-[0_0_18px_rgba(255,62,165,.35)] hover:bg-[#ff69bd]" : kind === "keep_in_rotation" ? "h-11 rounded-full border border-[#ff3ea5]/60 bg-[#ff3ea5]/10 px-5 text-[#ff9dcc] hover:bg-[#ff3ea5]/20" : "h-11 rounded-full border border-white/15 bg-white/[0.045] px-5 text-white hover:bg-white/10"}>{hangerLabels[kind]}</Button>)}
                    </div>
                  </> : <div className="grid min-h-[390px] place-items-center text-center"><div><Disc3 className="mx-auto mb-5 size-12 text-[#ff69bd]" /><h1 className="text-3xl font-black tracking-tight">Radio needs its first track.</h1><p className="mx-auto mt-3 max-w-md text-white/52">Upload your music file and confirm your rights to enter Radio.</p><Button onClick={() => setTab("catalog")} className="mt-6 rounded-full bg-[#ff3ea5] px-6 text-white hover:bg-[#ff69bd]">Add the first track</Button></div></div>}
                </div>
              </div>
              <aside className="flex flex-col gap-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6"><div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45"><Sparkles className="size-4 text-[#ff69bd]" /> Signal status</div><p className="text-lg font-semibold leading-snug">{loading ? "Loading the loop…" : message}</p>{message === "Sign in to use MusicBat." && <a href="/signin-with-chatgpt?return_to=%2F" className="mt-3 inline-block font-bold text-[#ff69bd] underline">Sign in to keep songs in rotation</a>}<div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-[#ff3ea5] transition-all ${canRespond ? "w-full" : listenId ? "w-2/3" : tracks.length ? "w-1/3" : "w-0"}`} /></div></div>
                <div className="rounded-[1.5rem] border border-white/10 bg-[#15121b] p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-[#ff69bd]">Current consequence</div><div className="mt-5 flex items-end justify-between gap-4"><div><div className="text-5xl font-black tracking-[-0.06em]">{current?.signal_count ?? 0}</div><div className="mt-1 text-sm text-white/45">validated Hangers</div></div><Gauge className="size-9 text-white/18" /></div></div>
              </aside>
            </section>
          </TabsContent>

          <TabsContent value="catalog">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <form onSubmit={addTrack} aria-busy={busy} className="rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 sm:p-8">
                <div className="mb-7"><div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]">Artist catalog</div><h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">Put one track into motion.</h1></div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-black text-white">Artist payouts</div>
                    <p className="mt-1 text-sm text-white/50">{connectStatus?.ready ? "Stripe test payouts are ready." : connectStatus?.connected ? "Finish Stripe onboarding before buyers can check out." : "Connect a separate MusicBat Stripe Express account to receive 90% of each sale."}</p>
                    <Button type="button" disabled={connectBusy || Boolean(connectStatus?.ready)} onClick={() => void connectStripe()} className="mt-3 h-10 rounded-full border border-[#ff3ea5]/50 bg-[#ff3ea5]/15 px-4 text-white hover:bg-[#ff3ea5]/25">{connectBusy ? "Opening Stripe…" : connectStatus?.ready ? "Stripe connected" : connectStatus?.connected ? "Finish Stripe setup" : "Connect Stripe payouts"}</Button>
                  </div>
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
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><Checkbox checked={sellTrack} onCheckedChange={(value) => { setSellTrack(value === true); if (value !== true) setSaleRightsAttested(false); }} className="mt-0.5 border-white/25 data-[state=checked]:border-[#ff3ea5] data-[state=checked]:bg-[#ff3ea5]" /><span className="text-sm leading-relaxed text-white/62">Offer this track for sale as a downloadable music file.</span></label>
                  {sellTrack && <div className="space-y-3 rounded-xl border border-[#ff3ea5]/25 bg-[#ff3ea5]/5 p-4">
                    <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Price in USD</span><Input value={salePrice} onChange={(event) => setSalePrice(event.target.value)} required min="0.50" max="1000" step="0.01" type="number" inputMode="decimal" className="h-11 rounded-xl border-white/12 bg-black/20 px-4 text-white" /></label>
                    <label className="flex cursor-pointer items-start gap-3"><Checkbox checked={saleRightsAttested} onCheckedChange={(value) => setSaleRightsAttested(value === true)} className="mt-0.5 border-white/25 data-[state=checked]:border-[#ff3ea5] data-[state=checked]:bg-[#ff3ea5]" /><span className="text-sm leading-relaxed text-white/62">I authorize MusicBat to sell and deliver this recording to buyers.</span></label>
                  </div>}
                  <Button disabled={busy || !rightsAttested || !audioFile || (sellTrack && !saleRightsAttested)} type="submit" className="h-12 w-full rounded-xl bg-[#ff3ea5] text-base font-black text-white hover:bg-[#ff69bd]">{busy ? "Uploading your track…" : "Add to Radio"}</Button>
                  {uploadError && <p role="alert" className="text-sm text-[#ff9dcc]">{uploadError}{signInRequired && <> <a className="font-bold underline" href="/signin-with-chatgpt?return_to=%2F">Sign in to upload</a></>}</p>}
                </div>
              </form>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-white/42">Rights-cleared catalog</div><h2 className="mt-2 text-2xl font-black">{tracks.length} active track{tracks.length === 1 ? "" : "s"}</h2></div><ShieldCheck className="size-7 text-[#ff69bd]" /></div>
                <div className="space-y-3">{tracks.map((track) => <div key={track.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { failedRef.current.delete(track.id); setAutoPlay(false); setCurrentIndex(tracks.findIndex((item) => item.id === track.id)); setReplay((cycle) => cycle + 1); setTab("radio"); }} className="flex min-w-0 flex-1 basis-[220px] items-center justify-between gap-4 rounded-xl bg-white/[0.025] p-3 text-left transition hover:bg-[#ff3ea5]/5"><div className="min-w-0"><div className="truncate font-bold">{track.title}</div><div className="truncate text-sm text-white/42">{track.artist_name}{track.sale_enabled && track.sale_price_cents ? ` · $${(track.sale_price_cents / 100).toFixed(2)}` : ""}</div></div><div className="shrink-0 text-xs font-black uppercase tracking-wider text-[#ff69bd]">Play</div></button>
                    {Boolean(track.can_manage) && <Button type="button" aria-label={`Keep ${track.title} in rotation`} aria-pressed={Boolean(track.keep_in_rotation)} disabled={busy} onClick={() => void toggleKeep(track)} className={track.keep_in_rotation ? "h-10 rounded-full bg-[#ff3ea5] px-4 text-white hover:bg-[#ff69bd]" : "h-10 rounded-full border border-white/15 bg-white/[0.045] px-4 text-white hover:bg-white/10"}>Keep in rotation</Button>}
                  </div>
                  {Boolean(track.can_manage) && <div className="mt-2 rounded-lg border border-white/8 bg-black/15 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-28 flex-1"><span className="mb-1 block text-xs font-bold text-white/50">Sale price USD</span><Input type="number" inputMode="decimal" min="0.50" max="1000" step="0.01" value={saleDrafts[track.id] ?? "1.00"} onChange={(event) => setSaleDrafts((drafts) => ({ ...drafts, [track.id]: event.target.value }))} className="h-10 rounded-lg border-white/12 bg-white/[0.045] text-white" /></label>
                      <Button type="button" disabled={busy || !saleConsents[track.id]} onClick={() => void saveSale(track, true)} className="h-10 rounded-full bg-[#ff3ea5] px-4 text-white hover:bg-[#ff69bd]">{track.sale_enabled ? "Update sale" : "Enable sale"}</Button>
                      {Boolean(track.sale_enabled) && <Button type="button" disabled={busy} onClick={() => void saveSale(track, false)} className="h-10 rounded-full border border-white/15 bg-white/[0.045] px-4 text-white hover:bg-white/10">Stop sales</Button>}
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-2"><Checkbox checked={Boolean(saleConsents[track.id])} onCheckedChange={(value) => setSaleConsents((consents) => ({ ...consents, [track.id]: value === true }))} className="mt-0.5 border-white/25 data-[state=checked]:border-[#ff3ea5] data-[state=checked]:bg-[#ff3ea5]" /><span className="text-xs leading-relaxed text-white/50">I authorize MusicBat to sell and deliver this recording. Artist receives 90%; MusicBat retains 10% before Stripe processing costs.</span></label>
                    <div className="mt-2 text-xs text-white/40">{track.sale_enabled ? (track.seller_ready ? "Checkout ready in Stripe test mode." : "Sale saved; finish Stripe payout setup before checkout can open.") : "Not currently for sale."}</div>
                  </div>}
                </div>)}</div>
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
