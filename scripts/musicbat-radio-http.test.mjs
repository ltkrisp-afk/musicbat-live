import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localStack } from '../e2e/local-stack.mjs';
import { seedRuntime } from '../e2e/fixtures.mjs';
import { privateRadioService } from '../lib/private-radio-service.ts';
test('real HTTP gateway → private runtime → disk authority → immutable audio across two listeners, switching, reconnect, withdrawal and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bat-http-'));let now=Date.now(),stack;
 const options={databasePath:join(dir,'radio.sqlite'),assetRoot:dir,clock:()=>now};
 try {
  stack=await localStack(options);await seedRuntime(stack.runtime,dir,{now});stack.runtime.start();
  const sessions={one:stack.session('listener-one'),two:stack.session('listener-two'),free:stack.session('free-user'),foreign:stack.session('foreign','GB')};
  const call=(path='/channel',body,who='one',extra={})=>fetch(stack.origin+'/api/musicbat'+path,{method:body?'POST':'GET',
    headers:{cookie:'bat_test_session='+sessions[who],...(body?{origin:stack.origin,'content-type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
  const a=await (await call()).json();now+=500;const b=await (await call('/channel',undefined,'two')).json();
  assert.equal(a.snapshot.performance.sequence,b.snapshot.performance.sequence);assert.equal(b.snapshot.performance.offsetMs,500);
  const bytes=await call(a.mediaUrl.replace('/api/musicbat',''),undefined,'one',{range:'bytes=8-11'});assert.equal(bytes.status,206);assert.equal(await bytes.text(),'WAVE');
  for(const category of [{genre:'Rock'},{genre:'Rock',subgenre:'Punk'},{genre:'Rock',subgenre:'Punk',style:'Hardcore'}]) {
   const switched=await (await call('/channel',{category})).json();assert.deepEqual(switched.snapshot.category,category);
   now+=100;const second=await (await call('/channel',{category},'two')).json();assert.equal(switched.snapshot.performance.sequence,second.snapshot.performance.sequence);
  }
  const tuned=await (await call()).json();now+=100;const reconnect=await (await call()).json();assert.equal(tuned.snapshot.performance.sequence,reconnect.snapshot.performance.sequence);
  assert.ok(reconnect.snapshot.performance.offsetMs>tuned.snapshot.performance.offsetMs);
  const old=reconnect.mediaUrl;stack.runtime.withdraw(reconnect.snapshot.performance.trackId,'HTTP integration withdrawal');
  assert.equal((await call(old.replace('/api/musicbat',''))).status,409);const next=await (await call()).json();assert.notEqual(next.snapshot.performance.trackId,reconnect.snapshot.performance.trackId);
  assert.equal((await call('/channel',{category:{genre:'Rock'}},'free')).status,403);
  assert.equal((await call('/channel',undefined,'foreign')).status,403);
  assert.equal((await call('/channel',{category:null},'one',{origin:'https://evil.invalid'})).status,403);
  assert.equal((await fetch(stack.origin+'/api/musicbat/channel',{headers:{'oai-authenticated-user-id':'listener-one','x-musicbat-listener':'listener-one'}})).status,401);
  assert.equal((await call('/audio/a.wav')).status,410);
  stack.controls.offline=true;assert.equal((await call()).status,503);stack.controls.offline=false;assert.equal((await call()).status,200);
  const before=await (await call()).json();await stack.close();stack=await localStack(options);sessions.one=stack.session('listener-one');
  now+=200;const after=await (await call()).json();assert.equal(after.snapshot.channelId,before.snapshot.channelId);assert.equal(after.snapshot.performance.sequence,before.snapshot.performance.sequence);
  for(const id of ['a','b','c'])stack.runtime.withdraw(id,'HTTP empty fixture');
  const silent=await (await call()).json();assert.equal(silent.snapshot.status,'silent');assert.equal(silent.mediaUrl,null);
 }finally{await stack?.close();await rm(dir,{recursive:true,force:true})}
});
test('private HTTP adapter never follows redirects, trusts client URLs or enables an unconfigured backend',()=>{
 assert.equal(privateRadioService(undefined,undefined),undefined);
 for(const origin of ['http://public.invalid','https://user:pass@public.invalid','https://public.invalid/path','https://public.invalid/?token=x'])assert.throws(()=>privateRadioService(origin,'a'.repeat(32)));
 assert.ok(privateRadioService('https://private.invalid','a'.repeat(32)));
});
