"use client";
import { useEffect, useRef, useState } from 'react';
import { createPlusStatusReader, type PlusStatus as Status, type PlusStatusView } from '../lib/radio-plus-status';
export function RadioPlusMembership() {
  const dialog=useRef<HTMLDialogElement>(null),flight=useRef(false);
  const [view,setView]=useState<PlusStatusView>({status:null,signedOut:false,loading:true,error:''});
  const {status,signedOut,loading}=view;
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false);
  const reader=useRef<ReturnType<typeof createPlusStatusReader>|null>(null);
  if(!reader.current)reader.current=createPlusStatusReader((...args)=>fetch(...args),setView);
  async function refresh(){setMessage('');await reader.current!.refresh();}
  useEffect(()=>{
    const current=reader.current!;
    void current.refresh();
    const update=()=>{setMessage('');void current.refresh();};
    window.addEventListener('focus',update);
    window.addEventListener('pageshow',update);
    return()=>{current.invalidate();window.removeEventListener('focus',update);window.removeEventListener('pageshow',update);};
  },[]);
  async function action(value:'join'|'cancel') {
    if(flight.current)return;flight.current=true;setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/musicbat/subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:value,recurringConsent:consent,confirmedPriceCents:300})});
      const data=await response.json() as Status & {error?:string;checkoutUrl?:string};if(!response.ok)throw new Error(data.error??'Membership request failed.');
      if(value==='join' && data.checkoutUrl){window.location.assign(data.checkoutUrl);return;}
      await refresh();setMessage('Renewal cancelled. Radio Plus remains available until your paid period ends.');
    }catch(error){setMessage(error instanceof Error?error.message:'Membership unavailable.');}finally{flight.current=false;setBusy(false);}
  }
  const buttonStyle={minHeight:44,padding:'10px 16px',borderRadius:22,border:'1px solid #ff3ea5',background:'#171a19',color:'#ff69bd',cursor:'pointer'};
  return <>
    <button type="button" style={{...buttonStyle,fontSize:12}} onClick={()=>{dialog.current?.showModal();void refresh().catch(e=>setMessage(e.message));}}>{status?.active?'Manage Radio Plus':status?.available?'Join Radio Plus · $3/month':'About Radio Plus · planned $3/month'}</button>
    <dialog ref={dialog} aria-labelledby="radio-plus-title" style={{maxWidth:440,width:'calc(100% - 32px)',padding:24,borderRadius:18,border:'1px solid #ff3ea5',background:'#111018',color:'#eee'}}>
      <h2 id="radio-plus-title" style={{fontSize:24,margin:'0 0 12px'}}>Radio Plus</h2>
      <p>Optional $3/month. Explore eligible genre, subgenre and style stations. Vote and Keep favorites in rotation after listening.</p>
      <p>Free Radio and artist participation stay free. Music purchases are separate.</p>
      {loading ? <p role="status">Checking Radio Plus membership…</p> : view.error ? <><p role="alert">{view.error}</p><button type="button" style={buttonStyle} onClick={()=>void refresh()}>Retry membership status</button></> : signedOut ? <button type="button" style={buttonStyle} onClick={()=>window.location.assign(new URL('/signin-with-chatgpt?return_to=%2F',window.location.origin).href)}>Sign in to subscribe — $3/month</button> : status?.available ? <>
        <p style={{color:'#ff69bd'}}>Test checkout only. This preview does not collect real money.</p>
        {status.active ? <>
          <p>Radio Plus active until {new Date(status.paidUntil).toLocaleString()}.{status.cancelAtPeriodEnd?' Renewal cancelled.':''}</p>
          {!status.cancelAtPeriodEnd&&<button type="button" style={buttonStyle} disabled={busy} onClick={()=>void action('cancel')}>Cancel monthly renewal</button>}
        </> : <>
          <p>Membership status: {status.status}. Returning from checkout does not activate access; verified payment does.</p>
          <label style={{display:'flex',gap:10,margin:'16px 0'}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />I agree to $3 each month until I cancel. Cancellation stops future renewal; access lasts through the paid period.</label>
          <button type="button" style={buttonStyle} disabled={busy||!consent} onClick={()=>void action('join')}>Continue to test checkout</button>
        </>}
        <button type="button" style={{...buttonStyle,margin:'12px 0'}} disabled={busy} onClick={()=>void refresh().catch(e=>setMessage(e.message))}>Refresh membership status</button>
      </> : <p role="status">Radio Plus enrollment is not available yet. No payment can be collected here.</p>}
      {message&&<p role="status" aria-live="polite">{message}</p>}
      <form method="dialog"><button type="submit" style={buttonStyle}>Back to Radio</button></form>
    </dialog>
  </>;
}
