"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {RetrofuturaRadio} from '../../components/retrofutura-radio';
import {RadioPlaybackControls} from '../../components/shared-radio-player';
import type {Category} from '../../lib/radio-category';
import type {ChannelOption,ChannelSnapshot} from '../../lib/shared-radio-engine';
const options:ChannelOption[]=[{category:null,label:'Free Radio',locked:false,dormant:false},...['Rock','Electronic','Jazz','Soul'].map(genre=>({category:{genre},label:genre,locked:false,dormant:false})),{category:{genre:'Rock',subgenre:'Punk'},label:'Punk',locked:false,dormant:false},{category:{genre:'Rock',subgenre:'Punk',style:'Hardcore'},label:'Hardcore',locked:false,dormant:false}] as ChannelOption[];
/** Isolated review route. Audition generates its own quiet calibration signal;
 * it never touches the catalog, processor, rights database or root audio node. */
export default function ReceiverDesignPreview(){
 const context=useRef<AudioContext|null>(null),gain=useRef<GainNode|null>(null);
 const [playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[volume,setVolume]=useState(.25),[category,setCategory]=useState<Category|null>(null),[offset,setOffset]=useState(0),[error,setError]=useState('');
 const level=useRef({volume,muted});useEffect(()=>{level.current={volume,muted};if(gain.current)gain.current.gain.setTargetAtTime(muted?0:volume*.035,context.current!.currentTime,.025);},[volume,muted]);
 useEffect(()=>{if(!playing)return;const task=setInterval(()=>setOffset(o=>(o+1000)%60000),1000);return()=>clearInterval(task);},[playing]);
 useEffect(()=>()=>{void context.current?.close();},[]);
 async function toggle(){
  try{
   if(!context.current){const ctx=new AudioContext();context.current=ctx;const output=ctx.createGain();output.gain.value=level.current.muted?0:level.current.volume*.035;output.connect(ctx.destination);gain.current=output;for(const hz of [110,164.81,220]){const o=ctx.createOscillator();o.type='sine';o.frequency.value=hz;o.connect(output);o.start();}}
   if(playing){await context.current.suspend();setPlaying(false);}else{await context.current.resume();setPlaying(true);}
  }catch{setError('Calibration audio is unavailable in this browser.');}
 }
 const snapshot={channelId:'design-audition',category,status:playing?'playing':'silent',reason:playing?'preview-signal':'preview-paused',serverNow:offset,simulation:false,performance:playing?{trackId:'generated-calibration',sequence:1,authorityId:'design-only',startedAt:0,endsAt:60000,offsetMs:offset}:null} as ChannelSnapshot;
 return <main className="mb-design-studio">
  <header className="mb-design-nav"><Link href="/" className="mb-design-brand">MusicBat<span>A DISCOVERY OF SOUND</span></Link><span className="mb-design-label">RECEIVER DESIGN AUDITION</span><Link href="/">Back to MusicBat <span aria-hidden="true">↗</span></Link></header>
  <div className="mb-design-intro"><p>INDEPENDENT MUSIC. ANALOG SOUL.</p><h1>Let the music <br/><em>do the talking.</em></h1><span>Walnut. Warm light. Your next discovery.</span></div>
  <div className="mb-studio-console"><RetrofuturaRadio options={options} snapshot={snapshot} onTune={async next=>{setCategory(next);}} playback={<RadioPlaybackControls state={{available:true,playing,muted,volume,message:error||'Design audition · generated calibration signal. Category changes preview the dial; they do not tune a live station.',onToggle:()=>void toggle(),onMute:()=>setMuted(m=>!m),onVolume:setVolume}}/>}/></div>
  <footer className="mb-design-footer"><span><i/> LOCAL DESIGN PREVIEW</span><p>Playback, mute and volume control a generated calibration signal. Tone shaping is not connected. No catalog, account, payment or licensing changes.</p><span>MB–76 / MUSICBAT</span></footer>
 </main>;
}
