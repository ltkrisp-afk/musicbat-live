import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripeMode,stripeModeMatches,stripeGet} from '../app/api/musicbat/stripe/stripe.ts';
test('credentials and explicit mode fail closed before any network request',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'fixture'})};
 try {
 for(const [mode,key] of [['live','sk_test_fixture'],['test','sk_live_fixture'],['bad','sk_test_fixture'],['live',undefined],[undefined,'sk_live_fixture']])await assert.rejects(()=>stripeGet({MUSICBAT_STRIPE_MODE:mode,STRIPE_SECRET_KEY:key},'/v1/account'));
 assert.equal(calls,0);
 for(const mode of ['live','test'])await stripeGet({MUSICBAT_STRIPE_MODE:mode,STRIPE_SECRET_KEY:`sk_${mode}_fixture`},'/v1/account');
 assert.equal(calls,2);assert.equal(stripeMode({}),'test');
 for(const mode of ['live','test'])for(const value of [undefined,null,0,1,'true','false'])assert.equal(stripeModeMatches({MUSICBAT_STRIPE_MODE:mode},value),false);
 }finally{globalThis.fetch=old}
});
