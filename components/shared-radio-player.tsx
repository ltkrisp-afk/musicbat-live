"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { RetrofuturaRadio } from './retrofutura-radio';
import type { Category } from '../lib/radio-category';
import type { ChannelOption, ChannelSnapshot } from '../lib/shared-radio-engine';
import { createRadioRequestQueue } from '../lib/radio-request-queue';
type Delivery = {snapshot:ChannelSnapshot;navigation:ChannelOption[];mediaUrl:string|null};
export type RadioConsoleState={options:ChannelOption[];snapshot:ChannelSnapshot|null;onTune:(category:Category|null)=>Promise<void>};

/** No local track selection. Silence and failed authority immediately unload audio. */
export function SharedRadioPlayer({onTrack,onError,onPlay,onProgress,onEnded,onInteractive,hideTuning=false,onConsole}:{hideTuning?:boolean;onConsole?:(state:RadioConsoleState)=>void;onInteractive?:(enabled:boolean)=>void;onTrack:(id:string|null,key:string)=>void;onError:(message:string)=>void;onPlay:()=>void;onProgress:(seconds:number)=>void;onEnded:()=>void}) {
  const audio=useRef<HTMLAudioElement>(null), generation=useRef(0), wanted=useRef(false);
  const requests=useRef(createRadioRequestQueue());
  const authority=useRef<{delivery:Delivery;received:number}|null>(null);
  const callbacks=useRef({onTrack,onError,onPlay,onProgress,onEnded,onInteractive});
  useEffect(()=>{callbacks.current={onTrack,onError,onPlay,onProgress,onEnded,onInteractive}},[onTrack,onError,onPlay,onProgress,onEnded,onInteractive]);
  const [delivery,setDelivery]=useState<Delivery|null>(null);
  const [playing,setPlaying]=useState(false);
  const [muted,setMuted]=useState(false);
  const [busy,setBusy]=useState(false);
  const heard=useRef({key:"",seconds:0,last:0});
  const silence=useCallback(()=>{
    authority.current=null;setDelivery(null);callbacks.current.onTrack(null,"");callbacks.current.onInteractive?.(false);
    const a=audio.current;if(a){a.pause();a.removeAttribute('src');a.load()}
  },[]);
  const synchronize=useCallback(()=>{
    const a=audio.current,v=authority.current;
    if(!a || !v || !v.delivery.snapshot.performance) return;
    const p=v.delivery.snapshot.performance;
    const elapsed=performance.now()-v.received;
    const offset=(p.offsetMs+elapsed)/1000;
    // Network failure/hidden tab cannot extend the last authority indefinitely.
    if(elapsed>3000 || v.delivery.snapshot.serverNow+elapsed>=p.endsAt){silence();return}
    if(a.readyState>=1 && Math.abs(a.currentTime-offset)>0.35)a.currentTime=offset;
  },[silence]);
  const update=useCallback(async(category?:Category|null)=>{
    if(document.visibilityState==='hidden'){if(category!==undefined)throw new Error('Return to this tab to tune Radio.');return;}
    return requests.current.run(category!==undefined,async()=>{
    if(category!==undefined)setBusy(true);
    const version=++generation.current;
    const began=performance.now();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),2000);
    if(category!==undefined)silence();
    try {
      const r=await fetch('/api/musicbat/channel',{cache:'no-store',signal:controller.signal,...(category===undefined?{}:
        {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({category})})});
      if(!r.ok){const error=await r.json().catch(()=>null) as {error?:string}|null;throw new Error(error?.error ?? 'Shared Radio is temporarily unavailable.');}
      const d:Delivery=await r.json();
      if(version!==generation.current)return;
      if(d.snapshot.simulation || !Number.isSafeInteger(d.snapshot.serverNow))throw new Error('Playback authority unavailable.');
      setDelivery(d);callbacks.current.onInteractive?.(d.snapshot.category!==null);
      if(d.snapshot.status!=='playing' || !d.snapshot.performance || !d.mediaUrl){silence();setDelivery(d);return}
      if(!/^\/api\/musicbat\/channel\/audio\?/.test(d.mediaUrl))throw new Error('Invalid media authority.');
      const a=audio.current;
      authority.current={delivery:d,received:performance.now()-(performance.now()-began)/2};
      callbacks.current.onTrack(d.snapshot.performance.trackId,`${d.snapshot.channelId}:${d.snapshot.performance.authorityId}`);
      if(a && a.getAttribute('src')!==d.mediaUrl){heard.current={key:d.mediaUrl,seconds:0,last:0};a.src=d.mediaUrl;a.load()}
      synchronize();
      if(a && wanted.current && a.paused)void a.play().catch(()=>callbacks.current.onError('Press Play to resume Radio.'));
    }catch(e){if(version===generation.current){silence();callbacks.current.onError(e instanceof Error?e.message:'Radio unavailable.')}if(category!==undefined)throw e;}finally{clearTimeout(timeout);if(category!==undefined)setBusy(false)}
    });
  },[silence,synchronize]);
  useEffect(()=>{
    // Resume persisted channel; a missing session requires explicit Free Radio tuning.
    const initial=setTimeout(()=>void update(),0);
    const element=audio.current, versions=generation;
    const poll=setInterval(()=>void update(),1000), guard=setInterval(synchronize,100);
    const resume=()=>{if(document.visibilityState==='visible')void update();else{++generation.current;silence()}};
    document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
    return()=>{++versions.current;clearTimeout(initial);clearInterval(poll);clearInterval(guard);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);element?.pause()};
  },[update,synchronize,silence]);
  const category=delivery?.snapshot.category;
  useEffect(()=>{onConsole?.({options:delivery?.navigation??[],snapshot:delivery?.snapshot??null,onTune:async category=>{await update(category);}});},[delivery,update,onConsole]);
  const options=delivery?.navigation ?? [];
  function choose(depth:'genre'|'subgenre'|'style',value:string){
    if(!value){void update(depth==='genre'?null:depth==='subgenre'?{genre:category!.genre}:{genre:category!.genre,subgenre:category!.subgenre}).catch(()=>undefined);return}
    const next:Category={genre:depth==='genre'?value:category!.genre};
    if(depth!=='genre')next.subgenre=depth==='subgenre'?value:category!.subgenre;
    if(depth==='style')next.style=value;
    void update(next).catch(()=>undefined);
  }
  return <div className={hideTuning?undefined:"mb-6 space-y-3"}>
    {!hideTuning&&<>
    <RetrofuturaRadio options={options} snapshot={delivery?.snapshot ?? null} onTune={update} />
    <div aria-label="Radio category controls" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16}}>
    <button type="button" disabled={busy} onClick={()=>void update(null).catch(()=>undefined)}>Free Radio</button>
    {(['genre','subgenre','style'] as const).map(depth=>{
      if(depth==='subgenre'&&!category?.genre || depth==='style'&&!category?.subgenre)return null;
      const choices=options.filter(o=>o.category && (depth==='genre'? !o.category.subgenre :
        depth==='subgenre'?o.category.genre===category?.genre && !!o.category.subgenre && !o.category.style:
        o.category.genre===category?.genre && o.category.subgenre===category?.subgenre && !!o.category.style));
      return <label key={depth} style={{display:'flex',alignItems:'center',gap:8}}>{depth} <select disabled={busy} aria-label={`Radio ${depth}`} value={category?.[depth]??''} onChange={e=>choose(depth,e.target.value)}>
        <option value="">{depth==='genre'?'All music':'Broader category'}</option>
        {choices.map(o=><option key={JSON.stringify(o.category)} value={o.category![depth]} disabled={o.locked||o.dormant}>{o.category![depth]}{o.locked?' · Radio Plus':o.dormant?' · Quiet':''}</option>)}
      </select></label>
    })}
    </div>
    </>}
    <audio ref={audio} preload="none" controlsList="nodownload noremoteplayback" onLoadedMetadata={synchronize}
      onPlay={()=>{setPlaying(true);heard.current.last=performance.now();callbacks.current.onPlay()}} onPause={()=>{setPlaying(false);heard.current.last=0}} onTimeUpdate={()=>{
        synchronize();const a=audio.current,now=performance.now();
        if(a&&!a.paused&&authority.current){if(heard.current.last)heard.current.seconds+=Math.min(1,(now-heard.current.last)/1000);heard.current.last=now;callbacks.current.onPlay();callbacks.current.onProgress(heard.current.seconds)}
      }}
      onEnded={()=>{callbacks.current.onEnded();void update()}} onError={()=>{silence();callbacks.current.onError('Audio unavailable. Radio will reconnect.')}} />
    <div aria-label="Radio playback controls" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:24,padding:'12px 0'}}>
    <button type="button" disabled={!delivery?.mediaUrl} aria-label={playing?'Pause Radio':'Play Radio'} style={{minWidth:96,minHeight:44,padding:'10px 20px',border:'1px solid #ff3ea5',borderRadius:24,background:'#ff3ea522',color:'#fff',flexShrink:0,cursor:'pointer'}} onClick={()=>{
      wanted.current=!playing;
      if(playing)audio.current?.pause();else{
        synchronize();
        // Start existing authorized media in the click gesture. Waiting for a
        // channel fetch can lose browser playback permission (notably Firefox).
        const element=audio.current;
        if(element?.getAttribute('src'))void element.play().catch(()=>{
          wanted.current=false;callbacks.current.onError('Radio could not start. Press Play to try again.');
        });
        void update();
      }
    }}>{playing?'Pause':'Play'}</button>
    <label style={{display:'flex',alignItems:'center',gap:12,minHeight:44,maxWidth:'100%',color:'#eee'}}>
      <span>Volume</span>
      <input aria-label="Volume" style={{width:180,maxWidth:'100%',minWidth:0,accentColor:'#ff3ea5'}} type="range" min="0" max="1" step="0.05" defaultValue="1" onChange={e=>{if(audio.current)audio.current.volume=Number(e.target.value)}} />
    </label>
    <button type="button" aria-label={muted?'Unmute Radio':'Mute Radio'} aria-pressed={muted} style={{minHeight:44,padding:'10px 16px',border:'1px solid #ffffff33',borderRadius:24,color:'#eee'}} onClick={()=>{const next=!muted;setMuted(next);if(audio.current)audio.current.muted=next;}}>{muted?'Unmute':'Mute'}</button>
    </div>
    {!delivery?.mediaUrl&&<p role="status">{delivery?.snapshot.reason==='category-dormant'
      ? 'This station has no eligible music right now. Choose an available genre or Free Radio.'
      : delivery?.snapshot.status==='silent' ? 'No eligible recording is available on this station right now.'
      : 'Connecting to Radio. Playback waits for an authorized station.'}</p>}
  </div>;
}
