"use client";
import {useEffect,useState} from 'react';
const WINDOW_MS=72*60*60*1000;
type Props={state:string;deadline?:number|null;held?:boolean;title:string};

// This bar measures elapsed review time, never percent of audio inspected.
export function ReviewProgress({state,deadline,held,title,now}:{now:number}&Props) {
 if(held)return <p role="status">Review on hold. Radio and new sales remain unavailable.</p>;
 if(state==='FAILED')return <p role="status">Technical checks failed. Radio and new sales remain unavailable.</p>;
 if(state==='VERIFIED')return <p role="status">Technical checks passed. Radio permissions and sale eligibility are checked separately.</p>;
 const timed=Number.isSafeInteger(deadline) && Number(deadline)>0 && now>0;
 const remaining=timed?Math.max(0,Number(deadline)-now):0;
 const minutes=Math.ceil(remaining/60000);
 const elapsed=timed?Math.min(WINDOW_MS,Math.max(0,WINDOW_MS-remaining)):0;
 return <div className="space-y-2 rounded border border-white/20 p-3 text-sm">
  <p role="status">{state==='CLAIMED'?'Checking your audio.':state==='CHECKED'?'Technical checks passed; finalizing.':'Your audio is queued for technical checks.'}</p>
  {timed && <><label className="block">{title} — review window elapsed<progress className="block w-full accent-[#ff3ea5]" aria-label={`${title} review window elapsed`} max={WINDOW_MS} value={elapsed} /></label>
   <p>{remaining>0?`${Math.floor(minutes/60)}h ${minutes%60}m remaining in the review target.`:'Review target reached; checks are still pending.'}</p></>}
  <p className="text-xs text-white/60">Checks can finish sooner. The timer does not approve a recording or establish music rights.</p>
 </div>;
}
export function IngestionProgress(props:Props) {
 const [now,setNow]=useState(0);
 useEffect(()=>{const first=setTimeout(()=>setNow(Date.now()),0);const timer=setInterval(()=>setNow(Date.now()),30000);return()=>{clearTimeout(first);clearInterval(timer)}},[]);
 return <ReviewProgress {...props} now={now} />;
}
