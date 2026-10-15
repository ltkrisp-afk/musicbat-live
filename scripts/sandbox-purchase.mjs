// Local operator harness for the existing commerce handlers. Real Stripe calls;
// no account creation, simulated webhook signatures, production writes or Radio.
import {DatabaseSync, backup} from 'node:sqlite';
import {readFile, readdir, mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import ts from 'typescript';
import {stripeGet, isStripeSandboxKey, connectReady} from '../app/api/musicbat/stripe/stripe.ts';
import {readHttpRequest, writeHttpResponse} from '../radio/server.ts';

export const OWNER='yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil';
export const ACCOUNT='acct_1UQrXtLKJHXYfqXB';
export const ASSET='048ea870-7924-40a2-9e18-c945a3a9b4b3.mp3';
export const HASH='0960f654c0c9a96f5718f54b82b31a117315642f994e2dab0b97cb3fbbec45c8';
export function blockers(env) {
 const errors=[];
 if((env.MUSICBAT_STRIPE_MODE??'test')!=='test'||!isStripeSandboxKey(env.STRIPE_SECRET_KEY?.trim()))errors.push('Sandbox-only Stripe configuration required.');
 if(!/^whsec_[A-Za-z0-9_]+$/.test(env.STRIPE_WEBHOOK_SECRET??''))errors.push('STRIPE_WEBHOOK_SECRET missing: genuine signed Stripe delivery is required.');
 for(const name of ['MUSICBAT_PROCESSING_BPS','MUSICBAT_PROCESSING_FIXED_CENTS'])if(!/^\d+$/.test(env[name]??''))errors.push(name+' is not configured.');
 if(Number(env.MUSICBAT_PROCESSING_BPS)>=10000)errors.push('Invalid processing percentage.');
 return errors;
}
function d1(sqlite){return {prepare(sql){const statement=sqlite.prepare(sql);const bound=(...values)=>({async first(){return statement.get(...values)??null},async all(){return {results:statement.all(...values)}},async run(){return {meta:{changes:statement.run(...values).changes}}},execute(){if(statement.columns().length){const results=statement.all(...values);return {results,meta:{changes:results.length}}}return {results:[],meta:{changes:statement.run(...values).changes}}}});return {...bound(),bind:bound}},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}}}
export async function handler(path,env){
 const key='sandbox'+randomBytes(16).toString('hex');globalThis[key]={env,console:{...console,error(...args){console.error(...args.map(value=>value instanceof Error?value.message:value))}}};
 let source=await readFile(path,'utf8');
 source=source.replace(/import \{ env \} from ["']cloudflare:workers["'];/,`const env=globalThis.${key}.env;`)
  .replace(/import \{ buyerIdentity \} from "[^"]*buyer";/,await readFile('app/api/musicbat/purchase/buyer.ts','utf8'))
  .replace(/import \{[^;]+\} from "[^";]*stripe";/s,await readFile('app/api/musicbat/stripe/stripe.ts','utf8'));
 const compiled=ts.transpileModule(`const console=globalThis.${key}.console;\n`+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(compiled+'\n//# sourceURL=musicbat-sandbox-commerce-handler.mjs').toString('base64'));
}
export async function createPurchaseSnapshot(sourcePath,snapshot){
 const source=new DatabaseSync(sourcePath,{readOnly:true});try{await backup(source,snapshot)}finally{source.close()}
 const sqlite=new DatabaseSync(snapshot);
 // Explicit sandbox-only mapping in this NEW snapshot. Main D1 untouched.
 sqlite.exec('BEGIN IMMEDIATE');
 try{
  if(sqlite.prepare('SELECT 1 FROM artist_accounts WHERE artist_id=?').get(OWNER))throw Error('Snapshot already contains an original-owner payout association; refusing replacement.');
  sqlite.prepare('UPDATE artist_accounts SET artist_id=? WHERE artist_id=? AND stripe_account_id=?').run(OWNER,'local_seedy',ACCOUNT);
  sqlite.prepare('UPDATE tracks SET sale_enabled=1,sale_rights_attested=1,sale_price_cents=200 WHERE id=5 AND artist_id=?').run(OWNER);
  sqlite.prepare('INSERT INTO artist_track_audit VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),5,'local-sandbox-operator','sandbox_purchase_authorization',JSON.stringify({scope:'new isolated snapshot only',originalOwner:OWNER,verifiedLocalArtist:'local_seedy',account:ACCOUNT,baseCents:200}),Date.now());
  sqlite.exec('COMMIT');
 }catch(error){sqlite.exec('ROLLBACK');sqlite.close();throw error}
 return sqlite;
}
export async function start(){
 const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
 if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Only --check is supported.');
 if(process.env.MUSICBAT_LOCAL_ACCEPTANCE==='1')throw Error('Offline acceptance cannot run real Stripe testing.');
 // Read credentials privately from the existing ignored file; never print them.
 try{process.loadEnvFile('.env.local')}catch(error){if(error.code!=='ENOENT')throw Error('Could not load existing local configuration.');}
 const env={...process.env};const errors=blockers(env);
 const storage=resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
 const candidates=[];
 for(const file of await readdir(storage).catch(()=>[]))if(file.endsWith('.sqlite')&&file!=='metadata.sqlite'){
  const path=join(storage,file);const db=new DatabaseSync(path,{readOnly:true});
  try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tracks'").get())candidates.push(path)}finally{db.close()}
 }
 if(candidates.length!==1)errors.push('Expected exactly one local MusicBat D1 database; no database selected.');
 const audio=await readFile(join('recovery-audio',ASSET)).catch(()=>null);
 if(!audio||createHash('sha256').update(audio).digest('hex')!==HASH)errors.push('Recovered Unity MP3 checksum does not match.');
 let association,track;
 if(candidates.length===1){const db=new DatabaseSync(candidates[0],{readOnly:true});try{
  association=db.prepare('SELECT * FROM artist_accounts WHERE artist_id=? AND stripe_account_id=?').get('local_seedy',ACCOUNT);
  track=db.prepare('SELECT * FROM tracks WHERE id=5 AND artist_id=? AND audio_url=?').get(OWNER,'/api/musicbat/audio/'+ASSET);
 }finally{db.close()}}
 if(!association)errors.push('Existing verified local_seedy sandbox association not found; no account will be created.');
 if(!track)errors.push('Original Unity ownership/metadata record not found.');
 if(errors.length){console.log(JSON.stringify({ready:false,blockers:errors,noPaymentCreated:true},null,2));return;}
 // GET only: ensure this credential can read the existing sandbox account.
 const platform=await stripeGet(env,'/v1/account');
 if(platform.id!=='acct_1UHA0OLKJHBmA7Jw')throw Error('Configured key belongs to a different Stripe sandbox platform.');
 const account=await stripeGet(env,'/v1/accounts/'+ACCOUNT);
 if(account.id!==ACCOUNT||account.livemode===true||!connectReady(account))throw Error('Existing Stripe sandbox account is not verified ready.');
 if(account.metadata?.musicbat_artist_id!=='local_seedy')throw Error('Existing account metadata does not match the verified local artist; stopped.');
 if(process.argv.includes('--check')){console.log(JSON.stringify({ready:true,account:ACCOUNT,accountReady:true,audioSha256:HASH,baseCents:200,artistCents:170,platformCents:30,webhookDeliveryVerified:false,noPaymentCreated:true},null,2));return;}
 await mkdir('.wrangler/sandbox-purchase',{recursive:true});
 const dir=await mkdtemp(resolve('.wrangler/sandbox-purchase/run-'));
 const snapshot=join(dir,'purchase.sqlite');
 const sqlite=await createPurchaseSnapshot(candidates[0],snapshot);
 const origin='http://127.0.0.1:5181',nonce=randomBytes(24).toString('hex');
 const cookie='musicbat_buyer='+randomBytes(32).toString('hex');
 env.MUSICBAT_STRIPE_MODE='test';env.MUSICBAT_BASE_URL=origin;env.DB=d1(sqlite);
 env.BUCKET={async head(key){return key==='tracks/'+ASSET?{size:audio.length}:null},async get(key){return key==='tracks/'+ASSET?{body:audio,size:audio.length,httpMetadata:{contentType:'audio/mpeg'}}:null}};
 const purchase=await handler('app/api/musicbat/purchase/route.ts',env);
 const webhook=await handler('app/api/musicbat/stripe/webhook/route.ts',env);
 const download=await handler('app/api/musicbat/purchase/[purchaseId]/download/route.ts',env);
 let order=null,checkoutUrl=null,verified=false;let processing=false;
 const evidence={scope:'real Stripe sandbox; isolated local DB snapshot',account:ACCOUNT,originalOwner:OWNER,verifiedLocalArtist:'local_seedy',audioSha256:HASH,baseCents:200,artistCents:170,platformCents:30,checkoutCreated:false,signedWebhookVerified:false,duplicateReplayVerified:false,downloadVerified:false,stripeAllocationVerified:false};
 async function save(){await writeFile(join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600})}
 const headers={'cache-control':'no-store','content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
 function html(body){return new Response(body,{headers})}
 const server=createServer(async(req,out)=>{
  try{
   if(req.headers.host!=='127.0.0.1:5181')return await writeHttpResponse(new Response(null,{status:403}),out);
   const r=await readHttpRequest(req,origin,1048576),url=new URL(r.url);
   if(r.method==='POST'&&url.pathname==='/api/musicbat/stripe/webhook'){
    const raw=await r.clone().text();const result=await webhook.POST(r);const info=await result.clone().json();
    const event=JSON.parse(raw);
    if(order&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&result.ok&&info.received&&!info.pending&&sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(order)?.status==='paid'){
     evidence.signedWebhookVerified=true;
     const replay=await webhook.POST(new Request(r.url,{method:'POST',headers:r.headers,body:raw}));
     evidence.duplicateReplayVerified=(await replay.json()).duplicate===true;
     const data=JSON.parse(raw);evidence.processedEventCount=sqlite.prepare('SELECT count(*) n FROM stripe_events WHERE event_id=?').get(data.id).n;
     await save();
    }
    return await writeHttpResponse(result,out);
   }
   if(url.pathname==='/'&&r.method==='GET')return await writeHttpResponse(html(`<h1>MusicBat Stripe sandbox purchase</h1><p>Unity by The Enucleators. $2 base price: artist $1.70, MusicBat $0.30. Configured buyer processing is shown before Checkout. Existing sandbox account only.</p><form action="/start" method="post"><input type="hidden" name="nonce" value="${nonce}"><button>Open Stripe sandbox Checkout</button></form><p><a href="/verify">Verify payment and download</a></p>`),out);
   if(url.pathname==='/start'&&r.method==='POST'){
    if(r.headers.get('origin')!==origin||(await r.formData()).get('nonce')!==nonce)return await writeHttpResponse(new Response(null,{status:403}),out);
    if(processing)return await writeHttpResponse(new Response('Checkout request in progress',{status:409}),out);
    if(checkoutUrl)return await writeHttpResponse(new Response(null,{status:303,headers:{location:checkoutUrl}}),out);
    processing=true;
    try{
     const call=body=>purchase.POST(new Request(origin+'/api/musicbat/purchase',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)}));
     const quote=await call({trackId:5});const q=await quote.json();
     if(quote.status!==409||!q.confirmationRequired)throw Error(q.error??'Quote unavailable');
     // The existing application owns the quote and Checkout calculation.
     const result=await call({trackId:5,confirmedTotalCents:q.quote.totalCents});const data=await result.json();
     if(!result.ok||!data.checkoutUrl||new URL(data.checkoutUrl).origin!=='https://checkout.stripe.com')throw Error(data.error??'Checkout unavailable');
     order=data.purchase.id;checkoutUrl=data.checkoutUrl;evidence.checkoutCreated=true;evidence.purchaseId=order;evidence.quote=q.quote;await save();
     return await writeHttpResponse(new Response(null,{status:303,headers:{location:checkoutUrl}}),out);
    }finally{processing=false}
   }
   if(url.pathname==='/verify'&&r.method==='GET'){
    if(!order)return await writeHttpResponse(html('<p>No Checkout created yet.</p><a href="/">Return</a>'),out);
    const row=sqlite.prepare('SELECT * FROM purchases WHERE id=?').get(order);
    if(row.status!=='paid'||!evidence.signedWebhookVerified)return await writeHttpResponse(html('<p>Awaiting a verified signed Stripe webhook. Return here after payment and webhook delivery.</p><a href="/verify">Check again</a>'),out);
    const session=await stripeGet(env,'/v1/checkout/sessions/'+row.processor_session_id,{'expand[]':'payment_intent'});
    const intent=session.payment_intent;
    evidence.stripeAllocationVerified=session.livemode===false&&session.payment_status==='paid'&&intent?.transfer_data?.destination===ACCOUNT&&intent.application_fee_amount===30+row.processing_cents&&row.artist_share_cents===170&&row.platform_fee_cents===30&&session.amount_total===200+row.processing_cents;
    const delivered=await download.GET(new Request(origin+'/api/musicbat/purchase/'+order+'/download',{headers:{cookie}}));
    evidence.downloadVerified=delivered.ok&&createHash('sha256').update(Buffer.from(await delivered.arrayBuffer())).digest('hex')===HASH;
    verified=evidence.stripeAllocationVerified&&evidence.downloadVerified&&evidence.duplicateReplayVerified&&evidence.processedEventCount===1;await save();
    console.log(JSON.stringify({verified,...evidence,evidenceFile:join(dir,'evidence.json')},null,2));
    return await writeHttpResponse(html(`<h1>${verified?'Sandbox purchase verified':'Verification incomplete'}</h1><p>Stripe allocation, signed webhook, duplicate replay, and original download results were recorded locally.</p>${verified?'<a href="/download">Download Unity</a>':''}`),out);
   }
   if(url.pathname==='/download'&&r.method==='GET'&&verified)return await writeHttpResponse(await download.GET(new Request(origin+'/api/musicbat/purchase/'+order+'/download',{headers:{cookie}})),out);
   return await writeHttpResponse(new Response(null,{status:404}),out);
  }catch{console.error('Sandbox purchase operation failed. No verification claimed.');if(!out.headersSent)out.writeHead(503);out.end('Sandbox operation failed; check local configuration or Stripe request logs.');}
 });
 server.listen(5181,'127.0.0.1',()=>console.log(JSON.stringify({url:origin,webhook:origin+'/api/musicbat/stripe/webhook',snapshot,account:ACCOUNT,noProductionChanges:true})));
 server.on('error',()=>{console.error('Sandbox listener could not start; original MusicBat server was not changed.');sqlite.close();process.exitCode=1});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{sqlite.close();process.exit(0)}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))start().catch(()=>{console.error('Sandbox preflight failed. No account created and no successful payment claimed.');process.exitCode=1});
