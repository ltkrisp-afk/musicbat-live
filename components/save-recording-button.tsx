"use client";
import {useState} from 'react';
export function SaveRecordingButton({trackId,initialSaved=false}:{trackId:number;initialSaved?:boolean}){
 const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span><button className="mb-save-recording" type="button" aria-pressed={saved} disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{const response=await fetch('/api/musicbat/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save_recording',trackId,saved:!saved})});if(!response.ok)throw Error(response.status===401?'Sign in to save recordings.':'Could not save this recording.');setSaved(!saved);}catch(e){setError(e instanceof Error?e.message:'Could not save recording.');}finally{setBusy(false);}}}>{saved?'Saved recording':'Save recording'}</button>{error&&<span role="status">{error}</span>}</span>;
}
