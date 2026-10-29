"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {SharedRadioPlayer,RadioPlaybackControls,type RadioConsoleState,type RadioPlaybackState} from './shared-radio-player';
import {RetrofuturaRadio} from './retrofutura-radio';
type Callbacks={onError:(message:string)=>void;onPlay:()=>void;onProgress:(seconds:number)=>void;onEnded:()=>void};
const empty:Callbacks={onError:()=>{},onPlay:()=>{},onProgress:()=>{},onEnded:()=>{}};
const initialConsole:RadioConsoleState={options:[],snapshot:null,onTune:async()=>{}};
const initialPlayback:RadioPlaybackState={available:false,playing:false,muted:false,volume:1,message:'Connecting to Radio. Playback waits for an authorized station.',onToggle:()=>{},onMute:()=>{},onVolume:()=>{}};
type Session={playback:RadioPlaybackState;error:string;trackId:string|null;performanceKey:string;interactive:boolean;console:RadioConsoleState;attach:(callbacks:Callbacks)=>()=>void};
const RadioContext=createContext<Session>({playback:initialPlayback,error:'',trackId:null,performanceKey:'',interactive:false,console:initialConsole,attach:()=>()=>{}});
/** The root layout owns one audio element. Screens only observe it and attach
 * signal callbacks; replacing a screen never pauses or recreates the player. */
export function PersistentRadioProvider({children}:{children:ReactNode}) {
  const callbacks=useRef(empty);
  const [trackId,setTrackId]=useState<string|null>(null),[performanceKey,setPerformanceKey]=useState(''),[interactive,setInteractive]=useState(false);
  const [consoleState,setConsole]=useState(initialConsole),[error,setError]=useState('');
  const [playback,setPlayback]=useState(initialPlayback);
  const attach=useCallback((next:Callbacks)=>{callbacks.current=next;return()=>{if(callbacks.current===next)callbacks.current=empty;};},[]);
  const onTrack=useCallback((id:string|null,key:string)=>{setTrackId(id);setPerformanceKey(key);},[]);
  const onError=useCallback((message:string)=>{setError(message);callbacks.current.onError(message);},[]);
  const onPlay=useCallback(()=>{setError('');callbacks.current.onPlay();},[]);
  const onProgress=useCallback((seconds:number)=>callbacks.current.onProgress(seconds),[]);
  const onEnded=useCallback(()=>callbacks.current.onEnded(),[]);
  const value=useMemo(()=>({trackId,performanceKey,interactive,console:consoleState,attach,playback,error}),[trackId,performanceKey,interactive,consoleState,attach,playback,error]);
  return <RadioContext.Provider value={value}>
    {children}
    <SharedRadioPlayer hideTuning hidePlayback onPlayback={setPlayback} onConsole={setConsole} onTrack={onTrack} onInteractive={setInteractive} onError={onError} onPlay={onPlay} onProgress={onProgress} onEnded={onEnded} />
  </RadioContext.Provider>;
}
export function usePersistentRadio(){return useContext(RadioContext);}
export function useRadioCallbacks(callbacks:Callbacks) {
  const {attach}=usePersistentRadio(),latest=useRef(callbacks);
  useEffect(()=>{latest.current=callbacks;},[callbacks]);
  useEffect(()=>attach({onError:m=>latest.current.onError(m),onPlay:()=>latest.current.onPlay(),onProgress:s=>latest.current.onProgress(s),onEnded:()=>latest.current.onEnded()}),[attach]);
}
export function RadioConsole() {
  const {console:state,playback,error}=usePersistentRadio();
  const [busy,setBusy]=useState(false),category=state.snapshot?.category;
  async function tune(next:Parameters<RadioConsoleState['onTune']>[0]){setBusy(true);try{await state.onTune(next);}finally{setBusy(false);}}
  function choose(depth:'genre'|'subgenre'|'style',value:string){
    const next=!value?(depth==='genre'?null:depth==='subgenre'?{genre:category!.genre}:{genre:category!.genre,subgenre:category!.subgenre}):
      {genre:depth==='genre'?value:category!.genre,...(depth==='subgenre'?{subgenre:value}:depth==='style'?{subgenre:category!.subgenre,style:value}:{})};
    void tune(next).catch(()=>{});
  }
  return <div className="mb-6 space-y-3">
    <RetrofuturaRadio outputSetting={{volume:playback.volume,muted:playback.muted}} options={state.options} snapshot={state.snapshot} onTune={tune} playback={<><RadioPlaybackControls state={playback} />{error&&<p role="status" style={{color:'#17201c',fontSize:12}}>{error}</p>}</>} />
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
