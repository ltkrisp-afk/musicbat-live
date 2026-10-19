import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectRadioService,configuredRadioService} from '../lib/configured-radio-service.ts';
import {forwardRadio} from '../lib/radio-gateway.ts';
test('explicit sandbox mode ignores a regular binding and even invalid private runtime configuration',async()=>{
 let used=0;
 const service=selectRadioService({MUSICBAT_CLOUDFLARE_RADIO:'test',MUSICBAT_STRIPE_MODE:'test',DB:{},BUCKET:{},RADIO_SERVICE:{fetch(){used++;throw Error('regular service must not run');}},RADIO_RUNTIME_ORIGIN:'invalid',RADIO_RUNTIME_TOKEN:'x'.repeat(32)});
 // A catalog read can only reach the selected sandbox D1 adapter.
 const response=await service.fetch(new Request('https://radio.internal/channel'));
 assert.equal(response.status,401);assert.equal(used,0);
});
test('missing sandbox bindings fail closed on channel and audio without regular fallback; authentication remains first',async()=>{
 for(const bindings of [{},{DB:{}},{BUCKET:{}}])for(const path of ['/api/musicbat/channel','/api/musicbat/channel/audio?channel=free&sequence=1']){
  let used=0;const service=configuredRadioService({...bindings,MUSICBAT_CLOUDFLARE_RADIO:'test',MUSICBAT_STRIPE_MODE:'test',RADIO_SERVICE:{fetch(){used++;}}});
  const request=new Request('https://sandbox.example'+path);
  assert.equal((await forwardRadio(request,service,null)).status,401);
  const response=await forwardRadio(request,service,'authorized-test-listener');assert.equal(response.status,503);
  assert.deepEqual((await response.json()).missing_bindings,['DB','BUCKET'].filter(key=>!bindings[key]));assert.equal(used,0);
 }
});
test('outside explicit sandbox mode existing service-first and private-runtime routing are preserved',async()=>{
 const regular={fetch:async()=>new Response('regular')};
 for(const flags of [{},{MUSICBAT_CLOUDFLARE_RADIO:'test',MUSICBAT_STRIPE_MODE:'live'},{MUSICBAT_CLOUDFLARE_RADIO:'test'},{MUSICBAT_STRIPE_MODE:'test'}])assert.equal(selectRadioService({...flags,RADIO_SERVICE:regular,RADIO_RUNTIME_ORIGIN:'invalid',RADIO_RUNTIME_TOKEN:'x'.repeat(32)}),regular);
 assert.equal(selectRadioService({}),undefined);
 assert.equal(typeof selectRadioService({RADIO_RUNTIME_ORIGIN:'https://private.example',RADIO_RUNTIME_TOKEN:'x'.repeat(32)}).fetch,'function');
 assert.equal(configuredRadioService({RADIO_SERVICE:regular}),undefined,'missing production DB must retain the existing fail-closed catalog boundary');
});
test('channel and audio routes both use the shared configured service selector',async()=>{
 for(const file of ['app/api/musicbat/channel/route.ts','app/api/musicbat/channel/audio/route.ts']){
  const source=await readFile(file,'utf8');assert.match(source,/forwardRadio\(request,configuredRadioService\(env\),user\?\.userId \?\? null\)/);assert.doesNotMatch(source,/RADIO_SERVICE|privateRadioService|sandboxD1Radio/);
 }
});
