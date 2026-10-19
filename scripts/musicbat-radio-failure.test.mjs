import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordRadioFailure} from '../lib/radio-failure.ts';
import {createRadioTransport} from '../lib/shared-radio-transport.ts';
test('Radio diagnostics identify a swallowed D1 exception without logging credentials or SQL',async()=>{
 const saved=console.error,logs=[];console.error=(...args)=>logs.push(args);
 try{
  const error=new Error('D1_ERROR: malformed JSON; SELECT secret FROM credentials; sk_test_NOT_A_REAL_KEY');
  const engine={connect:async()=>{throw error;}};
  const handler=createRadioTransport(engine,{authority:async()=>({id:'private-listener',territory:'US',plusUntil:null})});
  const response=await handler(new Request('https://radio.internal/channel'));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Radio is temporarily unavailable.'});
  const entry=JSON.parse(logs[0][1]);assert.equal(entry.dependency,'engine.connect');assert.equal(entry.reason,'malformed JSON');assert.ok(entry.stack.length>0);
  recordRadioFailure('gateway.service-fetch','private token');
  const text=JSON.stringify(logs);for(const secret of ['private-listener','credentials','sk_test_','private token'])assert.equal(text.includes(secret),false);
 }finally{console.error=saved;}
});
