import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const origin='https://musicbat-stage4-sandbox-2026-10-16.ltkrisp.chatgpt.site';
const source=readFileSync('app/mcp/route.ts','utf8')
 .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.mcpState.env;')
 .replace("import {getChatGPTUser} from '../chatgpt-auth';",'const getChatGPTUser=async()=>globalThis.mcpState.user;')
 .replace("import {checkoutRecoveryStatus,isStripeSandboxKey,runCheckoutRecovery} from '../api/musicbat/stripe/stripe';",'const {checkoutRecoveryStatus,isStripeSandboxKey,runCheckoutRecovery}=globalThis.mcpState;')
 .replace("import {queueUnattendedProbe,unattendedProbeStatus} from '../../lib/sandbox-recovery-probe';",'const {queueUnattendedProbe,unattendedProbeStatus}=globalThis.mcpState;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let seq=0;
async function call({env={},user={userId:'owner'},url=origin,headers={},raw,method='tools/call',params={name:'musicbat_run_checkout_recovery',arguments:{}},fail=false}={}){
 const calls=[];
 globalThis.mcpState={env:{MUSICBAT_BASE_URL:origin,MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'rk_test_fixture',MUSICBAT_ACCEPTANCE_OWNER_ID:'owner',DB:{},...env},user,isStripeSandboxKey:k=>/^(sk|rk)_test_/.test(k??''),runCheckoutRecovery:async(_env,options)=>{calls.push({operation:'run',options});if(fail)throw new Error('private credential');return {processed:1};},checkoutRecoveryStatus:async()=>{calls.push({operation:'status'});return {completed:1};}};
 globalThis.mcpState.queueUnattendedProbe=async()=>{calls.push({operation:'queue-probe'});return {state:'retrying'};};
 globalThis.mcpState.unattendedProbeStatus=async()=>{calls.push({operation:'probe-status'});return null;};
 const handler=await import('data:text/javascript;base64,'+Buffer.from(js+'\n//'+seq++).toString('base64'));
 const response=await handler.POST(new Request(url+'/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:raw??JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const body=await response.json();return {status:response.status,body,calls};
}
test('hosted MCP recovery rejects anonymous, other-owner, live and wrong-site callers before any operation',async()=>{
 for(const options of [{user:null},{user:{userId:'listener'}},{url:'https://musicbat.audio'},{env:{MUSICBAT_BASE_URL:'https://musicbat.audio'}},{env:{MUSICBAT_STRIPE_MODE:'live'}},{env:{STRIPE_SECRET_KEY:'sk_live_fixture'}},{env:{MUSICBAT_ACCEPTANCE_OWNER_ID:undefined}},{headers:{origin:'https://evil.invalid'}}]){
  const r=await call(options);assert(r.status>=400);assert.deepEqual(r.calls,[]);
 }
});
test('discovery and status are read-only while recovery invokes one bounded existing pass',async()=>{
 const discovery=await call({method:'server/discover'});assert.deepEqual(discovery.body.result.supportedVersions,['2026-07-28']);assert.deepEqual(discovery.calls,[]);
 const list=await call({method:'tools/list'});assert.equal(list.body.result.tools.length,3);assert.deepEqual(list.calls,[]);
 const status=await call({params:{name:'musicbat_recovery_status'}});assert.deepEqual(status.calls,[{operation:'status'},{operation:'probe-status'}]);
 const result=await call();assert.deepEqual(result.calls,[{operation:'run',options:{limit:10}},{operation:'status'},{operation:'probe-status'}]);assert.match(result.body.result.content[0].text,/"processed":1/);
});
test('fixture queue is explicit, idempotent, owner-only and never invokes recovery',async()=>{
 const r=await call({params:{name:'musicbat_queue_unattended_probe'}});assert.deepEqual(r.calls,[{operation:'queue-probe'}]);assert.match(r.body.result.content[0].text,/"recovery_invoked":false/);
 const denied=await call({user:{userId:'listener'},params:{name:'musicbat_queue_unattended_probe'}});assert.equal(denied.status,403);assert.deepEqual(denied.calls,[]);
 const argumentsDenied=await call({params:{name:'musicbat_queue_unattended_probe',arguments:{purchaseId:'other'}}});assert(argumentsDenied.body.error);assert.deepEqual(argumentsDenied.calls,[]);
});
test('MCP rejects arbitrary operations, nonempty arguments, malformed JSON and oversized chunked bodies',async()=>{
 for(const options of [{method:'arbitrary_sql'},{params:{name:'delete_everything'}},{params:{name:'musicbat_run_checkout_recovery',arguments:{sql:'DROP TABLE purchases'}}},{raw:'{'},{raw:'x'.repeat(16385)}]){
  const r=await call(options);assert(r.status>=400||r.body.error);assert.deepEqual(r.calls,[]);
 }
});
test('MCP failure keeps durable jobs available and never exposes processor error or credentials',async()=>{
 const r=await call({fail:true});assert.equal(r.body.result.isError,true);assert.doesNotMatch(JSON.stringify(r.body),/private credential|rk_test_fixture/);
});
