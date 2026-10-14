"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {SharedRadioPlayer,type RadioConsoleState} from './shared-radio-player';
import {RetrofuturaRadio} from './retrofutura-radio';
type Callbacks={onError:(message:string)=>void;onPlay:()=>void;onProgress:(seconds:number)=>void;onEnded:()=>void};
const empty:Callbacks={onError:()=>{},onPlay:()=>{},onProgress:()=>{},onEnded:()=>{}};
const initialConsole:RadioConsoleState={options:[],snapshot:null,onTune:async()=>{}};
type Session={trackId:string|null;performanceKey:string;interactive:boolean;console:RadioConsoleState;attach:(callbacks:Callbacks)=>()=>void};
const RadioContext=createContext<Session>({trackId:null,performanceKey:'',interactive:false,console:initialConsole,attach:()=>()=>{}});
/** The root layout owns one audio element. Screens only observe it and attach
 * signal callbacks; replacing a screen never pauses or recreates the player. */
export function PersistentRadioProvider({children}:{children:ReactNode}) {
  const callbacks=useRef(empty);
  const [trackId,setTrackId]=useState<string|null>(null),[performanceKey,setPerformanceKey]=useState(''),[interactive,setInteractive]=useState(false);
  const [consoleState,setConsole]=useState(initialConsole),[error,setError]=useState('');
  const attach=useCallback((next:Callbacks)=>{callbacks.current=next;return()=>{if(callbacks.current===next)callbacks.current=empty;};},[]);
  const onTrack=useCallback((id:string|null,key:string)=>{setTrackId(id);setPerformanceKey(key);},[]);
  const onError=useCallback((message:string)=>{setError(message);callbacks.current.onError(message);},[]);
  const onPlay=useCallback(()=>{setError('');callbacks.current.onPlay();},[]);
  const onProgress=useCallback((seconds:number)=>callbacks.current.onProgress(seconds),[]);
  const onEnded=useCallback(()=>callbacks.current.onEnded(),[]);
  const value=useMemo(()=>({trackId,performanceKey,interactive,console:consoleState,attach}),[trackId,performanceKey,interactive,consoleState,attach]);
  return <RadioContext.Provider value={value}>
    <div style={{paddingBottom:190}}>{children}</div>
    <section aria-label="Persistent MusicBat player" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:40,background:'#111018',borderTop:'1px solid #ff3ea566',padding:'8px 20px',color:'#eee',maxHeight:'35vh',overflowY:'auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}><span>Bat Radio · {consoleState.snapshot?.category?.genre??'Free Radio'}</span><Link href="/?view=radio" onNavigate={()=>window.dispatchEvent(new Event('musicbat:open-radio'))} style={{color:'#ff69bd'}}>Open Radio</Link></div>
      <SharedRadioPlayer hideTuning onConsole={setConsole} onTrack={onTrack} onInteractive={setInteractive} onError={onError} onPlay={onPlay} onProgress={onProgress} onEnded={onEnded} />
      {error&&<p role="status" style={{margin:0,fontSize:12}}>{error}</p>}
    </section>
  </RadioContext.Provider>;
}
export function usePersistentRadio(){return useContext(RadioContext);}
export function useRadioCallbacks(callbacks:Callbacks) {
  const {attach}=usePersistentRadio(),latest=useRef(callbacks);
  useEffect(()=>{latest.current=callbacks;},[callbacks]);
  useEffect(()=>attach({onError:m=>latest.current.onError(m),onPlay:()=>latest.current.onPlay(),onProgress:s=>latest.current.onProgress(s),onEnded:()=>latest.current.onEnded()}),[attach]);
}
export function RadioConsole() {
  const {console:state}=usePersistentRadio();
  const [busy,setBusy]=useState(false),category=state.snapshot?.category;
  async function tune(next:Parameters<RadioConsoleState['onTune']>[0]){setBusy(true);try{await state.onTune(next);}finally{setBusy(false);}}
  function choose(depth:'genre'|'subgenre'|'style',value:string){
    const next=!value?(depth==='genre'?null:depth==='subgenre'?{genre:category!.genre}:{genre:category!.genre,subgenre:category!.subgenre}):
      {genre:depth==='genre'?value:category!.genre,...(depth==='subgenre'?{subgenre:value}:depth==='style'?{subgenre:category!.subgenre,style:value}:{})};
    void tune(next).catch(()=>{});
  }
  return <div className="mb-6 space-y-3">
    <RetrofuturaRadio options={state.options} snapshot={state.snapshot} onTune={tune} />
    <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16}}>
      <button type="button" disabled={busy} onClick={()=>void tune(null).catch(()=>{})}>Free Radio</button>
      {(['genre','subgenre','style'] as const).map(depth=>{
        if(depth==='subgenre'&&!category?.genre || depth==='style'&&!category?.subgenre)return null;
        const choices=state.options.filter(o=>o.category && (depth==='genre'?!o.category.subgenre:depth==='subgenre'?o.category.genre===category?.genre&&!!o.category.subgenre&&!o.category.style:o.category.genre===category?.genre&&o.category.subgenre===category?.subgenre&&!!o.category.style));
        return <label key={depth} style={{display:'flex',alignItems:'center',gap:8}}>{depth}<select aria-label={`Radio ${depth}`} disabled={busy} value={category?.[depth]??''} onChange={e=>choose(depth,e.target.value)}>
          <option value="">{depth==='genre'?'All music':'Broader category'}</option>
          {choices.map(o=><option key={JSON.stringify(o.category)} value={o.category![depth]} disabled={o.locked||o.dormant}>{o.category![depth]}{o.locked?' · Radio Plus':o.dormant?' · Quiet':''}</option>)}
        </select></label>;
      })}
    </div>
  </div>;
}
