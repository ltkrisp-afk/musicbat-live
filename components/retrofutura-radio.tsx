"use client";

import { useRef, useState,type ReactNode } from 'react';
import { RadioPlusMembership } from './radio-plus-membership';
import { backDial, dialChoices, exploreDial, rotateDial, type DialState } from '../lib/radio-dial';
import type { Category } from '../lib/radio-category';
import type { ChannelOption, ChannelSnapshot } from '../lib/shared-radio-engine';

/** Server-connected presentation contract. The parent supplies server snapshots and a category-only
 * tune operation. This component never chooses tracks, rewinds media or resets a ledger. */
export function RetrofuturaRadio({options,snapshot,onTune,playback}: {
 playback?:ReactNode;
 options: ChannelOption[]; snapshot: ChannelSnapshot | null;
 onTune: (category: Category | null) => Promise<void>;
}) {
 const [dial,setDial]=useState<DialState>({parent:null,index:0});
 const touchStartY=useRef<number|null>(null);
 const suppressTouchClick=useRef(false);
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState('Turn to browse. Push to tune and explore.');
 const choices=dialChoices(options,dial);
 const selected=choices[dial.index%Math.max(choices.length,1)];
 const category=selected?.category ?? dial.parent;
 const turn=(amount:number)=>setDial(s=>rotateDial(s,amount,dialChoices(options,s).length));
 const finishTouch=(endY:number)=>{
  if(touchStartY.current===null)return;
  const distance=touchStartY.current-endY;
  touchStartY.current=null;
  if(Math.abs(distance)<24)return;
  suppressTouchClick.current=true;
  turn(distance>0?1:-1);
 };
 async function tune(c:Category|null,explore:boolean) {
  if (pending) return;
  setPending(true);
  try {await onTune(c);if(explore&&c&&!c.style)setDial(exploreDial(c));if(!c)setDial({parent:null,index:0});setMessage(c?'Shared channel tuned.':'Continuous discovery tuned.');}
  catch(error) {setMessage(error instanceof Error?error.message:'The channel is quiet. Try again.');}
  finally {setPending(false);}
 }
 const performance=snapshot?.performance;
 const fraction=performance?performance.offsetMs/(performance.endsAt-performance.startedAt):0;
 return <section aria-label="Bat Radio Retrofutura console" style={{
  background:'repeating-linear-gradient(2deg,#21150f 0px,#21150f 3px,#35241a 5px,#1a110d 9px)',
  padding:'clamp(8px, 2.5vw, 18px)',width:'100%',boxSizing:'border-box',minWidth:0,borderRadius:18,boxShadow:'0 12px 40px #0008',color:'#eee',maxWidth:820}}>
  <div style={{background:'linear-gradient(120deg,#6d6f70,#babcb9 40%,#7b7f80)',padding:'clamp(10px, 3vw, 24px)',minWidth:0,boxSizing:'border-box',borderRadius:8,border:'1px solid #d6d7d4'}}>
   <header style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8,color:'#181a19',marginBottom:20}}>
    <span style={{fontSize:'clamp(15px, 4vw, 22px)',letterSpacing:'clamp(1px, 0.7vw, 4px)',fontWeight:300}}>MUSICBAT</span>
    <span style={{color:'#ff3ea5',background:'#171a19',padding:'5px 12px',letterSpacing:2}}>BAT RADIO</span>
   </header>
    <div style={{background:'#111a15',padding:12,borderRadius:4,minWidth:0,width:'min(100%, 220px)',boxSizing:'border-box',border:'3px solid #555b57'}}>
     <div style={{color:'#a7b3a4',fontSize:10,letterSpacing:2}}>CHANNEL POSITION</div>
     <progress aria-label="Shared channel position" value={Math.min(1,Math.max(0,fraction))} max={1}
      style={{width:'100%',accentColor:'#b6ff32',marginTop:14}} />
     <div style={{color:'#ff3ea5',fontSize:12,marginTop:12}}>{snapshot?.status==='playing'?'SHARED SIGNAL':'STATION QUIET'}</div>
     <div style={{color:'#a7b3a4',fontSize:11,marginTop:8}}>Turn to hear. Push to explore.</div>
    </div>
   {playback}
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'clamp(3px, 1vw, 8px)'}}>
    {(['Genre','Subgenre','Style'] as const).map((label,i)=><div key={label} style={{
     background:'linear-gradient(#101714,#242b28)',boxShadow:'inset 0 2px 8px #000',border:'3px solid #555b57',padding:'clamp(3px, 1.5vw, 12px)',minWidth:0,minHeight:84,boxSizing:'border-box'}}>
     <div style={{fontSize:'clamp(8px, 2vw, 10px)',letterSpacing:'clamp(0px, 0.4vw, 2px)',color:'#959d95'}}>{label.toUpperCase()}</div>
     <div style={{marginTop:10,color:'#b6ff32',overflowWrap:'anywhere',fontSize:'clamp(11px, 3vw, 16px)'}}>{
      category?.[(['genre','subgenre','style'] as const)[i]] ?? '—'}</div>
    </div>)}
   </div>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-around',flexWrap:'wrap',gap:16,marginTop:24,minWidth:0}}>
    <div style={{textAlign:'center',color:'#17201c'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'clamp(4px, 2vw, 12px)'}}>
      <button type="button" aria-label="Turn dial backward" disabled={pending||!choices.length} onClick={()=>turn(-1)}>−</button>
      <button type="button" aria-label="Push dial to tune category" disabled={pending||!selected||selected.dormant||selected.locked}
       onClick={e=>{if(e.detail!==0&&suppressTouchClick.current){suppressTouchClick.current=false;return;}suppressTouchClick.current=false;void tune(selected!.category,true);}} onTouchStart={e=>{suppressTouchClick.current=false;touchStartY.current=e.touches[0]?.clientY??null;}} onTouchEnd={e=>finishTouch(e.changedTouches[0]?.clientY??0)} onTouchCancel={()=>{touchStartY.current=null;suppressTouchClick.current=false;}} onWheel={e=>{e.preventDefault();if(!pending)turn(e.deltaY>0?1:-1)}}
       onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();turn(1)}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();turn(-1)}}}
       style={{width:'clamp(88px, 28vw, 112px)',height:'clamp(88px, 28vw, 112px)',flexShrink:0,borderRadius:'50%',border:'5px solid #4b514f',
        background:'conic-gradient(#ddd,#777,#eee,#929695,#ddd)',boxShadow:'0 5px 8px #0006,inset 0 0 0 6px #a2a6a3',cursor:'pointer',touchAction:'pan-x',color:'#171b19'}}>
       <span style={{display:'block',color:'#ff3ea5',fontSize:27}}>│</span><span style={{fontSize:10,letterSpacing:1}}>PUSH</span>
      </button>
      <button type="button" aria-label="Turn dial forward" disabled={pending||!choices.length} onClick={()=>turn(1)}>+</button>
     </div>
     <div aria-live="polite" style={{fontSize:11,marginTop:12}}>{selected?.locked?'Radio Plus required':selected?.dormant?'Awaiting eligible artists':!choices.length?'No deeper categories':'Turn · Push · Explore'}</div>
    </div>
   </div>
   <div style={{display:'flex',gap:12,marginTop:20,flexWrap:'wrap',color:'#17201c'}}>
    <button type="button" onClick={()=>setDial(backDial(dial))} disabled={pending||!dial.parent}>Back one level</button>
    <button type="button" onClick={()=>void tune(null,false)} disabled={pending||!options.some(o=>o.category===null&&!o.dormant)}>Free Radio · continuous discovery</button>
    <RadioPlusMembership />
   </div>
   <p role="status" style={{color:'#17201c',fontSize:12,marginBottom:0}}>{message}</p>

  </div>
 </section>;
}
