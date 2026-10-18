import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/musicbat/stripe/readiness/route.ts',import.meta.url),'utf8')
 .replace('import { env } from "cloudflare:workers";','const env = globalThis.__readinessEnv;')
 .replace('import { getChatGPTUser } from "../../../../chatgpt-auth";','const getChatGPTUser=async()=>globalThis.__readinessUser;')
 .replace('import { isStripeSandboxKey, StripeRequestError, stripeGet } from "../stripe";',
 'const {isStripeSandboxKey, StripeRequestError, stripeGet}=globalThis.__readinessDeps;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let index=0;
async function run({env={},account='acct_1UHA0OLKJHBmA7Jw',livemode=false,fail=false,url,user={userId:'owner'}}={}) {
 const calls=[];
 globalThis.__readinessUser=user;
 globalThis.__readinessEnv={MUSICBAT_ACCEPTANCE_OWNER_ID:'owner',MUSICBAT_BASE_URL:'https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site',MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'fixture',MUSICBAT_RELEASE_PAUSED:'1',...env};
 class StripeRequestError extends Error {status=403;}
 globalThis.__readinessDeps={StripeRequestError,isStripeSandboxKey:k=>/^(sk|rk)_test_/.test(k??''),stripeGet:async(_e,p)=>{calls.push(p);if(fail)throw new StripeRequestError('private error must stay hidden');return p==='/v1/account'?{id:account}:{livemode};}};
 const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js+'\n//'+index++).toString('base64'));
 const response=await GET(new Request(url??'https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site/api/musicbat/stripe/readiness'));
 const body=await response.json();delete globalThis.__readinessEnv;delete globalThis.__readinessDeps;
 assert(!JSON.stringify(body).includes('fixture'));assert(!JSON.stringify(body).includes('private error'));
 return {status:response.status,body,calls};
}
test('read-only hosted readiness preserves pause and checks authoritative account/mode',async()=>{
 const r=await run();assert.equal(r.status,200);assert.equal(r.body.authenticated,true);assert.equal(r.body.livemode,false);assert.equal(r.body.purchases_paused,true);assert.deepEqual(r.calls,['/v1/account','/v1/balance']);
});
test('wrong host, production configuration, live mode or live key never calls Stripe',async()=>{
 for(const options of [{url:'https://musicbat.audio/api/musicbat/stripe/readiness'},{env:{MUSICBAT_BASE_URL:'https://musicbat.audio'}},{env:{MUSICBAT_STRIPE_MODE:'live'}},{env:{STRIPE_SECRET_KEY:'sk_live_fixture'}},{env:{STRIPE_SECRET_KEY:undefined}}]){const r=await run(options);assert(r.status>=400);assert.deepEqual(r.calls,[]);}
});
test('account/mode mismatch and Stripe permission failures fail closed without private errors',async()=>{
 assert.equal((await run({account:'acct_wrong'})).status,409);
 assert.equal((await run({livemode:true})).status,409);
 const r=await run({fail:true});assert.equal(r.status,502);assert.equal(r.body.stripe_status,403);assert.equal(r.body.authenticated,false);
});
test('public sandbox diagnostics require the configured authenticated owner before Stripe reads',async()=>{
 for(const options of [{user:null},{user:{userId:'listener'}},{env:{MUSICBAT_ACCEPTANCE_OWNER_ID:undefined}}]){
  const r=await run(options);assert.equal(r.status,404);assert.deepEqual(r.calls,[]);
 }
});
