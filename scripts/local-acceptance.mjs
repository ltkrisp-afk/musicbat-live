// Node-only development adapter. Never imported by an application route or build.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { fixture, upload, post } from './website-fixture.mjs';
import { plusFixture } from './radio-plus-fixture.mjs';
import { handlePlus } from '../lib/radio-plus.ts';
import { RadioRuntime } from '../radio/runtime.ts';
import { publishCatalogRecording } from '../radio/catalog-import.ts';
import { readHttpRequest, writeHttpResponse } from '../radio/server.ts';

export async function createAcceptance() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Offline acceptance requires NODE_ENV=development');
  if (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_RADIO_PLUS_WEBHOOK_SECRET) throw new Error('Remove payment credentials before offline acceptance');
  const f = await fixture(), context = new AsyncLocalStorage(), sessions = new Map(), checkouts = new Map(), buyers = new Map();
  const dir = await mkdtemp(join(tmpdir(), 'musicbat-acceptance-'));
  const token = randomBytes(32).toString('hex');
  const runtime = new RadioRuntime({databasePath:join(dir,'radio.sqlite'),assetRoot:dir,gatewayToken:token});
  f.state.env.RADIO_SERVICE = {async fetch(input) {const r=new Request(input);const h=new Headers(r.headers);h.set('authorization','Bearer '+token);return runtime.fetch(new Request(r,{headers:h}));}};
  delete f.state.env.MUSICBAT_BASE_URL;
  const plus=plusFixture(f.state.env,()=>context.getStore()?.session);
  const adapter = {env:f.state.env,get user(){return context.getStore()?.user ?? null;}, fetch:processor};
  const key = 'acceptance'+randomBytes(12).toString('hex'); globalThis[key]=adapter;
  async function load(path) {
    let source=await readFile(path,'utf8');
    source=source.replace(/import \{ env \} from ["']cloudflare:workers["'];/,`const env=globalThis.${key}.env;`)
      .replace(/import \{ getChatGPTUser \} from ["'][^"']*chatgpt-auth["'];/,`const getChatGPTUser=async()=>globalThis.${key}.user;`);
    if(path.includes('/purchase/') || path.includes('/stripe/')) {
      source=source.replace(/import \{ buyerIdentity \} from "[^"]*buyer";/,await readFile('app/api/musicbat/purchase/buyer.ts','utf8'))
        .replace(/import \{[^;]+\} from "[^"]*stripe";/s,await readFile('app/api/musicbat/stripe/stripe.ts','utf8'));
    }
    source=source.replace(/from (["'])(\.[^"']+)\1/g,(_,q,p)=>`from ${q}${pathToFileURL(resolve(path,'..',p.endsWith('.ts')?p:p+'.ts')).href}${q}`);
    source=`const fetch=globalThis.${key}.fetch;\n`+source;
    return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
  }
  async function processor(url, init={}) {
    const u=new URL(String(url));
    if(u.origin!=='https://api.stripe.com') throw new Error('Offline adapter blocks outbound requests');
    if(u.pathname.startsWith('/v1/accounts/')) return Response.json({id:u.pathname.split('/').at(-1),charges_enabled:true,payouts_enabled:true,details_submitted:true});
    if(u.pathname==='/v1/checkout/sessions' && init.method==='POST') {
      const p=new URLSearchParams(init.body),id='cs_test_'+randomBytes(12).toString('hex');
      const session={id,url:'/__local/checkout/'+id,livemode:false,status:'open',payment_status:'unpaid',currency:'usd',
        amount_total:Number(p.get('line_items[0][price_data][unit_amount]'))+Number(p.get('line_items[1][price_data][unit_amount]')),
        metadata:{musicbat_purchase_id:p.get('metadata[musicbat_purchase_id]'),musicbat_processing_cents:p.get('metadata[musicbat_processing_cents]')},
        payment_intent:{id:'pi_test_'+id,application_fee_amount:Number(p.get('payment_intent_data[application_fee_amount]')),transfer_data:{destination:p.get('payment_intent_data[transfer_data][destination]')}}};
      checkouts.set(id,{session,success:p.get('success_url'),cancel:p.get('cancel_url'),owner:context.getStore()?.session});
      return Response.json(session);
    }
    const entry=checkouts.get(u.pathname.split('/').at(-1));
    if(!entry) throw new Error('Unknown offline processor operation');
    return Response.json(entry.session);
  }
  const routes = new Map();
  for(const [url,path] of [['/api/musicbat','app/api/musicbat/route.ts'],['/api/musicbat/purchase','app/api/musicbat/purchase/route.ts'],['download','app/api/musicbat/purchase/[purchaseId]/download/route.ts'],['/api/musicbat/channel','app/api/musicbat/channel/route.ts'],['/api/musicbat/channel/audio','app/api/musicbat/channel/audio/route.ts'],['/api/musicbat/stripe/connect','app/api/musicbat/stripe/connect/route.ts'],['/api/musicbat/statutory-radio','app/api/musicbat/statutory-radio/route.ts'],['legacyAudio','app/api/musicbat/audio/[assetId]/route.ts'],['webhook','app/api/musicbat/stripe/webhook/route.ts']]) routes.set(url,await load(path));
  const now=Date.now(),expiry=now+86400000;
  f.state.user={userId:'local_musician'};
  for (const [index,genre] of ['Rock','Rock','Jazz'].entries()) {
    const response=await upload(f.route,{title:'Generated acceptance '+(index+1),artistName:'Local test musician',primaryGenre:genre,subgenre:genre==='Rock'?'Punk':'',style:genre==='Rock'?'Hardcore':''});
    if(response.status!==201) throw new Error('Fixture upload failed: '+await response.text());
    const row=f.sqlite.prepare('SELECT * FROM tracks ORDER BY id DESC LIMIT 1').get();
    await f.route.POST(post({action:'set_sale_settings',trackId:row.id,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}));
    const permission={recording_basis:'direct',recording_evidence:'Generated test tone only',composition_evidence:'Generated test tone only',reviewed_by:'local acceptance fixture',reviewed_at:now-1,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:now-1,expires_at:expiry,withdrawn_at:null,territory:'worldwide'};
    f.sqlite.prepare('INSERT INTO playback_permissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,...Object.values(permission));
    const object=f.objects.get('tracks/'+row.audio_url.split('/').at(-1)); const path=row.id+'.wav';await writeFile(join(dir,path),object.bytes);
    publishCatalogRecording(runtime,row,permission,{artistIds:['generated-musician'],albumId:'generated-album',compilationIds:[],durationMs:30000,directRestrictions:null,metadataReviewed:true},{path,sha256:createHash('sha256').update(object.bytes).digest('hex'),size:object.bytes.length,mediaType:'audio/wav',lawfulCopyReference:'Generated fixture only',reviewedBy:'local acceptance',reviewedAt:now-1,durationEvidence:'PCM sample count',contractReference:'Generated fixture unrestricted',restrictionsReviewed:true});
  }
  f.sqlite.prepare("INSERT INTO artist_accounts(artist_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES ('local_musician','acct_test_local',1,1,1)").run();
  for(const [id,category] of [['free',null],['rock',{genre:'Rock'}],['punk',{genre:'Rock',subgenre:'Punk'}],['hardcore',{genre:'Rock',subgenre:'Punk',style:'Hardcore'}],['jazz',{genre:'Jazz'}]]) runtime.establishChannel(id,{category,mode:category?'radio-plus':'free-radio',territory:'worldwide',minimumArtists:1,review:{reference:'Generated fixture channel only',verifiedAt:now-1,expiresAt:expiry},gate:null});
  // Membership now starts as Free; only verified fixture invoices unlock Plus.
  runtime.start();
  async function handle(request) {
    const url=new URL(request.url),path=url.pathname;
    const cookie=/\b__musicbat_acceptance=([a-f0-9]+)/.exec(request.headers.get('cookie')??'')?.[1];const user=sessions.get(cookie);
    return context.run({user,session:cookie},async()=>{
      if(request.headers.get('origin') && request.headers.get('origin')!==url.origin) return new Response(null,{status:403});
      if(request.headers.get('sec-fetch-site')==='cross-site')return new Response(null,{status:403});
      if(path==='/signin-with-chatgpt' || path==='/__local')return new Response('<h1>MusicBat offline acceptance</h1><p>Generated test audio. No real payments. Storage resets on restart.</p><form method="post" action="/__local/login"><button name="role" value="musician">Musician</button> <button name="role" value="patron">Patron</button></form>',{headers:{'content-type':'text/html','cache-control':'no-store'}});
      if(path==='/__local/login' && request.method==='POST') {
        const role=(await request.formData()).get('role');if(!['musician','patron'].includes(role))return new Response(null,{status:400});
        const value=randomBytes(24).toString('hex');sessions.set(value,{userId:'local_'+role,email:role+'@musicbat.test',displayName:'Local '+role,fullName:'Local '+role});
        return new Response(null,{status:303,headers:{location:'/', 'set-cookie':'__musicbat_acceptance='+value+'; HttpOnly; SameSite=Lax; Path=/'}});
      }
      if(path==='/signout-with-chatgpt'){sessions.delete(cookie);return new Response(null,{status:303,headers:{location:'/__local','set-cookie':'__musicbat_acceptance=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'}});}
      if(path==='/__local/history') {
        if(!user)return new Response(null,{status:401});
        const buyer=buyers.get(cookie),items=[];
        if(buyer)for(const {id} of f.sqlite.prepare('SELECT id FROM purchases').all()) {
          const response=await routes.get('/api/musicbat/purchase').GET(new Request(url.origin+'/api/musicbat/purchase?id='+id,{headers:{cookie:'musicbat_buyer='+buyer}}));
          if(response.ok){const data=await response.json();items.push(`<li>${data.purchase.id}: ${data.purchase.status}${data.downloadUrl?` <a href="${data.downloadUrl}">Download</a>`:''}</li>`);}
        }
        return new Response('<h1>Offline purchase history</h1><ul>'+items.join('')+'</ul><a href="/">Back to MusicBat</a>',{headers:{'content-type':'text/html','cache-control':'no-store'}});
      }
      if(path.startsWith('/__local/checkout/')) {
        const entry=checkouts.get(path.split('/').at(-1));if(!entry || !user || entry.owner!==cookie)return new Response(null,{status:404});
        if(request.method==='POST') {
          const action=(await request.formData()).get('action');if(action==='cancel')return new Response(null,{status:303,headers:{location:entry.cancel}});
          if(action!=='pay')return new Response(null,{status:400});
          entry.session.status='complete';entry.session.payment_status='paid';
          const raw=JSON.stringify({id:'evt_test_'+entry.session.id,type:'checkout.session.completed',livemode:false,data:{object:{id:entry.session.id,livemode:false}}}),stamp=Math.floor(Date.now()/1000);
          const sig=createHmac('sha256',f.state.env.STRIPE_WEBHOOK_SECRET).update(stamp+'.'+raw).digest('hex');
          const settled=await routes.get('webhook').POST(new Request(url.origin+'/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${sig}`},body:raw}));
          if(!settled.ok)return settled;
          return new Response(null,{status:303,headers:{location:entry.success.replace('{CHECKOUT_SESSION_ID}',entry.session.id)}});
        }
        return new Response(`<h1>Offline purchase simulation</h1><p>No card information or money is collected.</p><p>Fixture total: $${(entry.session.amount_total/100).toFixed(2)}. Artist gets $1.70 of the $2 song; platform gets $0.30. Processing uses test-only 290 bps + 30 cents.</p><form method="post"><button name="action" value="pay">Simulate successful payment</button> <button name="action" value="cancel">Cancel</button></form>`,{headers:{'content-type':'text/html','cache-control':'no-store'}});
      }
      if(path==='/api/musicbat/subscription')return handlePlus(f.state.env,request,user?.userId??null);
      if(path==='/api/musicbat/subscription/webhook')return new Response(null,{status:503});
      if(path.startsWith('/__local/plus-checkout/')) {
        const id=path.split('/').at(-1),entry=plus.sessions.get(id);
        if(!entry||!user||entry.owner!==cookie)return new Response(null,{status:404});
        if(request.method==='POST') {
          const action=(await request.formData()).get('action');
          if(action==='cancel')return new Response(null,{status:303,headers:{location:entry.cancel}});
          if(action!=='pay')return new Response(null,{status:400});
          return new Response(null,{status:303,headers:{location:await plus.pay(id)}});
        }
        return new Response('<h1>Radio Plus offline subscription simulation</h1><p>$3/month recurring membership. No real money is collected. Cancellation stops renewal; access lasts through the paid period.</p><form method="post"><button name="action" value="pay">Simulate successful subscription payment</button> <button name="action" value="cancel">Cancel checkout</button></form>',{headers:{'content-type':'text/html','cache-control':'no-store'}});
      }
      if(path==='/__local/plus-control') {
        if(!user)return new Response(null,{status:401});
        if(request.method==='POST') {
          try{await plus.lifecycle(user.userId,(await request.formData()).get('action'));}
          catch(error){return new Response(String(error),{status:400});}
          return new Response(null,{status:303,headers:{location:'/__local/plus-control'}});
        }
        return new Response('<h1>Test-only subscription lifecycle</h1><p>These buttons simulate processor events only in this isolated preview.</p><form method="post"><button name="action" value="renew">Simulate renewal</button> <button name="action" value="fail">Simulate failed renewal</button> <button name="action" value="expire">Simulate subscription ending</button></form><a href="/">Back to Radio</a>',{headers:{'content-type':'text/html','cache-control':'no-store'}});
      }
      if(path==='/api/musicbat/stripe/webhook')return new Response(null,{status:503});
      const route=routes.get(path) ?? (path.startsWith('/api/musicbat/audio/')?routes.get('legacyAudio'):null) ?? (/^\/api\/musicbat\/purchase\/[^/]+\/download$/.test(path)?routes.get('download'):null);
      if(route) {
        if(!route[request.method])return new Response(null,{status:405});
        Object.defineProperty(request,'cf',{value:{country:'US'}});
        if(path.startsWith('/api/musicbat/purchase')) {
          if(!user)return new Response(null,{status:401});
          const h=new Headers(request.headers),other=(h.get('cookie')??'').split(';').filter(c=>!c.trim().startsWith('musicbat_buyer=')).join(';');
          h.set('cookie',other+(buyers.has(cookie)?'; musicbat_buyer='+buyers.get(cookie):''));
          request=new Request(request,{headers:h});
        }
        const response=await route[request.method](request);
        const buyerCookie=/musicbat_buyer=([a-f0-9]{64})/.exec(response.headers.get('set-cookie')??'');
        if(buyerCookie && user)buyers.set(cookie,buyerCookie[1]);
        // Local HTTP only; production handlers retain Secure cookies.
        if(response.headers.has('set-cookie'))response.headers.set('set-cookie',response.headers.get('set-cookie').replace('; Secure',''));
        return response;
      }
      if(path.startsWith('/api/musicbat/'))return new Response(null,{status:404});
      return null;
    });
  }
  let closed=false;
  return {handle,identity(cookie){return sessions.get(cookie);},sqlite:f.sqlite,runtime,async close(){if(closed)return;closed=true;runtime.close();f.sqlite.close();delete globalThis[key];await rm(dir,{recursive:true,force:true});}};
}

export async function acceptancePlugin() {
  const app=await createAcceptance();
  return {name:'musicbat-offline-acceptance',enforce:'pre',api:{close:()=>app.close()},
    transform(source,id){
      if(!id.replaceAll('\\','/').split('?')[0].endsWith('/app/[artistSlug]/page.tsx'))return;
      // RSC artist-page existence checks use the same isolated fixture catalog.
      // This transform is installed only by the development acceptance command.
      const slugs=app.sqlite.prepare('SELECT slug FROM artist_pages').all().map(r=>r.slug);
      return source.replace("import { env } from 'cloudflare:workers';",`const env={DB:{prepare(){return {bind(slug:string){return {async first(){return ${JSON.stringify(slugs)}.includes(slug)?{exists:1}:null;}};}};}}};`);
    },configureServer(server){
    server.httpServer?.once('close',()=>void app.close());
    server.middlewares.use(async(req,res,next)=>{
      // Bind only to loopback. Browser headers cannot choose an identity.
      const host=(req.headers.host??'').split(':')[0];
      if(!['localhost','127.0.0.1'].includes(host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {res.writeHead(403);res.end();return;}
      for(const name of Object.keys(req.headers))if(name.startsWith('oai-authenticated-user-'))delete req.headers[name];
      req.rawHeaders=Object.entries(req.headers).flatMap(([k,v])=>[k,String(v)]);
      try {
        const response=await app.handle(await readHttpRequest(req,'http://'+req.headers.host,25*1024*1024+65536));
        if(response){
          if(req.method==='POST' && req.url?.split('?')[0]==='/api/musicbat' && response.ok){
            for(const entry of server.moduleGraph.idToModuleMap.values())if(entry.id?.includes('/app/[artistSlug]/page.tsx'))server.moduleGraph.invalidateModule(entry);
          }
          return await writeHttpResponse(response,res);
        }
        const cookie=/\b__musicbat_acceptance=([a-f0-9]+)/.exec(req.headers.cookie??'')?.[1];const user=app.identity(cookie);
        if(user)for(const [name,value]of Object.entries({'oai-authenticated-user-id':user.userId,'oai-authenticated-user-email':user.email,'oai-authenticated-user-full-name':encodeURIComponent(user.fullName),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'})){req.headers[name]=value;req.rawHeaders.push(name,value);}
        next();
      }catch(error){server.config.logger.error(String(error));res.writeHead(500);res.end('Offline acceptance adapter failed');}
    });
  }};
}
