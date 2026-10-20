"use client";
/* Authentication and download endpoints retain full document navigation. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, Disc3, Gauge, Radio, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { ArtistDiscovery, type Artist } from "@/components/artist-discovery";
import { ArtistRotunda } from "@/components/artist-rotunda";
import {RadioConsole,usePersistentRadio,useRadioCallbacks} from "@/components/persistent-radio";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const subscribeLocation = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const readLocation = () => window.location.search;
const serverLocation = () => "";

type Track = {
  id: number;
  artist_id: string;
  artist_slug: string;
  title: string;
  artist_name: string;
  audio_url: string;
  energy_lane: EnergyLane;
  primary_genre: string;
  subgenre: string | null;
  mood_tags: string;
  created_at: string;
  shock_score: number;
  up_count: number;
  down_count: number;
  keep_in_rotation: number;
  keep_count: number;
  completion_count: number;
  repeat_count: number;
  purchase_count: number;
  viewer_keep_in_rotation: number;
  can_manage: number;
  rotation_eligible: boolean;
  position: number;
  viewer_qualified: number;
  sale_enabled: number;
  sale_price_cents: number | null;
  sale_currency: string;
  seller_ready: number;
};

type EnergyLane = "soft" | "medium" | "hard" | "turbo";
const energyLanes: Array<{ id: EnergyLane; label: string }> = [
  { id: "soft", label: "Soft" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "turbo", label: "Turbo" },
];
const primaryGenres = ["Alternative", "Blues", "Classical", "Country", "Electronic", "Experimental", "Folk", "Hip-Hop", "Jazz", "Metal", "Other", "Punk", "Pop", "Rock"];
const energyCategory = (lane: EnergyLane) => ({ soft: "Soft Energy", medium: "Medium Energy", hard: "High Energy", turbo: "Turbo Energy" })[lane];

type ConnectStatus = {
  connected: boolean;
  ready: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

type ShockRow = {
  track_id: number;
  title: string;
  artist_name: string;
  primary_genre: string;
  energy_lane: EnergyLane;
  shock_score: number;
  up_count: number;
  down_count: number;
  keep_count: number;
  completion_count: number;
  repeat_count: number;
  purchase_count: number;
  position: number;
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

class MusicBatApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new MusicBatApiError(data.error ?? "MusicBat request failed.", response.status);
  return data;
}

export default function MusicBatLoop({ displayName, artistSlug, initialTab }: { displayName: string; artistSlug?:string;initialTab?:string }) {
  const returnSearch = useSyncExternalStore(subscribeLocation, readLocation, serverLocation);
  const stripeLanding = new URLSearchParams(returnSearch).get('stripe');
  const [tab, setTab] = useState(artistSlug ? "discover" : stripeLanding==='return'||stripeLanding==='refresh' ? 'catalog' : initialTab ?? "radio");
  const routeView = JSON.stringify([artistSlug ?? null, initialTab ?? null]);
  const [previousRouteView, setPreviousRouteView] = useState(routeView);
  // Client navigation may reuse this screen; select its new route without
  // remounting the root-owned audio or overriding ordinary local tab changes.
  if (previousRouteView !== routeView) {
    setPreviousRouteView(routeView);
    setTab(artistSlug ? "discover" : initialTab ?? "radio");
  }
  useEffect(() => {
    const open = () => setTab("radio");
    window.addEventListener("musicbat:open-radio", open);
    return () => window.removeEventListener("musicbat:open-radio", open);
  }, []);
  const [artists,setArtists]=useState<Artist[]>([]),[canManage,setCanManage]=useState(false),[followingOnly,setFollowingOnly]=useState(false),[search,setSearch]=useState('');
  const [artistIdentity,setArtistIdentity]=useState<string|null>(null);
  const [artistError,setArtistError]=useState(''),[artistLoading,setArtistLoading]=useState(true),[followBusy,setFollowBusy]=useState(false);
  const followStartingRef=useRef(false);
  const loadArtists=useCallback(async()=>{
    setArtistLoading(true);
    try {const d=await api<{artists:Artist[];canManage:boolean;artistIdentity?:string|null}>('/api/musicbat?view=artists');setArtists(d.artists);setCanManage(d.canManage);setArtistIdentity(typeof d.artistIdentity==='string'?d.artistIdentity:null);setArtistError('');}
    catch(e){setArtistError(e instanceof Error?e.message:'Could not load artists.');throw e;}
    finally{setArtistLoading(false);}
  },[]);
  useEffect(()=>{const task=setTimeout(()=>void loadArtists().catch(()=>{}),0);return()=>clearTimeout(task);},[loadArtists]);
  async function followArtist(artist:Artist){
    if(followStartingRef.current)return;
    followStartingRef.current=true;setFollowBusy(true);
    try{await api('/api/musicbat',{method:'POST',body:JSON.stringify({action:'follow_artist',artistId:artist.artist_id,enabled:!artist.following})});await loadArtists();setMessage(artist.following?'Artist unfollowed.':'Artist followed.');}
    catch(e){setMessage(e instanceof Error?e.message:'Could not follow artist.');}
    finally{followStartingRef.current=false;setFollowBusy(false);}
  }

  const [tracks, setTracks] = useState<Track[]>([]);
  const [legacyOrder, setLegacyOrder] = useState<string | null>(null);
  const [ownedPurchases, setOwnedPurchases] = useState<{id:string;title:string;status:string}[]>([]);
  const [shockRows, setShockRows] = useState<ShockRow[]>([]);
  const {trackId:sharedTrackId,performanceKey:sharedPerformanceKey,interactive}=usePersistentRadio();
  const currentTrackIdRef = useRef<number | null>(null);
  const activeSessionRef = useRef("");
  const signalStartingRef = useRef(false);
  const [listenId, setListenId] = useState<string | null>(null);
  const [qualified, setQualified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseStatus, setPurchaseMessage] = useState("");
  const returnParams = new URLSearchParams(returnSearch);
  const purchaseMessage = purchaseStatus || (returnParams.get("purchase") === "cancelled"
    ? "Checkout cancelled. The track remains locked and you were not charged."
    : returnParams.get("purchase") === "success" ? "Payment received by Stripe. Confirming it securely…" : "");
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
  const [uploadEnergyLane, setUploadEnergyLane] = useState<EnergyLane>("medium");
  const [uploadGenre, setUploadGenre] = useState("");
  const [uploadSubgenre, setUploadSubgenre] = useState("");
  const [uploadStyle, setUploadStyle] = useState("");
  const [uploadMoodTags, setUploadMoodTags] = useState("");
  const [saleRightsAttested, setSaleRightsAttested] = useState(false);
  const [saleDrafts, setSaleDrafts] = useState<Record<number, string>>({});
  const [saleConsents, setSaleConsents] = useState<Record<number, boolean>>({});
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const connectStartingRef = useRef(false);
  const [connectError, setConnectError] = useState("");
  const [connectSignIn, setConnectSignIn] = useState(false);
  const startingRef = useRef(false);
  const qualifyingRef = useRef(false);

  const current = tracks.find(track => String(track.id) === sharedTrackId) ?? null;
  const sessionKey = `${current?.id}:${sharedPerformanceKey}`;
  const [previousSession, setPreviousSession] = useState(sessionKey);
  // Reset render state when identity changes, before children commit the new audio.
  if (previousSession !== sessionKey) {
    setPreviousSession(sessionKey);
    setListenId(null);
    setQualified(false);
  }
  useLayoutEffect(() => {
    currentTrackIdRef.current = current?.id ?? null;
    activeSessionRef.current = sessionKey;
    startingRef.current = false;
    qualifyingRef.current = false;
  }, [current?.id, sessionKey]);
  const canRespond = interactive && qualified;
  const feedbackHint = !interactive
    ? "Free Radio is for listening. Voting and Keep require Radio Plus on a Plus station."
    : !qualified ? "Play this station for at least 12 seconds to unlock voting and Keep for this track." : null;
  const keepActive = Boolean(current?.viewer_keep_in_rotation);

  const fetchRadio = useCallback(() => Promise.all([
      api<{ tracks: Track[] }>("/api/musicbat?view=tracks"),
      api<{ rows: ShockRow[] }>("/api/musicbat?view=shock-room").catch(error => { if (error instanceof MusicBatApiError && (error.status === 401 || error.status === 403)) return {rows:[]}; throw error; }),
    ]), []);

  const applyRadio = useCallback(([trackData, shockData]: [{ tracks: Track[] }, { rows: ShockRow[] }]) => {
    const updated = trackData.tracks.map((track) => ({
      ...track,
      id: Number(track.id),
      shock_score: Number(track.shock_score),
      up_count: Number(track.up_count),
      down_count: Number(track.down_count),
      keep_count: Number(track.keep_count),
      completion_count: Number(track.completion_count),
      repeat_count: Number(track.repeat_count),
      purchase_count: Number(track.purchase_count),
      position: Number(track.position),
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
    setTracks(updated);
    setShockRows(shockData.rows.map((row) => ({
      ...row,
      track_id: Number(row.track_id),
      shock_score: Number(row.shock_score),
      up_count: Number(row.up_count),
      down_count: Number(row.down_count),
      keep_count: Number(row.keep_count),
      completion_count: Number(row.completion_count),
      repeat_count: Number(row.repeat_count),
      purchase_count: Number(row.purchase_count),
      position: Number(row.position),
    })));
  }, [setTracks,setShockRows]);

  const refresh = useCallback(async () => Promise.all([fetchRadio(),loadArtists()]).then(([data])=>applyRadio(data)), [applyRadio, fetchRadio,loadArtists]);

  useEffect(() => {
    let cancelled = false;
    fetchRadio()
      .then((data) => { if (!cancelled) applyRadio(data); })
      .then(() => { if (!cancelled) setMessage("Choose a musical category and press play."); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Radio unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchRadio, applyRadio]);

  const refreshConnectStatus = useCallback(async () => {
    try {
      const status = await api<ConnectStatus>("/api/musicbat/stripe/connect");
      setConnectStatus(status);
    } catch { setConnectStatus(null); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<ConnectStatus>("/api/musicbat/stripe/connect")
      .then(status => { if (!cancelled) setConnectStatus(status); })
      .catch(() => { if (!cancelled) setConnectStatus(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(returnSearch);
    const state = params.get("purchase");
    const order = params.get("order");
    const stripeReturn = params.get("stripe");
    if (stripeReturn === 'return' || stripeReturn === 'refresh') {
      void api<ConnectStatus>("/api/musicbat/stripe/connect").then(status => {
        setConnectStatus(status);
        setMessage(stripeReturn === "return" ? "Stripe setup returned to MusicBat. Payout status refreshed." : "Restart Stripe onboarding to finish payout setup.");
      }).catch(() => setConnectStatus(null));
    }
    if (state === "success" && order) {

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
          } catch (error) {
            if (error instanceof MusicBatApiError && error.status === 409) {
              setLegacyOrder(order); setPurchaseMessage("This older purchase needs explicit account recovery. Use its original browser and the account matching your receipt."); return;
            }
            if (error instanceof MusicBatApiError && (error.status === 401 || error.status === 404)) {
              setPurchaseDownloadUrl(""); setPurchaseMessage("Sign in to the account that owns this purchase."); return;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        setPurchaseMessage("Stripe is still confirming the payment. Refresh this page in a moment; the track stays locked until confirmation arrives.");
      })();
    }
    if (stripeReturn === 'return' || stripeReturn === 'refresh') window.history.replaceState({}, "", window.location.pathname+'?view=artist');
    else if (state === "cancelled") window.history.replaceState({}, "", window.location.pathname);
  }, [refreshConnectStatus, returnSearch]);

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
        name: "get_musicbat_shock_room",
        title: "Read the Shock Room",
        description: "Read category positions based on listener choices.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => api<{ rows: ShockRow[] }>("/api/musicbat?view=shock-room").catch(error => { if (error instanceof MusicBatApiError && (error.status === 401 || error.status === 403)) return {rows:[]}; throw error; }),
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
        body: JSON.stringify({ action: "start_listen", trackId: current.id, performanceKey: sharedPerformanceKey }),
      });
      if (activeSessionRef.current !== session) return;
      setListenId(result.listenId);
      setMessage(`Listening is exposure. Listen for ${result.minimumSeconds} seconds to respond.`);
    } catch (error) {
      if (activeSessionRef.current !== session) return;
      setMessage(error instanceof Error ? error.message : "Could not start the listen.");
    } finally {
      if (activeSessionRef.current === session) startingRef.current = false;
    }
  }

  async function qualifyListen(currentTime: number) {
    if (!interactive || !current || !listenId || qualified || qualifyingRef.current || currentTime < 12) return;
    qualifyingRef.current = true;
    const session = activeSessionRef.current;
    try {
      await api("/api/musicbat", {
        method: "POST",
        body: JSON.stringify({ action: "qualify_listen", trackId: current.id, listenId }),
      });
      if (activeSessionRef.current !== session) return;
      setQualified(true);
      setMessage("Qualified listen. Your choices can now affect this track's position.");
    } catch (error) {
      if (activeSessionRef.current !== session) return;
      setMessage(error instanceof Error ? error.message : "Keep listening.");
    } finally {
      if (activeSessionRef.current === session) qualifyingRef.current = false;
    }
  }

  useRadioCallbacks({onError:setMessage,onPlay:()=>void startListen(),onProgress:seconds=>void qualifyListen(seconds),onEnded:()=>void completeListen()});

  async function toggleKeep(track: Track) {
    if (signalStartingRef.current) return;
    const session = activeSessionRef.current;
    const active = Boolean(track.viewer_keep_in_rotation);
    signalStartingRef.current = true;
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({
        action: "toggle_keep",
        trackId: track.id, enabled: !active,
      }) });
      await refresh();
      if (activeSessionRef.current === session) setMessage(active ? "Keep in rotation is off. This song remains in normal Radio rotation." : "Keep in rotation is on. Rotation priority saved.");
    } catch (error) {
      if (activeSessionRef.current === session) setMessage(error instanceof Error ? error.message : "Rotation setting could not be saved.");
    } finally { setBusy(false); signalStartingRef.current = false; }
  }

  async function buyCurrentTrack(track: Track | null = current) {
    if (!track || purchaseStartingRef.current) return;
    // Capture before awaiting: Radio can change without changing this purchase.
    const selected = { id: track.id, title: track.title };
    purchaseStartingRef.current = true;
    setPurchaseBusy(true);
    setPurchaseMessage(`Selecting “${selected.title}”…`);
    try {
      const endpoint = "/api/musicbat/purchase";
      const first = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trackId: selected.id }) });
      const quoteResponse = await first.json() as { confirmationRequired?: boolean; quote?: { baseCents: number; processingCents: number; totalCents: number }; error?: string };
      if (!quoteResponse.confirmationRequired || !quoteResponse.quote) throw new Error(quoteResponse.error || "Checkout quote unavailable.");
      const { baseCents, processingCents, totalCents } = quoteResponse.quote;
      const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
      if (!window.confirm(`MusicBat purchase: ${selected.title}\nSong: ${usd(baseCents)}\nBuyer processing charge: ${usd(processingCents)}\nTotal charged: ${usd(totalCents)}\n\nArtist receives 85% of the song price. Continue to Stripe?`)) return;
      const result = await api<{ purchase: { id: string }; checkoutAvailable: true; checkoutUrl: string }>(endpoint, {
        method: "POST", body: JSON.stringify({ trackId: selected.id, confirmedTotalCents: totalCents }),
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
      const fields=new FormData(event.currentTarget as HTMLFormElement);
      const metadata:Record<string,unknown>={};
      for(const key of ['album','isrc','iswc']) {const value=String(fields.get(key) ?? '').trim();if(value)metadata[key]=value;}
      form.set('metadata',JSON.stringify(metadata));
      form.set("title", title);
      form.set("artistName", artistName);
      form.set("audio", audioFile);
      form.set("rightsAttested", String(rightsAttested));
      form.set("saleEnabled", String(sellTrack));
      form.set("saleRightsAttested", String(saleRightsAttested));
      form.set("salePriceCents", String(Math.round(Number(salePrice) * 100)));
      form.set("energyLane", uploadEnergyLane);
      form.set("primaryGenre", uploadGenre);
      form.set("subgenre", uploadSubgenre);
      form.set("style", uploadStyle);
      form.set("moodTags", uploadMoodTags);
      await api("/api/musicbat", { method: "POST", body: form });
      setTitle("");
      setArtistName("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRightsAttested(false);
      setSellTrack(false);
      setSalePrice("1.00");
      setUploadEnergyLane("medium");
      setUploadGenre("");
      setUploadSubgenre("");
      setUploadStyle("");
      setUploadMoodTags("");
      setSaleRightsAttested(false);
      await refresh();
      setTab("rotunda");
      setMessage("Track accepted. Radio eligibility requires reviewed rights and category approval.");
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
    if (connectStartingRef.current) return;
    connectStartingRef.current = true;
    setConnectBusy(true);
    setConnectError("");setConnectSignIn(false);
    try {
      if (!canManage) {
        if (!artistName.trim()) throw new Error("Enter your artist or band name below to create your artist identity before connecting payouts.");
        await api('/api/musicbat', {method:'POST',body:JSON.stringify({action:'set_artist_identity',artistName:artistName.trim()})});
        await loadArtists();
      }
      const result = await api<ConnectStatus & { onboardingUrl: string | null }>("/api/musicbat/stripe/connect", { method: "POST", body: "{}" });
      setConnectStatus(result);
      if (result.onboardingUrl) window.location.assign(result.onboardingUrl);
      else if (result.ready) setMessage("Stripe payouts are ready for your MusicBat track sales.");
      else throw new Error("Stripe did not return an onboarding link. Try connecting payouts again.");
    } catch (error) {
      const detail=error instanceof Error ? error.message : "Stripe payout setup could not start.";
      setConnectError(detail);setMessage(detail);
      setConnectSignIn(error instanceof MusicBatApiError && error.status===401);
    } finally { connectStartingRef.current=false;setConnectBusy(false); }
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

  async function sendRadioFeedback(signal: "up" | "down") {
    if (!current || !listenId || busy) return;
    const track = current;
    const session = activeSessionRef.current;
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({
        action: "radio_feedback", trackId: track.id, listenId, signal,
      }) });
      if (activeSessionRef.current === session) {
        setMessage(signal === "up" ? "▲ More like this recorded." : "▼ Less like this recorded.");
        await refresh();
      }
    } catch (error) {
      if (activeSessionRef.current === session) setMessage(error instanceof Error ? error.message : "Radio feedback could not be saved.");
    } finally { setBusy(false); }
  }

  async function completeListen() {
    const completedTrack = current;
    const completedListenId = listenId;
    if (completedTrack && completedListenId && qualified) {
      try { await api("/api/musicbat", { method: "POST", body: JSON.stringify({ action: "complete_listen", trackId: completedTrack.id, listenId: completedListenId }) }); }
      catch { /* Continue playback even if the completion signal cannot be saved. */ }
    }
    await refresh();
  }

  function openRadio() {
    setMessage("Use the Radio category controls to tune a shared channel.");
  }

  async function saveEnergyLane(track: Track, lane: EnergyLane) {
    if (track.energy_lane === lane) return;
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({ action: "set_energy_lane", trackId: track.id, energyLane: lane }) });
      await refresh();
      setMessage(`“${track.title}” assigned to ${lane} Radio.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Energy lane could not be saved.");
    } finally { setBusy(false); }
  }

  async function savePrimaryGenre(track: Track, genre: string) {
    if (track.primary_genre === genre) return;
    setBusy(true);
    try {
      await api("/api/musicbat", { method: "POST", body: JSON.stringify({ action: "set_primary_genre", trackId: track.id, primaryGenre: genre }) });
      await refresh();
      setMessage(`“${track.title}” assigned to ${genre} Radio.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Track genre could not be saved.");
    } finally { setBusy(false); }
  }

  const loopStatus = useMemo(() => {
    if (!tracks.length) return "Catalog is waiting for its first track";
    if (canRespond) return "Listener response ready";
    if (listenId) return "Listen in progress";
    return sharedTrackId ? "Shared Radio performance" : "Radio is quiet or unavailable";
  }, [listenId, canRespond, tracks.length, sharedTrackId]);

  const artistContext = ['catalog','rotunda','shock'].includes(tab) || (tab==='discover' && Boolean(artistSlug) && artists.some(a=>a.slug===artistSlug&&Number(a.is_owner)===1));
  return (
    <main className="min-h-screen bg-[#08070b] text-[#f7f4ed]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-6 lg:px-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full border border-[#ff3ea5]/40 bg-[#ff3ea5]/10 text-[#ff69bd] shadow-[0_0_34px_rgba(255,62,165,.18)]">
              <Activity className="size-5" />
            </div>
            <div><Link href="/" className="text-[0.72rem] font-black uppercase tracking-[0.24em] text-[#ff69bd]">MusicBat</Link><p className="mt-1 text-[0.6rem] tracking-wider text-white/55">YOUR MUSIC. YOUR RIGHTS. YOUR MONEY.</p></div>
          </div>
          <div className="text-right"><div className="text-sm font-semibold text-white/90">{artistContext && artistIdentity ? artistIdentity : displayName}</div><div className="text-xs text-white/45">{artistContext ? canManage ? 'Artist account' : 'Artist setup' : loopStatus}</div></div>
        </header>

        <div className="mb-5 grid grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-center text-[0.68rem] font-black uppercase tracking-[0.12em] text-white/45">
          {["Catalog", "Radio", "Response", "Shock Room"].map((step, index) => <div key={step} className="border-r border-white/10 px-2 py-3 last:border-0"><span className="mr-1 text-[#ff69bd]">0{index + 1}</span> {step}</div>)}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1.5 sm:w-fit">
            <TabsTrigger value="radio" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Radio /> Radio</TabsTrigger>
            <TabsTrigger value="discover" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Disc3 /> Discover Artists</TabsTrigger>
            <TabsTrigger value="catalog" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Disc3 /> Add Track</TabsTrigger>
            {canManage && <TabsTrigger value="shock" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white"><Gauge /> Shock Room</TabsTrigger>}
          {canManage && <TabsTrigger value="rotunda" className="h-10 rounded-lg px-4 text-white/55 data-[state=active]:bg-[#ff3ea5] data-[state=active]:text-white">Manage Songs</TabsTrigger>}</TabsList>

          <details className="mt-3 text-sm"><summary className="cursor-pointer" onClick={() => void api<{purchases:{id:string;title:string;status:string}[]}>("/api/musicbat/purchase").then(data=>setOwnedPurchases(data.purchases)).catch(()=>setPurchaseMessage("Sign in to access purchased music."))}>My purchased music</summary>
            {ownedPurchases.filter(p=>p.status==='paid').map(p=><p key={p.id}><a className="underline" href={`/api/musicbat/purchase/${p.id}/download`}>{p.title} — Download</a></p>)}
          </details>
          {legacyOrder && <Button onClick={() => void api<{downloadUrl:string}>("/api/musicbat/purchase",{method:"POST",body:JSON.stringify({action:"recover_legacy_purchase",purchaseId:legacyOrder})}).then(data=>{setPurchaseDownloadUrl(data.downloadUrl);setLegacyOrder(null);setPurchaseMessage("Purchase recovered to your signed-in account.");}).catch(error=>setPurchaseMessage(error.message))}>Recover this purchase to my account</Button>}
          {purchaseMessage && <p role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-white/65">{purchaseMessage}{purchaseDownloadUrl && <> <a className="font-black text-[#ff69bd] underline" href={purchaseDownloadUrl}>Download track</a></>}</p>}
          <TabsContent value="discover">
            <ArtistDiscovery artists={artists} tracks={tracks} artistSlug={artistSlug} search={search} onSearch={setSearch}
              followingOnly={followingOnly} onFollowingOnly={setFollowingOnly} loading={artistLoading} error={artistError}
              onRetry={()=>void loadArtists().catch(()=>{})} followBusy={followBusy} onFollow={a=>void followArtist(a)}
              purchaseBusy={purchaseBusy} onBuy={t=>void buyCurrentTrack(t as Track)}
              onRadio={()=>{openRadio();setTab('radio');}} message={message} />
          </TabsContent>
          <TabsContent value="radio">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,.65fr)]">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111018] p-6 shadow-[0_28px_90px_rgba(0,0,0,.45)] sm:p-9">
                <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#ff3ea5]/10 blur-3xl" />
                <div className="relative">
                  <div className="mb-10 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]"><span className="size-2 rounded-full bg-[#ff3ea5] shadow-[0_0_14px_#ff3ea5]" /> Now in the cave</div><div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">{sharedTrackId ? "Shared channel" : "Quiet"}</div></div>
                  <RadioConsole />
                  {current ? <>
                    <div className="mb-8 min-h-36"><div className="mb-3 text-sm uppercase tracking-[0.16em] text-white/38">Independent signal · {current.primary_genre} / {energyCategory(current.energy_lane)}</div><h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{current.title}</h1><p className="mt-4 text-lg font-semibold text-white/58">{current.artist_name}</p></div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" disabled={purchaseBusy} aria-busy={purchaseBusy} onClick={() => void buyCurrentTrack()} aria-label={`Buy ${current.title}`} data-track-id={current.id} className="h-12 shrink-0 rounded-full border border-[#ff3ea5]/50 bg-[#ff3ea5]/20 px-6 text-base font-black text-white disabled:opacity-60">{current.sale_enabled && current.sale_price_cents ? `Buy $${(current.sale_price_cents / 100).toFixed(2)}` : "Buy"}</Button>
                      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Radio feedback" aria-describedby={feedbackHint ? "radio-feedback-help" : undefined} style={!canRespond ? {opacity:0.45} : undefined}>
                        <Button type="button" variant="ghost" aria-label="More like this" title="More like this" disabled={busy || !canRespond} onClick={() => void sendRadioFeedback("up")} className="size-10 rounded-full px-0 text-lg font-black text-white/65 hover:bg-[#ff3ea5]/15 hover:text-[#ff69bd]">▲</Button>
                        <Button type="button" variant="ghost" aria-label="Less like this" title="Less like this" disabled={busy || !canRespond} onClick={() => void sendRadioFeedback("down")} className="size-10 rounded-full px-0 text-lg font-black text-white/65 hover:bg-[#ff3ea5]/15 hover:text-[#ff69bd]">▼</Button>
                      </div>
                    </div>
                    {feedbackHint && <p id="radio-feedback-help" role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-white/65">{feedbackHint}</p>}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button aria-pressed={keepActive} aria-describedby={feedbackHint ? "radio-feedback-help" : undefined} style={!canRespond ? {opacity:0.45,cursor:'not-allowed'} : undefined} disabled={busy || !canRespond} onClick={() => void toggleKeep(current)} title={feedbackHint ?? "Keep this track in rotation or remove your keep."} className={keepActive ? "h-11 rounded-full border border-[#ff69bd] bg-[#ff3ea5] px-5 text-white" : "h-11 rounded-full border border-white/15 bg-white/[0.045] px-5 text-white"}>Keep in rotation</Button>
                    </div>
                  </> : <div className="grid min-h-[390px] place-items-center text-center"><div><Disc3 className="mx-auto mb-5 size-12 text-[#ff69bd]" /><h1 className="text-3xl font-black tracking-tight">{tracks.length ? "This category is quiet." : "Radio needs its first track."}</h1><p className="mx-auto mt-3 max-w-md text-white/52">{tracks.length ? "Use the shared Radio category controls or review the catalog." : "Upload your music file, classify it, and confirm your rights to enter Radio."}</p><Button onClick={() => setTab(tracks.length ? "discover" : "catalog")} className="mt-6 rounded-full bg-[#ff3ea5] px-6 text-white hover:bg-[#ff69bd]">{tracks.length ? "Open catalog" : "Add the first track"}</Button></div></div>}
                </div>
              </div>
              <aside className="flex flex-col gap-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6"><div className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45"><Sparkles className="size-4 text-[#ff69bd]" /> Signal status</div><p className="text-lg font-semibold leading-snug">{loading ? "Loading the loop…" : message}</p>{message === "Sign in to use MusicBat." && <a href="/signin-with-chatgpt?return_to=%2F" className="mt-3 inline-block font-bold text-[#ff69bd] underline">Sign in to keep songs in rotation</a>}<div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-[#ff3ea5] transition-all ${canRespond ? "w-full" : listenId ? "w-2/3" : tracks.length ? "w-1/3" : "w-0"}`} /></div></div>
                {Boolean(current?.can_manage) && <div className="rounded-[1.5rem] border border-white/10 bg-[#15121b] p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-[#ff69bd]">Category signal</div><div className="mt-3 text-2xl font-black">Shock Score {current?.shock_score ?? 0}</div><div className="mt-2 text-sm text-white/50">▲ {current?.up_count ?? 0} · ▼ {current?.down_count ?? 0} · Keeps {current?.keep_count ?? 0}</div><div className="mt-1 text-xs text-white/38">Completions {current?.completion_count ?? 0} · Repeat listens {current?.repeat_count ?? 0} · Purchases {current?.purchase_count ?? 0}</div><div className="mt-2 text-sm text-white/50">Position: #{current?.position ?? "—"} — {current?.primary_genre ?? "—"} / {current ? energyCategory(current.energy_lane) : "—"}</div></div>}
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
                    <p className="mt-1 text-sm text-white/50">{connectStatus?.ready ? "Payout setup is ready. Checkout availability follows the configured payment mode." : connectStatus?.connected ? "Finish Stripe onboarding before buyers can check out." : "Connect a separate MusicBat Stripe Express account to receive 85% of the song price. Buyer processing fees are charged separately."}</p>
                    <Button type="button" disabled={artistLoading || connectBusy || Boolean(connectStatus?.ready)} onClick={() => void connectStripe()} className="mt-3 h-10 rounded-full border border-[#ff3ea5]/50 bg-[#ff3ea5]/15 px-4 text-white hover:bg-[#ff3ea5]/25">{connectBusy ? "Opening Stripe…" : connectStatus?.ready ? "Stripe connected" : connectStatus?.connected ? "Finish Stripe setup" : canManage ? "Connect Stripe payouts" : "Create artist identity & connect payouts"}</Button>
                    {connectError&&<p role="alert" className="mt-3 text-sm text-[#ff69bd]">{connectError}</p>}
                    {connectSignIn&&<a href="/signin-with-chatgpt?return_to=%2F" className="mt-2 inline-block underline">Sign in to connect artist payouts</a>}
                  </div>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Track title</span><Input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white placeholder:text-white/25" placeholder="Track title" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Artist or band name</span><Input value={artistName} onChange={(event) => setArtistName(event.target.value)} required maxLength={80} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white placeholder:text-white/25" placeholder="Artist or band name" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Primary genre</span><select value={uploadGenre} onChange={(event) => setUploadGenre(event.target.value)} required className="h-12 w-full rounded-xl border border-white/12 bg-[#17141d] px-4 text-white"><option value="">Choose a genre</option>{primaryGenres.map((genre) => <option key={genre}>{genre}</option>)}</select></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Subgenre (optional)</span><Input value={uploadSubgenre} onChange={(event) => setUploadSubgenre(event.target.value)} maxLength={80} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white" placeholder="e.g. post-punk" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Style (requires subgenre)</span><Input value={uploadStyle} onChange={(event) => setUploadStyle(event.target.value)} maxLength={80} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Mood / feel tags (optional, comma separated)</span><Input value={uploadMoodTags} onChange={(event) => setUploadMoodTags(event.target.value)} maxLength={240} className="h-12 rounded-xl border-white/12 bg-white/[0.045] px-4 text-white" placeholder="urgent, hazy, defiant" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-white/65">Radio energy lane</span><select value={uploadEnergyLane} onChange={(event) => setUploadEnergyLane(event.target.value as EnergyLane)} className="h-12 w-full rounded-xl border border-white/12 bg-[#17141d] px-4 text-white">{energyLanes.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}</select></label>
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
                  <details><summary className="cursor-pointer text-sm">Album and identifiers (optional)</summary><p className="text-xs text-white/60">No identifier is required. Add or correct credits later in Manage Songs.</p>{['album','isrc','iswc'].map(key=><label key={key} className="block text-sm">{key==='album'?'Album':key.toUpperCase()}<input name={key} maxLength={key==='album'?200:30} className="block w-full rounded border border-white/20 bg-black/30 p-2" /></label>)}</details>
                  <Button disabled={busy || !rightsAttested || !audioFile || !uploadGenre || (sellTrack && !saleRightsAttested)} type="submit" className="h-12 w-full rounded-xl bg-[#ff3ea5] text-base font-black text-white hover:bg-[#ff69bd]">{busy ? "Uploading your track…" : "Upload music"}</Button>
                  {uploadError && <p role="alert" className="text-sm text-[#ff9dcc]">{uploadError}{signInRequired && <> <a className="font-bold underline" href="/signin-with-chatgpt?return_to=%2F">Sign in to upload</a></>}</p>}
                </div>
              </form>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-white/42">Music catalog</div><h2 className="mt-2 text-2xl font-black">{tracks.length} active track{tracks.length === 1 ? "" : "s"}</h2></div><ShieldCheck className="size-7 text-[#ff69bd]" /></div>
                <div className="space-y-3">{tracks.map((track) => <div key={track.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { openRadio(); setTab("radio"); }} className="flex min-w-0 flex-1 basis-[220px] items-center justify-between gap-4 rounded-xl bg-white/[0.025] p-3 text-left transition hover:bg-[#ff3ea5]/5"><div className="min-w-0"><div className="truncate font-bold">{track.title}</div><div className="truncate text-sm text-white/42">{track.artist_name}{track.sale_enabled && track.sale_price_cents ? ` · $${(track.sale_price_cents / 100).toFixed(2)}` : ""}</div></div><div className="shrink-0 text-xs font-black uppercase tracking-wider text-[#ff69bd]">Open Radio</div></button>
                  </div>
                  {Boolean(track.can_manage) && <div className="mt-2 rounded-lg border border-white/8 bg-black/15 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-28 flex-1"><span className="mb-1 block text-xs font-bold text-white/50">Primary genre</span><select value={track.primary_genre} disabled={busy} onChange={(event) => void savePrimaryGenre(track, event.target.value)} className="h-10 w-full rounded-lg border border-white/12 bg-[#17141d] px-3 text-sm text-white">{primaryGenres.map((genre) => <option key={genre}>{genre}</option>)}</select></label>
                      <label className="min-w-28 flex-1"><span className="mb-1 block text-xs font-bold text-white/50">Energy lane</span><select value={track.energy_lane} disabled={busy} onChange={(event) => void saveEnergyLane(track, event.target.value as EnergyLane)} className="h-10 w-full rounded-lg border border-white/12 bg-[#17141d] px-3 text-sm text-white">{energyLanes.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}</select></label>
                      <label className="min-w-28 flex-1"><span className="mb-1 block text-xs font-bold text-white/50">Sale price USD</span><Input type="number" inputMode="decimal" min="0.50" max="1000" step="0.01" value={saleDrafts[track.id] ?? "1.00"} onChange={(event) => setSaleDrafts((drafts) => ({ ...drafts, [track.id]: event.target.value }))} className="h-10 rounded-lg border-white/12 bg-white/[0.045] text-white" /></label>
                      <Button type="button" disabled={busy || !saleConsents[track.id]} onClick={() => void saveSale(track, true)} className="h-10 rounded-full bg-[#ff3ea5] px-4 text-white hover:bg-[#ff69bd]">{track.sale_enabled ? "Update sale" : "Enable sale"}</Button>
                      {Boolean(track.sale_enabled) && <Button type="button" disabled={busy} onClick={() => void saveSale(track, false)} className="h-10 rounded-full border border-white/15 bg-white/[0.045] px-4 text-white hover:bg-white/10">Stop sales</Button>}
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-2"><Checkbox checked={Boolean(saleConsents[track.id])} onCheckedChange={(value) => setSaleConsents((consents) => ({ ...consents, [track.id]: value === true }))} className="mt-0.5 border-white/25 data-[state=checked]:border-[#ff3ea5] data-[state=checked]:bg-[#ff3ea5]" /><span className="text-xs leading-relaxed text-white/50">I authorize MusicBat to sell and deliver this recording. Artist receives 85% of the song price; MusicBat retains 15%. Buyer processing charge is displayed separately before checkout.</span></label>
                    <div className="mt-2 text-xs text-white/40">{track.sale_enabled ? (track.seller_ready ? "Payout setup ready; checkout follows the configured payment mode." : "Sale saved; finish Stripe payout setup before checkout can open.") : "Not currently for sale."}</div>
                  </div>}
                </div>)}</div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="rotunda">{canManage && <ArtistRotunda onChange={refresh} onUpload={()=>setTab("catalog")} />}</TabsContent>

          <TabsContent value="shock">
            {canManage && <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111018]">
              <div className="border-b border-white/10 p-6 sm:p-8"><div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff69bd]">Shock Room</div><h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Listening is exposure. Choice is signal.</h1><p className="mt-2 max-w-3xl text-sm text-white/48">Catalog genre and energy set the eligible category. Rotation creates exposure. Listener choices set position. Score = ▲ − ▼ + 2×Keeps + Completions + 2×Repeat listens + 3×Purchases. Plays alone add no points.</p></div>
              {shockRows.length ? <div>{shockRows.map((row) => <div key={row.track_id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/8 px-5 py-4 last:border-0 sm:px-8"><div className="text-2xl font-black text-[#ff69bd]">#{row.position}</div><div className="min-w-0"><div className="truncate font-black">{row.title}</div><div className="truncate text-xs text-white/45">{row.artist_name} · {row.primary_genre} / {energyCategory(row.energy_lane)}</div><div className="mt-1 text-xs text-white/50">▲ {row.up_count} · ▼ {row.down_count} · Keeps {row.keep_count}</div></div><div className="text-right"><div className="text-xl font-black">{row.shock_score}</div><div className="text-[0.65rem] uppercase tracking-wider text-white/35">Shock Score</div></div></div>)}</div> : <div className="p-8 text-sm text-white/50">No eligible tracks are classified yet.</div>}
            </section>}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
