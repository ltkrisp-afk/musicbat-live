import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signingSecret,redact,cliEnvironment} from './sandbox-purchase-relay.mjs';
test('relay accepts exactly one genuine-shaped CLI signing-secret result',()=>{
 assert.equal(signingSecret('whsec_example\n'),'whsec_example');
 assert.throws(()=>signingSecret('Authorization failed'));
 assert.throws(()=>signingSecret('whsec_one whsec_two'));
});
test('relay redacts secret values and separates CLI OAuth from application keys',()=>{
 assert.equal(redact('secret whsec_example rk_test_example sk_live_example'),'secret [secret hidden] [secret hidden] [secret hidden]');
 assert.deepEqual(cliEnvironment({PATH:'/bin',STRIPE_API_KEY:'secret',STRIPE_SECRET_KEY:'secret',HOME:'/home/example'}),{PATH:'/bin',HOME:'/home/example'});
});
