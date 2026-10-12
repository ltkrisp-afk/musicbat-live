"use client";

import { useState } from 'react';
import { backDial, dialChoices, exploreDial, rotateDial, type DialState } from '../lib/radio-dial';
import type { Category } from '../lib/radio-category';
import type { ChannelOption, ChannelSnapshot } from '../lib/shared-radio-engine';

/** Server-connected presentation contract. The parent supplies server snapshots and a category-only
 * tune operation. This component never chooses tracks, rewinds media or resets a ledger. */
export function RetrofuturaRadio({options,snapshot,onTune}: {
 options: ChannelOption[]; snapshot: ChannelSnapshot | null;
 onTune: (category: Category | null) => Promise<void>;
}) {
 const [dial,setDial]=useState<DialState>({parent:null,index:0});
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState('Turn to browse. Push to tune and explore.');
 const choices=dialChoices(options,dial);
 const selected=choices[dial.index%Math.max(choices.length,1)];
 const category=selected?.category ?? dial.parent;
 const turn=(amount:number)=>setDial(s=>rotateDial(s,amount,choices.length));
 async function tune(c:Category|null,explore:boolean) {
  if (pending) return;
  setPending(true);
  try {await onTune(c);if(explore&&c&&!c.style)setDial(exploreDial(c));setMessage(c?'Shared channel tuned.':'Continuous discovery tuned.');}
  catch(error) {setMessage(error instanceof Error?error.message:'The channel is quiet. Try again.');}
  finally {setPending(false);}
 }
 const performance=snapshot?.performance;
 const fraction=performance?performance.offsetMs/(performance.endsAt-performance.startedAt):0;
 return <section aria-label="Bat Radio Retrofutura console" style={{
  background:'repeating-linear-gradient(2deg,#21150f 0px,#21150f 3px,#35241a 5px,#1a110d 9px)',
  padding:18,borderRadius:18,boxShadow:'0 12px 40px #0008',color:'#eee',maxWidth:820}}>
  <div style={{background:'linear-gradient(120deg,#6d6f70,#babcb9 40%,#7b7f80)',padding:24,borderRadius:8,border:'1px solid #d6d7d4'}}>
   <header style={{display:'flex',justifyContent:'space-between',color:'#181a19',marginBottom:20}}>
    <span style={{fontSize:22,letterSpacing:4,fontWeight:300}}>MUSICBAT</span>
    <span style={{color:'#ff3ea5',background:'#171a19',padding:'5px 12px',letterSpacing:2}}>BAT RADIO</span>
   </header>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
    {(['Genre','Subgenre','Style'] as const).map((label,i)=><div key={label} style={{
     background:'linear-gradient(#101714,#242b28)',boxShadow:'inset 0 2px 8px #000',border:'3px solid #555b57',padding:12,minHeight:84}}>
     <div style={{fontSize:10,letterSpacing:2,color:'#959d95'}}>{label.toUpperCase()}</div>
     <div style={{marginTop:10,color:'#b6ff32',overflowWrap:'anywhere',fontSize:16}}>{
      category?.[(['genre','subgenre','style'] as const)[i]] ?? '—'}</div>
    </div>)}
   </div>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-around',flexWrap:'wrap',gap:24,marginTop:24}}>
    <div style={{background:'#111a15',padding:16,borderRadius:4,minWidth:170,border:'3px solid #555b57'}}>
     <div style={{color:'#a7b3a4',fontSize:10,letterSpacing:2}}>CHANNEL POSITION</div>
     <progress aria-label="Shared channel position" value={Math.min(1,Math.max(0,fraction))} max={1}
      style={{width:'100%',accentColor:'#b6ff32',marginTop:14}} />
     <div style={{color:'#ff3ea5',fontSize:12,marginTop:12}}>{snapshot?.status==='playing'?'SHARED SIGNAL':'STATION QUIET'}</div>
     <div style={{color:'#a7b3a4',fontSize:11,marginTop:8}}>Turn to hear. Push to explore.</div>
    </div>
    <div style={{textAlign:'center',color:'#17201c'}}>
     <div style={{display:'flex',alignItems:'center',gap:12}}>
      <button type="button" aria-label="Turn dial backward" disabled={pending||!choices.length} onClick={()=>turn(-1)}>−</button>
      <button type="button" aria-label="Push dial to tune category" disabled={pending||!selected||selected.dormant||selected.locked}
       onClick={()=>void tune(selected!.category,true)} onWheel={e=>{e.preventDefault();if(!pending)turn(e.deltaY>0?1:-1)}}
       onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();turn(1)}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();turn(-1)}}}
       style={{width:112,height:112,borderRadius:'50%',border:'5px solid #4b514f',
        background:'conic-gradient(#ddd,#777,#eee,#929695,#ddd)',boxShadow:'0 5px 8px #0006,inset 0 0 0 6px #a2a6a3',cursor:'pointer',color:'#171b19'}}>
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
    <span style={{fontSize:12,alignSelf:'center'}}>Radio Plus · optional $3/month</span>
   </div>
   <p role="status" style={{color:'#17201c',fontSize:12,marginBottom:0}}>{message}</p>
  </div>
 </section>;
}
