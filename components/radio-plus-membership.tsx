"use client";
import { useEffect, useRef, useState } from 'react';
type Status={available:boolean;active:boolean;paidUntil:number;cancelAtPeriodEnd:boolean;status:string};
export function RadioPlusMembership() {
  const dialog=useRef<HTMLDialogElement>(null),flight=useRef(false);
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false);
  async function refresh() {
    const response=await fetch('/api/musicbat/subscription',{cache:'no-store'});const data=await response.json() as Status & {error?:string;checkoutUrl?:string};
    if(!response.ok)throw new Error(data.error??'Sign in to view Radio Plus.');
    setStatus(data);return data as Status;
  }
  useEffect(()=>{let mounted=true;fetch('/api/musicbat/subscription',{cache:'no-store'}).then(async r=>{if(r.ok){const data=await r.json() as Status;if(mounted)setStatus(data);}}).catch(()=>{});return()=>{mounted=false};},[]);
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
      {status?.available ? <>
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
