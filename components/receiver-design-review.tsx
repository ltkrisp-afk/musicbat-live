import Link from 'next/link';
import Image from 'next/image';
/** Nonproduction review sheet. Frames retain real controls at actual CSS viewports. */
export function ReceiverDesignReview({mobile=false}:{mobile?:boolean}) {
 const width=mobile?390:1440,scale=mobile?0.58:0.45,height=mobile?1300:1080;
 return <main style={{background:'#171816',color:'#d4c8ae',padding:24,minHeight:'100vh',fontFamily:'Arial,sans-serif'}}>
  <header style={{maxWidth:1280,margin:'0 auto 24px',display:'flex',justifyContent:'space-between',gap:20}}><div><h1 style={{fontSize:20,margin:'0 0 8px'}}>MusicBat · {mobile?'Mobile':'Desktop'} material review</h1><p style={{fontSize:12,margin:0,color:'#a9aa9a'}}>Owner-approved reference beside the functional implementation · no production deployment</p></div><nav style={{display:'flex',gap:16,fontSize:12}}><Link href="/design-review">Desktop</Link><Link href="/design-review/mobile">Mobile</Link><Link href="/design-preview">Interactive preview</Link></nav></header>
  <div style={{display:'grid',gridTemplateColumns:mobile?'minmax(0, 1fr) 226.2px':'minmax(0,1fr) 648px',gap:24,maxWidth:1280,margin:'auto',alignItems:'start'}}>
   <section><h2 style={{fontSize:12,fontWeight:400,letterSpacing:1,margin:'0 0 12px'}}>01 / OWNER-APPROVED REFERENCE</h2><Image unoptimized src="/materials/approved-stereo.webp" alt="Owner-approved photorealistic MusicBat walnut and aluminum stereo receiver" width={1536} height={1024} style={{display:'block',width:'100%',height:'auto',border:'1px solid #5d5343'}}/><p style={{fontSize:12,lineHeight:1.7,color:'#aaa795'}}>Compare the walnut enclosure, black instrument glass, champagne aluminum, a volume-setting instrument and recessed hardware. Instrument lighting stays blue-green; pink is limited to indicators.</p></section>
   <section><h2 style={{fontSize:12,fontWeight:400,letterSpacing:1,margin:'0 0 12px'}}>02 / {mobile?'390 PX MOBILE':'1440 PX DESKTOP'} IMPLEMENTATION</h2><div style={{width:width*scale,height:height*scale,overflow:'hidden',border:'1px solid #5d5343'}}><iframe title={mobile?'MusicBat mobile design preview':'MusicBat desktop design preview'} src="/design-preview" width={width} height={height} style={{border:0,display:'block',transform:`scale(${scale})`,transformOrigin:'top left',width,height}}/></div></section>
  </div>
 </main>;
}
