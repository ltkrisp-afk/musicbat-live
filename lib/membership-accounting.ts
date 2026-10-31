/** USD cents only. Provider reconciliation and operator-reviewed evidence enter
 * this ledger; browser listens and estimated processor fees cannot create debt. */
export type RevenueEvent = {source_id:string;source_reference:string;month:string;kind:'receipt'|'principal-reversal'|'processing-fee'|'fee-credit';amount_cents:number;principal_reference:string|null;livemode:number;settled:number};
export type Beneficiary = {id:string;bps:number};
export function nonnegativeCents(value:number) {
 if(!Number.isSafeInteger(value)||value<0)throw new Error('Expected nonnegative safe integer cents');
 return BigInt(value);
}
export function largestRemainder(total:number,weights:{id:string;weight:number}[]) {
 const cents=nonnegativeCents(total),seen=new Set<string>();
 const ordered=weights.map(row=>{
  if(!row.id?.trim()||seen.has(row.id))throw new Error('Duplicate or empty allocation identifier');seen.add(row.id);
  return {...row,value:nonnegativeCents(row.weight)};
 });
 const sum=ordered.reduce((n,r)=>n+r.value,BigInt(0));
 if(!sum)return {allocations:ordered.map(r=>({id:r.id,cents:0})),unallocated:total};
 const rows=ordered.map(r=>({id:r.id,cents:cents*r.value/sum,remainder:cents*r.value%sum}));
 const remaining=cents-rows.reduce((n,r)=>n+r.cents,BigInt(0));
 rows.sort((a,b)=>a.remainder===b.remainder?(a.id<b.id?-1:a.id>b.id?1:0):a.remainder>b.remainder?-1:1);
 for(let i=0;i<Number(remaining);i++)rows[i].cents++;
 return {allocations:rows.sort((a,b)=>a.id<b.id?-1:1).map(r=>({id:r.id,cents:Number(r.cents)})),unallocated:0};
}
export function membershipStatement(events:RevenueEvent[],input:{month:string;deficitCents:number;unallocatedCents:number;plays:{id:string;count:number;beneficiaries:Beneficiary[]}[];receiptPrincipals:Record<string,number>;priorReversed:Record<string,number>;mode?:'test'|'live'}) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))throw new Error('Invalid UTC month');
 let net=-nonnegativeCents(input.deficitCents);const priorPool=nonnegativeCents(input.unallocatedCents);
 const ids=new Set<string>(),references=new Set<string>(),reversed=new Map<string,bigint>();
 for(const event of events){
  const key=event.kind+':'+event.source_reference;
  if(ids.has(event.source_id)||references.has(key)||!event.source_reference||event.month!==input.month||event.livemode!==(input.mode==='test'?0:1)||event.settled!==1)throw new Error('Unverified, duplicate or wrong-month revenue');
  ids.add(event.source_id);references.add(key);const cents=nonnegativeCents(event.amount_cents);
  if(event.kind==='receipt'||event.kind==='fee-credit')net+=cents;
  else if(event.kind==='principal-reversal'){
   const ref=event.principal_reference;
   if(!ref||!Object.hasOwn(input.receiptPrincipals,ref))throw new Error('Reversal requires original settled membership principal');
   const cumulative=(reversed.get(ref)??nonnegativeCents(input.priorReversed[ref]??0))+cents;
   if(cumulative>nonnegativeCents(input.receiptPrincipals[ref]))throw new Error('Refund and chargeback principal would be deducted twice');
   reversed.set(ref,cumulative);net-=cents;
  }else if(event.kind==='processing-fee')net-=cents;
  else throw new Error('Unsupported revenue source');
 }
 const qcmr=net>BigInt(0)?net:BigInt(0),deficit=net<BigInt(0)?-net:BigInt(0),newPool=qcmr/BigInt(4);
 for(const n of [qcmr,deficit,newPool+priorPool])if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Accounting range exceeded');
 const totalPool=Number(newPool+priorPool);
 for(const recording of input.plays){
  if(recording.beneficiaries.reduce((n,b)=>n+b.bps,0)!==10000||recording.beneficiaries.some(b=>!Number.isSafeInteger(b.bps)||b.bps<0))throw new Error('Signed streaming instructions must total 10000 basis points');
 }
 const allocation=largestRemainder(totalPool,input.plays.map(r=>({id:r.id,weight:r.count})));
 const recordings=allocation.allocations.map(r=>({...r,beneficiaries:largestRemainder(r.cents,input.plays.find(p=>p.id===r.id)!.beneficiaries.map(b=>({id:b.id,weight:b.bps}))).allocations}));
 return {month:input.month,qcmrCents:Number(qcmr),deficitCents:Number(deficit),newPoolCents:Number(newPool),platformBeforeExpensesCents:Number(qcmr-newPool),carriedPoolCents:Number(priorPool),totalPoolCents:totalPool,unallocatedCents:allocation.unallocated,recordings};
}
