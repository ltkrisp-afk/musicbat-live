"use client";

import { useRef,useState,type ReactNode,type CSSProperties } from 'react';
import { RadioPlusMembership } from './radio-plus-membership';
import { backDial, dialChoices, exploreDial, rotateDial, type DialState } from '../lib/radio-dial';
import type { Category } from '../lib/radio-category';
import type { ChannelOption, ChannelSnapshot } from '../lib/shared-radio-engine';
import {AnalogMeter} from './analog-meter';

/** Presentation only: tuning remains category-only and audio stays in its root provider. */
export function RetrofuturaRadio({options,snapshot,onTune,playback,outputSetting}: {
 outputSetting?:{volume:number;muted:boolean};playback?:ReactNode;options:ChannelOption[];snapshot:ChannelSnapshot|null;
 onTune:(category:Category|null)=>Promise<void>;
}) {
 const [dial,setDial]=useState<DialState>({parent:null,index:0});
 const [pending,setPending]=useState(false),busy=useRef(false);
 const [message,setMessage]=useState('Turn to hear. Push to explore.');
 const choices=dialChoices(options,dial),selected=choices[dial.index%Math.max(choices.length,1)],category=selected?.category??dial.parent;
 function choose(index:number){if(busy.current)return;setDial({...dial,index});const option=choices[index];if(!option)return;if(option.locked){setMessage('Radio Plus required.');return;}if(option.dormant){setMessage('Awaiting eligible artists.');return;}void tune(option.category,false);}
 const turn=(amount:number)=>choose(rotateDial(dial,amount,choices.length).index);
 async function tune(c:Category|null,explore:boolean){if(busy.current)return;busy.current=true;setPending(true);setMessage(c?`Tuning ${c.style??c.subgenre??c.genre}…`:'Tuning continuous discovery…');try{await onTune(c);if(explore&&c&&!c.style)setDial(exploreDial(c));setMessage(c?'Shared channel tuned.':'Continuous discovery tuned.');}catch(error){setMessage(error instanceof Error?error.message:'The channel is quiet. Try again.');}finally{busy.current=false;setPending(false);}}
 const performance=snapshot?.performance;
 const fraction=performance?Math.min(1,Math.max(0,performance.offsetMs/(performance.endsAt-performance.startedAt))):0;
 const needle=choices.length?8+(dial.index%choices.length)/Math.max(1,choices.length-1)*84:50;
 return <section aria-label="Bat Radio Retrofutura console" className="mb-receiver" style={{'--mb-accent':'#ff3ea5','--mb-signal':'#b6ff32'} as CSSProperties}>
  <div className="mb-receiver-lip" aria-hidden="true" />
  <div className="mb-receiver-face">
   <span className="mb-screw mb-screw-tl" aria-hidden="true"/><span className="mb-screw mb-screw-tr" aria-hidden="true"/>
   <header className="mb-brand-row"><div><div className="mb-wordmark">MusicBat<span className="mb-brand-star" aria-hidden="true">✦</span></div><p>A DISCOVERY OF SOUND</p></div><div className="mb-model">INDEPENDENT SOUND SYSTEM<br/><b>STEREO RECEIVER · MB–76</b></div></header>
   <div className="mb-tuner-glass">
    <div className="mb-status-instruments">{outputSetting?<><AnalogMeter label="OUTPUT SETTING" value={outputSetting.muted?0:outputSetting.volume}/><span className="mb-instrument-note">Volume control position after mute · not an audio measurement</span></>:<span className="mb-instrument-note">Audio measurements unavailable</span>}</div>
    <div className="mb-frequency-section"><div className="mb-scale-label"><span>BAT RADIO</span><span className="mb-live-lamp" data-active={snapshot?.status==='playing'}>{snapshot?.status==='playing'?'SHARED SIGNAL':'STANDBY'}</span></div>
     <div className="mb-frequency-scale mb-category-scale"><div className="mb-category-choices" aria-label="Available discovery categories">{choices.map((option,index)=><button type="button" key={JSON.stringify(option.category)} disabled={pending||option.locked||option.dormant} aria-pressed={index===dial.index} onClick={()=>choose(index)}>{option.category?.style??option.category?.subgenre??option.category?.genre}</button>)}</div><div className="mb-scale-ticks" aria-hidden="true"/><span aria-hidden="true" className="mb-tuning-needle" style={{left:needle+'%'}}/>{!choices.length&&<p>No deeper categories</p>}</div>
     <div className="mb-shared-position"><span>LISTENING PROGRESS</span><progress aria-label="Shared channel position" value={fraction} max={1}/></div>
    </div>
    <div className="mb-tuning-unit"><span className="mb-engraved-label">CATEGORY TUNING</span><div className="mb-knob-housing"><button type="button" className="mb-machined-knob mb-main-dial" aria-label="Push dial to tune category" disabled={pending||!selected||selected.dormant||selected.locked} onClick={()=>void tune(selected!.category,true)} onWheel={e=>{if(!pending)turn(e.deltaY>0?1:-1)}} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();turn(1);}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();turn(-1);}}} style={{'--knob-angle':`${-120+(needle/100)*240}deg`} as CSSProperties}><span className="mb-knob-indicator"/><span className="mb-knob-push">PUSH</span></button></div><div className="mb-turn-buttons"><button type="button" aria-label="Turn dial backward" disabled={pending||!choices.length} onClick={()=>turn(-1)}>−</button><span>TURN / PUSH</span><button type="button" aria-label="Turn dial forward" disabled={pending||!choices.length} onClick={()=>turn(1)}>+</button></div></div>
   </div>
   <div className="mb-playback-strip">{playback}</div>
   <div className="mb-category-windows">{(['Genre','Subgenre','Style'] as const).map((label,i)=><div className="mb-category-window" key={label}><span>{label.toUpperCase()}</span><strong>{category?.[(['genre','subgenre','style'] as const)[i]]??'—'}</strong></div>)}</div>
   <div className="mb-source-controls"><button type="button" onClick={()=>setDial(backDial(dial))} disabled={pending||!dial.parent}>Back one level</button><button type="button" onClick={()=>void tune(null,false)} disabled={pending||!options.some(o=>o.category===null&&!o.dormant)}>Free Radio · continuous discovery</button><RadioPlusMembership/></div>
   <div className="mb-console-footer"><p role="status">{message}</p><span>{selected?.locked?'Radio Plus required':selected?.dormant?'Awaiting eligible artists':!choices.length?'No deeper categories':'Turn · Push · Explore'}</span></div>
   <p className="mb-meter-explanation">Output instrument shows the volume control setting. Bass/treble signal analysis is not connected.</p>
   <span className="mb-screw mb-screw-bl" aria-hidden="true"/><span className="mb-screw mb-screw-br" aria-hidden="true"/>
  </div>
  <div className="mb-receiver-foot mb-foot-left" aria-hidden="true"/><div className="mb-receiver-foot mb-foot-right" aria-hidden="true"/>
 </section>;
}
